// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
//
// Shared plumbing for every promptfoo provider that shells out to the
// `claude` CLI (agentic tasks, reconstruction candidate, tool-less routing
// candidate, local judge). Extracted 2026-08-20 from three near-identical
// provider files; the flattenStream here is the richer reconstruction
// variant, which records apiKeySource/mcp/plugins on the [SYSTEM init] line —
// the evidence that a subscription-mode run really used the CLI login
// (apiKeySource=none) and loaded nothing from user-level config.
//
// Auth modes (resolveAuth):
//   subscription (default) — run on the local CLI login. `--bare` cannot do
//     that (its Anthropic auth is strictly ANTHROPIC_API_KEY; OAuth/keychain
//     are never read), so this mode DROPS --bare, UNSETS the API key vars
//     (guaranteeing $0 API spend — a misconfigured call fails loudly instead
//     of billing), and replaces --bare's isolation with explicit flags:
//     `--setting-sources project --strict-mcp-config --mcp-config
//     '{"mcpServers":{}}'`. Note --safe-mode is NOT an option: it disables
//     skills, the very thing under test. There is no --max-budget-usd rail in
//     this mode either — budget is an API-call concept and reports 0 on a
//     subscription — so the timeout is the only rail.
//   api — legacy: `--bare` + ANTHROPIC_API_KEY (ANTHROPIC_API_TOKEN bridged),
//     with --max-budget-usd as the spend rail.
//
// Mode selection: EVAL_AUTH env var; the reconstruction harness's legacy
// RECON_AUTH is accepted as an alias. Default: subscription.

'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// --------------------------------------------------------------------------
// Auth / isolation
// --------------------------------------------------------------------------

function authMode() {
  return String(process.env.EVAL_AUTH || process.env.RECON_AUTH || 'subscription');
}

// Returns { subscription, env, isolationArgs, error }.
// maxBudgetUsd only applies in api mode (see header).
function resolveAuth(maxBudgetUsd) {
  const subscription = authMode() === 'subscription';
  const env = { ...process.env };
  if (subscription) {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_API_TOKEN;
    return {
      subscription,
      env,
      isolationArgs: [
        '--setting-sources', 'project',
        '--strict-mcp-config',
        '--mcp-config', '{"mcpServers":{}}',
      ],
      error: null,
    };
  }
  if (!env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_TOKEN) {
    env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_TOKEN;
  }
  if (!env.ANTHROPIC_API_KEY) {
    return {
      subscription,
      env,
      isolationArgs: [],
      error: 'EVAL_AUTH=api but ANTHROPIC_API_KEY (or ANTHROPIC_API_TOKEN) not set',
    };
  }
  return {
    subscription,
    env,
    isolationArgs: ['--bare', '--max-budget-usd', String(maxBudgetUsd)],
    error: null,
  };
}

// In subscription mode a sandbox carries an explicit project settings file so
// `--setting-sources project` resolves to a known-empty config (no hooks, no
// plugins) rather than to nothing at all.
function writeSandboxSettings(dir) {
  const claudeDir = path.join(dir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const p = path.join(claudeDir, 'settings.json');
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify({ hooks: {}, enabledPlugins: {} }) + '\n');
  }
}

// --------------------------------------------------------------------------
// Process running
// --------------------------------------------------------------------------

// Spawn `claude` with stdout/stderr streamed to files; SIGKILL on timeout.
// Returns { exitCode, timedOut, durationMs }.
async function spawnClaude({ args, cwd, env, timeoutMs, stdoutFile, stderrFile, stdin }) {
  const streamOut = fs.openSync(stdoutFile, 'w');
  const streamErr = fs.openSync(stderrFile, 'w');
  const child = spawn('claude', args, {
    cwd,
    env,
    stdio: [stdin === undefined ? 'ignore' : 'pipe', streamOut, streamErr],
  });
  if (stdin !== undefined) {
    child.stdin.write(String(stdin));
    child.stdin.end();
  }

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

  return { exitCode, timedOut, durationMs: Date.now() - start };
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

// --------------------------------------------------------------------------
// Files
// --------------------------------------------------------------------------

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

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

// Dump root files + the .workshop tree (definitions, sdk.yaml, hooks) so
// asserts can check generated artifacts independent of the transcript.
function dumpTree(root, rootFiles, wsRel = '.workshop') {
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

// --------------------------------------------------------------------------
// Transcript flattening
// --------------------------------------------------------------------------

// Convert a claude --output-format stream-json file (one JSON object per
// line) into a flat human/asserts-readable transcript and a digest of totals.
// The [SYSTEM init] line records apiKeySource/mcp/plugins — in subscription
// mode (no --bare) contamination from user-level config is possible, and this
// is the evidence for whether it happened.
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

// --------------------------------------------------------------------------
// Promptfoo var parsing
// --------------------------------------------------------------------------

// Parse a promptfoo var that might be a real list, a JSON-encoded list
// string, or a comma-separated string. Strips empties. (promptfoo treats
// list-valued vars as a parameter sweep, so tasks pass lists as strings.)
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

// --------------------------------------------------------------------------
// Workshop state capture / teardown
// --------------------------------------------------------------------------

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

// 1. Ask workshop to remove; 2. LXD-level prefix cleanup as a safety net for
//    containers a half-failed launch leaves behind.
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

module.exports = {
  authMode,
  resolveAuth,
  writeSandboxSettings,
  spawnClaude,
  runCmd,
  readSafe,
  copyDir,
  dumpTree,
  flattenStream,
  parseListVar,
  captureWorkshopState,
  teardownWorkshops,
};
