// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
//
// Promptfoo GRADING provider backed by the local `claude` CLI, so a
// reconstruction run can be graded on a Claude subscription instead of the
// pinned gpt-5.5 API judge. Selected by run-reconstruction.sh when
// RECON_JUDGE=local:
//
//   promptfoo eval --grader file://provider-judge-cli.js
//
// Contract: promptfoo hands us the rendered rubric prompt and expects JSON
// {reason, pass, score} back. We ask the CLI for exactly that shape via
// --json-schema, run it tool-less in a scratch cwd (so the sandbox's
// .claude/skills — the thing under test — cannot influence its own grade),
// and normalise the 1-5 scale the rubric asks for down to promptfoo's 0-1.

'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VERDICT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    reason: { type: 'string' },
    pass: { type: 'boolean' },
    score: { type: 'number' },
  },
  required: ['reason', 'pass', 'score'],
});

// The graded output embeds a whole agent transcript; keep the head (analysis,
// verdict, process) and the tail (generated files, ground truth, scorecard),
// which is where every rubric criterion is actually decided.
const MAX_PROMPT_CHARS = 400_000;

function clamp(text) {
  if (text.length <= MAX_PROMPT_CHARS) return text;
  const head = Math.floor(MAX_PROMPT_CHARS * 0.4);
  const tail = MAX_PROMPT_CHARS - head;
  return (
    text.slice(0, head) +
    `\n\n...[${text.length - MAX_PROMPT_CHARS} chars elided by the judge harness]...\n\n` +
    text.slice(text.length - tail)
  );
}

function extractJson(raw) {
  if (raw && typeof raw === 'object') return raw;
  const text = String(raw || '').trim();
  const candidates = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.push(fenced[1]);
  candidates.push(text);
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) candidates.push(braced[0]);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) { /* try the next shape */ }
  }
  return null;
}

class LocalClaudeJudge {
  constructor(options = {}) {
    this.providerId = options.id || (options.config && options.config.id) || 'local-claude-judge';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, _context, _params) {
    const model =
      process.env.RECON_JUDGE_MODEL || this.config.model || 'claude-sonnet-4-6';
    const timeoutMs = Number(process.env.RECON_JUDGE_TIMEOUT_MS || this.config.timeout_ms || 600_000);

    // Grade from a scratch directory: no project skills, no CLAUDE.md, and
    // nothing the agent under test wrote.
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-judge-'));
    const env = { ...process.env };
    if (String(process.env.RECON_AUTH || 'api') === 'subscription') {
      delete env.ANTHROPIC_API_KEY;
      delete env.ANTHROPIC_API_TOKEN;
    }

    const args = [
      '-p',
      '--output-format', 'json',
      '--model', model,
      '--tools', '',
      '--setting-sources', 'project',
      '--strict-mcp-config',
      '--mcp-config', '{"mcpServers":{}}',
      '--json-schema', VERDICT_SCHEMA,
      '--no-session-persistence',
    ];

    const body =
      clamp(String(prompt || '')) +
      '\n\nRespond with ONLY a JSON object: {"reason": "<2-4 sentences citing ' +
      'specifics>", "pass": <true|false>, "score": <1-5>}. No prose outside it.';

    let stdout = '';
    let stderr = '';
    const child = spawn('claude', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.stdin.end(body);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch (_) { /* noop */ }
    }, timeoutMs);
    const exitCode = await new Promise((resolve) => {
      child.on('close', resolve);
      child.on('error', () => resolve(-1));
    });
    clearTimeout(timer);
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (_) { /* noop */ }

    if (timedOut || exitCode !== 0) {
      return {
        error: `local judge failed (exit=${exitCode}, timedOut=${timedOut}): ${stderr.slice(-2000)}`,
      };
    }

    // --output-format json wraps the answer; the answer itself is our schema.
    const envelope = extractJson(stdout);
    const verdict =
      extractJson(envelope && (envelope.result !== undefined ? envelope.result : envelope)) ||
      extractJson(stdout);
    if (!verdict || typeof verdict.pass !== 'boolean') {
      return {
        error: `local judge returned no parseable verdict: ${stdout.slice(0, 2000)}`,
      };
    }

    // The rubric asks for 1-5; promptfoo scores 0-1.
    let score = Number(verdict.score);
    if (!Number.isFinite(score)) score = verdict.pass ? 1 : 0;
    if (score > 1) score = score / 5;

    return {
      output: JSON.stringify({
        reason: String(verdict.reason || ''),
        pass: verdict.pass,
        score,
      }),
      tokenUsage: (envelope && envelope.usage)
        ? {
            total: envelope.usage.total_tokens || 0,
            prompt: envelope.usage.input_tokens || 0,
            completion: envelope.usage.output_tokens || 0,
          }
        : undefined,
    };
  }
}

module.exports = LocalClaudeJudge;
