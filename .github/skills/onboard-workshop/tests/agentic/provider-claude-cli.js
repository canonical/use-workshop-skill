// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
//
// Promptfoo custom provider for onboard-workshop agentic tasks: shells out to
// `claude -p` in an isolated sandbox with BOTH skills installed
// (onboard-workshop routes operating questions to its sibling use-workshop,
// so a realistic sandbox carries both).
//
// Adapted from ../../use-workshop/tests/agentic/provider-claude-cli.js with
// two deliberate changes:
//   - Skills are resolved from <repoRoot>/.github/skills/<name> (the actual
//     checkout layout; the sibling provider's .claude/skills path does not
//     exist in a fresh clone).
//   - Both skills are copied into the sandbox's .claude/skills/.
// Everything else (permission posture, stream-json flattening, state capture,
// teardown) mirrors the sibling provider — see its header for rationale.

'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SKILLS = ['onboard-workshop', 'use-workshop'];

// Onboarding tasks read manifests and generate definitions; they need the
// same operating patterns as the sibling plus git-archive-style inspection.
const DEFAULT_ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash(workshop *)',
  'Bash(sdk *)',
  'Bash(lxc list*)',
  'Bash(lxc info*)',
  'Bash(ls *)',
  'Bash(cat *)',
  'Bash(pwd)',
  'Bash(echo *)',
  'Bash(mkdir *)',
  'Bash(touch *)',
  'Bash(chmod +x *)',
  'Bash(git status*)',
  'Bash(git diff*)',
  'Bash(git log*)',
  'Bash(git ls-files*)',
  'Bash(grep *)',
  'Bash(find *)',
  'Bash(curl -sf http://localhost*)',
];

