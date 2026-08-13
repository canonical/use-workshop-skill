// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
//
// Promptfoo custom provider for the guinea-pig reconstruction eval.
//
// Unlike the agentic provider, the sandbox is PRE-STAGED by
// run-reconstruction.sh: <sandbox>/repo is a scrubbed clean-room copy of a
// real repo (its workshop definition parked at <sandbox>/ground-truth, its
// workshop-CLI traces redacted, both skills pre-installed under
// repo/.claude/skills). This provider:
//   1. runs `claude -p` in <sandbox>/repo with tier-dependent allowed tools
//      (offline tier: generate-and-stop, no launch; full tier: real LXD),
//   2. captures the generated definition files and the parked ground truth,
//   3. runs compare-definition.py and appends its JSON scorecard,
//   4. (full tier) tears the workshop down.
// Asserts then check `"overall_pass": true` plus an llm-rubric comparing
// generated vs ground truth for functional equivalence and honesty.

'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OFFLINE_ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash(sdk *)',
  'Bash(workshop init*)',
  'Bash(ls *)',
  'Bash(cat *)',
  'Bash(pwd)',
  'Bash(echo *)',
  'Bash(mkdir *)',
  'Bash(touch *)',
  'Bash(chmod +x *)',
  'Bash(git ls-files*)',
  'Bash(git status*)',
  'Bash(git log*)',
  'Bash(grep *)',
  'Bash(find *)',
  'Bash(head *)',
  'Bash(wc *)',
];

const FULL_EXTRA_TOOLS = [
  'Bash(workshop *)',
  'Bash(lxc list*)',
  'Bash(lxc info*)',
  'Bash(curl -sf http://localhost*)',
];