class ClaudeCliProvider {
  constructor(options = {}) {
    this.providerId =
      (options.id) || (options.config && options.config.id) || 'claude-cli-onboard-agentic';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}, _callApiContextParams) {
    const cfg = this.config;
    const vars = (context && context.vars) || {};

    const repoRoot = path.resolve(
      process.env.AGENTIC_REPO_ROOT || cfg.repo_root || process.cwd(),
    );
    const skillSrcs = {};
    for (const name of SKILLS) {
      const src = path.join(repoRoot, '.github', 'skills', name);
      if (!fs.existsSync(src)) {
        return { error: `Skill source not found at ${src}` };
      }
      skillSrcs[name] = src;
    }

    const model =
      vars.model ||
      process.env.AGENTIC_MODEL_OVERRIDE ||
      cfg.model ||
      'claude-sonnet-4-6';
    const timeoutMs = Number(vars.timeout_ms || cfg.agent_timeout_ms || 900_000);
    const maxBudgetUsd = Number(vars.max_budget_usd || cfg.max_budget_usd || 3);
    const workshopName = vars.workshop_name || 'agentic-test';
    const taskPrompt = vars.task || prompt;
    if (!taskPrompt || !String(taskPrompt).trim()) {
      return { error: 'No task prompt supplied (set vars.task or pass a prompt).' };
    }

    const cleanupNames = parseListVar(vars.cleanup_workshops, [workshopName]);
    const allowedToolsExtra = parseListVar(vars.extra_allowed_tools, []);
    const allowedTools = DEFAULT_ALLOWED_TOOLS.concat(allowedToolsExtra);

    // 1. Set up sandbox dir.
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'onboard-agentic-'));
    try {
      // 1a. Copy fixture into sandbox if specified.
      if (vars.fixture) {
        const fixSrc = path.resolve(repoRoot, String(vars.fixture));
        if (!fs.existsSync(fixSrc)) {
          throw new Error(`fixture not found: ${fixSrc}`);
        }
        copyDir(fixSrc, sandbox);
      }

      // 1b. Install BOTH skills so cross-skill routing works in the sandbox.
      for (const name of SKILLS) {
        const dst = path.join(sandbox, '.claude', 'skills', name);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        copyDir(skillSrcs[name], dst);
        // The tests tree is dead weight in a sandbox and slows skill loading.
        fs.rmSync(path.join(dst, 'tests'), { recursive: true, force: true });
      }

      // 1c. Bridge token name. claude --bare requires ANTHROPIC_API_KEY.
      const env = { ...process.env };
      if (!env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_TOKEN) {
        env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_TOKEN;
      }
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY (or ANTHROPIC_API_TOKEN) not set');
      }

      // 2. Run claude -p with stream-json output.
      const transcriptPath = path.join(sandbox, '.agentic-transcript.jsonl');
      const stderrPath = path.join(sandbox, '.agentic-stderr.log');
      const streamOut = fs.openSync(transcriptPath, 'w');
      const streamErr = fs.openSync(stderrPath, 'w');

      const claudeArgs = [
        '--bare',
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--model', model,
        '--max-budget-usd', String(maxBudgetUsd),
        '--permission-mode', 'acceptEdits',
        '--allowedTools', ...allowedTools,
        '--no-session-persistence',
        String(taskPrompt),
      ];

      const child = spawn('claude', claudeArgs, {
        cwd: sandbox,
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

      // 3. Flatten the stream-json into a readable transcript and a digest.
      const { transcriptText, digest } = flattenStream(transcriptPath);
      const stderrText = readSafe(stderrPath, 4_000);

      // 4. Capture post-state independently of the agent's own commands,
      //    including every definition/SDK file the agent generated.
      const workshopState = captureWorkshopState(sandbox, cleanupNames);
      const generatedFiles = captureGeneratedFiles(sandbox);

      // 5. Compose final output.
      const stateAppendix =
        '\n\n--- WORKSHOP STATE AFTER ---\n```json\n' +
        JSON.stringify(workshopState, null, 2) +
        '\n```\n' +
        '\n--- GENERATED FILES ---\n' +
        generatedFiles;
      const timeoutNote = timedOut
        ? '\n[harness] task timed out after ' + timeoutMs + 'ms; transcript may be partial\n'
        : '';
      const stderrNote = stderrText
        ? '\n--- claude stderr (tail) ---\n' + stderrText + '\n'
        : '';
      const output = transcriptText + stateAppendix + timeoutNote + stderrNote;

      // 6. Best-effort teardown.
      const cleanupError = teardownWorkshops(sandbox, cleanupNames);

      return {
        output,
        metadata: {
          model,
          exit_code: exitCode,
          timed_out: timedOut,
          duration_ms: durationMs,
          digest,
          workshop_state: workshopState,
          cleanup_error: cleanupError,
          sandbox_dir: sandbox,
          transcript_path: transcriptPath,
        },
        tokenUsage: digest.tokens || undefined,
        cost: digest.cost,
      };
    } finally {
      if (!vars.keep_sandbox) {
        try { fs.rmSync(sandbox, { recursive: true, force: true }); }
        catch (_) { /* noop */ }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

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

// Dump every definition/SDK file under the sandbox (root workshop.yaml,
// .workshop/*.yaml, .workshop/*/sdk.yaml, hooks) so asserts can check the
// generated artifacts independent of the transcript.
function captureGeneratedFiles(sandbox) {
  const out = [];
  const push = (rel) => {
    const p = path.join(sandbox, rel);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      const mode = fs.statSync(p).mode & 0o111 ? ' (executable)' : '';
      out.push('### ' + rel + mode + '\n```\n' + readSafe(p, 8_000) + '\n```');
    }
  };
  push('workshop.yaml');
  push('.workshop.yaml');
  push('.gitignore');
  const wsDir = path.join(sandbox, '.workshop');
  if (fs.existsSync(wsDir)) {
    for (const entry of fs.readdirSync(wsDir)) {
      const rel = path.join('.workshop', entry);
      const p = path.join(sandbox, rel);
      if (fs.statSync(p).isFile() && entry.endsWith('.yaml')) {
        push(rel);
      } else if (fs.statSync(p).isDirectory()) {
        push(path.join(rel, 'sdk.yaml'));
        const hooksDir = path.join(p, 'hooks');
        if (fs.existsSync(hooksDir)) {
          for (const hook of fs.readdirSync(hooksDir)) {
            push(path.join(rel, 'hooks', hook));
          }
        }
      }
    }
  }
  return out.length ? out.join('\n\n') : '(none)';
}

// Convert a claude --output-format stream-json file (one JSON object per line)
// into a flat human/asserts-readable transcript and a digest of totals.
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
      out.push('[SYSTEM init] cwd=' + (evt.cwd || '?') + ' model=' + (evt.model || '?'));
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

function captureWorkshopState(cwd, names) {
  const state = {
    workshop_list_global: runCmd('workshop', ['list', '--global'], cwd, 30_000),
    workshop_changes: runCmd('workshop', ['changes'], cwd, 30_000),
    per_workshop: {},
    lxc_orphans: null,
  };
  for (const name of names) {
    state.per_workshop[name] = {
      info: runCmd('workshop', ['info', name], cwd, 30_000),
    };
  }
  state.lxc_orphans = runCmd(
    'lxc',
    ['list', '--all-projects', '--format', 'csv', '-c', 'np'],
    cwd,
    30_000,
  );
  return state;
}

// Parse a promptfoo var that might be a real list, a JSON-encoded list
// string, or a comma-separated string. Strips empties.
function parseListVar(raw, fallback) {
  if (Array.isArray(raw)) {
    const list = raw.map(s => String(s).trim()).filter(Boolean);
    return list.length ? list : fallback;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const list = parsed.map(s => String(s).trim()).filter(Boolean);
          if (list.length) return list;
        }
      } catch (_) { /* fall through to comma split */ }
    }
    if (trimmed.includes(',')) {
      const list = trimmed.split(',').map(s => s.trim()).filter(Boolean);
      if (list.length) return list;
    }
    if (trimmed) return [trimmed];
  }
  return fallback;
}

function teardownWorkshops(cwd, names) {
  const errors = [];
  // 1. Ask workshop to remove; 2. LXD-level prefix cleanup as safety net —
  //    see the sibling provider for the rationale.
  for (const name of names) {
    const r = runCmd('workshop', ['remove', name], cwd, 120_000);
    if (r.status !== 0) {
      errors.push(`workshop remove ${name} (rc=${r.status}): ${r.stderr || r.error || ''}`.trim());
    }
  }
  try {
    const uid = os.userInfo().uid;
    const project = `workshop.${uid}`;
    const list = runCmd(
      'lxc',
      ['list', '--project', project, '--format', 'csv', '-c', 'n'],
      cwd,
      30_000,
    );
    if (list.status === 0) {
      const containers = (list.stdout || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      for (const container of containers) {
        if (!names.some(name => container === name || container.startsWith(name + '-'))) {
          continue;
        }
        const del = runCmd(
          'lxc',
          ['delete', '--force', '--project', project, container],
          cwd,
          60_000,
        );
        if (del.status !== 0) {
          errors.push(
            `lxc delete --force ${container} in ${project} (rc=${del.status}): ` +
            `${del.stderr || del.error || ''}`.trim(),
          );
        }
      }
    }
  } catch (e) {
    errors.push(`lxc cleanup probe failed: ${String(e && e.message || e)}`);
  }
  return errors.length ? errors.join(' | ') : null;
}

module.exports = ClaudeCliProvider;