class OnboardReconstructionProvider {
  constructor(options = {}) {
    this.providerId =
      (options.id) || (options.config && options.config.id) || 'onboard-reconstruction';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}, _callApiContextParams) {
    const cfg = this.config;
    const vars = (context && context.vars) || {};

    const here = __dirname;
    const sandbox = path.resolve(here, String(vars.sandbox || ''));
    const repoDir = path.join(sandbox, 'repo');
    const gtDir = path.join(sandbox, 'ground-truth');
    if (!vars.sandbox || !fs.existsSync(repoDir) || !fs.existsSync(gtDir)) {
      return { error: `Pre-staged sandbox not found (vars.sandbox=${vars.sandbox}); run via run-reconstruction.sh` };
    }
    const repoName = String(vars.repo_name || path.basename(sandbox));
    const tier = String(vars.tier || 'offline');
    const workshopName = String(vars.workshop_name || 'dev');

    const model =
      vars.model || process.env.RECON_MODEL_OVERRIDE || cfg.model || 'claude-sonnet-4-6';
    const timeoutMs = Number(vars.timeout_ms || cfg.agent_timeout_ms || (tier === 'full' ? 1_800_000 : 900_000));
    const maxBudgetUsd = Number(vars.max_budget_usd || cfg.max_budget_usd || (tier === 'full' ? 8 : 3));
    const taskPrompt = vars.task || prompt;
    if (!taskPrompt || !String(taskPrompt).trim()) {
      return { error: 'No task prompt supplied (set vars.task).' };
    }

    const allowedTools = tier === 'full'
      ? OFFLINE_ALLOWED_TOOLS.concat(FULL_EXTRA_TOOLS)
      : OFFLINE_ALLOWED_TOOLS;

    // RECON_AUTH=subscription runs on the local CLI login instead of the API.
    // `--bare` cannot do that ("Anthropic auth is strictly ANTHROPIC_API_KEY
    // or apiKeyHelper via --settings; OAuth and keychain are never read"), so
    // subscription mode drops it and replaces the isolation it provided with
    // explicit flags. Note --safe-mode is NOT an option: it disables skills,
    // which is the very thing under test.
    const subscription = String(process.env.RECON_AUTH || 'api') === 'subscription';
    const env = { ...process.env };
    if (subscription) {
      delete env.ANTHROPIC_API_KEY;
      delete env.ANTHROPIC_API_TOKEN;
    } else {
      if (!env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_TOKEN) {
        env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_TOKEN;
      }
      if (!env.ANTHROPIC_API_KEY) {
        return { error: 'ANTHROPIC_API_KEY (or ANTHROPIC_API_TOKEN) not set' };
      }
    }

    const transcriptPath = path.join(sandbox, 'transcript.jsonl');
    const stderrPath = path.join(sandbox, 'stderr.log');
    const streamOut = fs.openSync(transcriptPath, 'w');
    const streamErr = fs.openSync(stderrPath, 'w');

    const isolationArgs = subscription
      ? [
          // No --bare, so replace what it suppressed: user-level settings
          // (and therefore any globally installed plugin, including this
          // skill's released build) and every MCP server.
          '--setting-sources', 'project',
          '--strict-mcp-config',
          '--mcp-config', '{"mcpServers":{}}',
        ]
      : [
          '--bare',
          // Budget is an API-call rail; on a subscription cost reports as 0.
          '--max-budget-usd', String(maxBudgetUsd),
        ];

    const claudeArgs = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      ...isolationArgs,
      '--permission-mode', 'acceptEdits',
      '--allowedTools', ...allowedTools,
      '--no-session-persistence',
      String(taskPrompt),
    ];

    const child = spawn('claude', claudeArgs, {
      cwd: repoDir,
      env,
      stdio: ['ignore', streamOut, streamErr],
    });

    const start = Date.now();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch (_) { /* noop */ }
    }, timeoutMs);

    const exitCode = await new Promise((resolve) => {
      child.on('close', (code) => resolve(code));
      child.on('error', () => resolve(-1));
    });
    clearTimeout(timer);
    try { fs.closeSync(streamOut); } catch (_) { /* noop */ }
    try { fs.closeSync(streamErr); } catch (_) { /* noop */ }

    const durationMs = Date.now() - start;
    const { transcriptText, digest } = flattenStream(transcriptPath);
    const stderrText = readSafe(stderrPath, 4_000);

    // Scorecard: deterministic comparison against the parked ground truth.
    const expFile = path.join(here, 'expectations', `${repoName}.json`);
    const cmpArgs = [
      path.join(here, 'compare-definition.py'),
      '--repo-dir', repoDir,
      '--ground-truth', gtDir,
    ];
    if (fs.existsSync(expFile)) {
      cmpArgs.push('--expectations', expFile);
    }
    const cmp = spawnSync('python3', cmpArgs, { encoding: 'utf8', timeout: 60_000 });
    const scorecard = cmp.status === 0
      ? (cmp.stdout || '').trim()
      : JSON.stringify({ overall_pass: false, failures: ['compare-definition.py failed: ' + (cmp.stderr || cmp.error || 'unknown')] });

    const generated = dumpTree(repoDir, ['workshop.yaml', '.workshop.yaml', '.gitignore'], '.workshop');
    const groundTruth = dumpTree(gtDir, ['workshop.yaml', '.workshop.yaml'], '.workshop');

    // Full tier: teardown the launched workshop.
    let cleanupError = null;
    if (tier === 'full') {
      cleanupError = teardownWorkshops(repoDir, [workshopName]);
    }

    const output =
      transcriptText +
      '\n\n--- GENERATED FILES ---\n' + generated +
      '\n\n--- GROUND TRUTH (hidden from the agent) ---\n' + groundTruth +
      '\n\n--- SCORECARD ---\n```json\n' + scorecard + '\n```\n' +
      (timedOut ? '\n[harness] timed out after ' + timeoutMs + 'ms\n' : '') +
      (stderrText ? '\n--- claude stderr (tail) ---\n' + stderrText + '\n' : '');

    return {
      output,
      metadata: {
        model,
        tier,
        auth: subscription ? 'subscription' : 'api',
        repo_name: repoName,
        exit_code: exitCode,
        timed_out: timedOut,
        duration_ms: durationMs,
        digest,
        cleanup_error: cleanupError,
        sandbox_dir: sandbox,
      },
      tokenUsage: digest.tokens || undefined,
      cost: digest.cost,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSafe(file, maxChars = Infinity) {
  try {
    const buf = fs.readFileSync(file, 'utf8');
    if (buf.length > maxChars) {
      return '...[truncated]...\n' + buf.slice(buf.length - maxChars);
    }
    return buf;
  } catch (_) {
    return '';
  }
}

// Dump root files + the .workshop tree (definitions, sdk.yaml, hooks).
function dumpTree(root, rootFiles, wsRel) {
  const out = [];
  const push = (rel) => {
    const p = path.join(root, rel);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      const mode = fs.statSync(p).mode & 0o111 ? ' (executable)' : '';
      out.push('### ' + rel + mode + '\n```\n' + readSafe(p, 8_000) + '\n```');
    }
  };
  for (const f of rootFiles) push(f);
  const wsDir = path.join(root, wsRel);
  if (fs.existsSync(wsDir)) {
    for (const entry of fs.readdirSync(wsDir).sort()) {
      const rel = path.join(wsRel, entry);
      const p = path.join(root, rel);
      if (fs.statSync(p).isFile() && entry.endsWith('.yaml')) {
        push(rel);
      } else if (fs.statSync(p).isDirectory()) {
        push(path.join(rel, 'sdk.yaml'));
        const hooksDir = path.join(p, 'hooks');
        if (fs.existsSync(hooksDir)) {
          for (const hook of fs.readdirSync(hooksDir).sort()) {
            push(path.join(rel, 'hooks', hook));
          }
        }
      }
    }
  }
  return out.length ? out.join('\n\n') : '(none)';
}

function flattenStream(transcriptPath) {
  const lines = readSafe(transcriptPath).split('\n').filter(Boolean);
  const out = [];
  const digest = {
    tokens: { total: 0, prompt: 0, completion: 0, cached: 0 },
    cost: 0,
    bash_commands: [],
    tools_used: [],
    is_error: null,
    final_text: '',
    num_turns: 0,
  };
  for (const line of lines) {
    let evt;
    try { evt = JSON.parse(line); } catch (_) { continue; }
    if (evt.type === 'system' && evt.subtype === 'init') {
      // Record what the session actually loaded: without --bare (subscription
      // mode) contamination from user-level config is possible, and this is
      // the evidence for whether it happened.
      out.push(
        '[SYSTEM init] cwd=' + (evt.cwd || '?') +
        ' model=' + (evt.model || '?') +
        ' apiKeySource=' + (evt.apiKeySource || '?') +
        ' mcp=' + JSON.stringify(evt.mcp_servers || []) +
        ' plugins=' + JSON.stringify(evt.plugins || evt.enabledPlugins || []) +
        ' agents=' + JSON.stringify(evt.agents || [])
      );
      digest.init = {
        apiKeySource: evt.apiKeySource || null,
        mcp_servers: evt.mcp_servers || [],
        plugins: evt.plugins || evt.enabledPlugins || [],
        slash_commands: Array.isArray(evt.slash_commands) ? evt.slash_commands.length : null,
      };
    } else if (evt.type === 'assistant') {
      digest.num_turns++;
      const content = (evt.message && evt.message.content) || [];
      for (const block of content) {
        if (block.type === 'text') {
          out.push('[ASSISTANT TEXT]\n' + block.text);
        } else if (block.type === 'tool_use') {
          digest.tools_used.push(block.name);
          if (block.name === 'Bash') {
            const cmd = (block.input && block.input.command) || '';
            digest.bash_commands.push(cmd);
            out.push('[BASH] ' + cmd);
          } else {
            out.push('[TOOL_USE ' + block.name + '] ' + JSON.stringify(block.input || {}));
          }
        } else if (block.type === 'thinking') {
          out.push('[THINKING] ' + (block.thinking || '').slice(0, 600));
        }
      }
    } else if (evt.type === 'user') {
      const content = (evt.message && evt.message.content) || [];
      for (const block of content) {
        if (block.type === 'tool_result') {
          const txt = typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map(b => (b && b.text) || '').join('\n')
              : JSON.stringify(block.content);
          out.push('[TOOL_RESULT] ' + (txt || '').slice(0, 4000));
        } else if (block.type === 'text') {
          out.push('[USER TEXT] ' + block.text);
        }
      }
    } else if (evt.type === 'result') {
      digest.is_error = !!evt.is_error;
      digest.final_text = evt.result || '';
      digest.cost = evt.total_cost_usd || 0;
      const usage = evt.usage || {};
      digest.tokens.total = usage.total_tokens || 0;
      digest.tokens.prompt = usage.input_tokens || 0;
      digest.tokens.completion = usage.output_tokens || 0;
      digest.tokens.cached = usage.cache_read_input_tokens || 0;
      out.push('[RESULT is_error=' + digest.is_error + ' cost=$' + digest.cost.toFixed(4) + ']');
      if (digest.final_text) out.push('[FINAL TEXT]\n' + digest.final_text);
    }
  }
  return { transcriptText: out.join('\n\n'), digest };
}

function runCmd(cmd, args, cwd, timeoutMs = 60_000) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: process.env,
  });
  return {
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    status: r.status,
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

function teardownWorkshops(cwd, names) {
  const errors = [];
  for (const name of names) {
    const r = runCmd('workshop', ['remove', name], cwd, 120_000);
    if (r.status !== 0) {
      errors.push(`workshop remove ${name} (rc=${r.status}): ${r.stderr || r.error || ''}`.trim());
    }
  }
  try {
    const uid = os.userInfo().uid;
    const project = `workshop.${uid}`;
    const list = runCmd('lxc', ['list', '--project', project, '--format', 'csv', '-c', 'n'], cwd, 30_000);
    if (list.status === 0) {
      const containers = (list.stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
      for (const container of containers) {
        if (!names.some(name => container === name || container.startsWith(name + '-'))) continue;
        const del = runCmd('lxc', ['delete', '--force', '--project', project, container], cwd, 60_000);
        if (del.status !== 0) {
          errors.push(`lxc delete --force ${container} in ${project} (rc=${del.status}): ${del.stderr || del.error || ''}`.trim());
        }
      }
    }
  } catch (e) {
    errors.push(`lxc cleanup probe failed: ${String(e && e.message || e)}`);
  }
  return errors.length ? errors.join(' | ') : null;
}

module.exports = OnboardReconstructionProvider;
