// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
//
// Promptfoo CANDIDATE provider for the routing suites, backed by the local
// `claude` CLI on the subscription login — the $0 confirmation lane on the
// model family the skills are written for. Single-turn and TOOL-LESS: the
// candidate must answer from the skill bundle alone, exactly like the HTTP
// lane, so `--tools ""` disables the whole tool surface and the call runs
// from an empty scratch cwd (no skills, no CLAUDE.md).
//
// Prompt delivery: promptfoo renders prompt.json into a chat-JSON array
// string ([{role:"system",content:<bundle>},{role:"user",content:<case>}])
// and hands it to callApi. Parsing that — rather than reading
// skill-bundle.md from disk — preserves per-test vars.skill overrides
// (scenarios/skill-selection.yaml swaps in skill-selection-context.md for
// its cases). The system message goes to the CLI via --system-prompt-file:
// the use-workshop bundle is ~151 KB, over Linux's 128 KiB per-argv limit,
// so an inline --system-prompt flag is impossible. --system-prompt-file
// REPLACES the default system prompt — the closest analogue of the HTTP
// eval, where the bundle IS the entire system message. The user message is
// piped on stdin.
//
// Auth is always subscription-style here: API key vars are unset in the
// child env (a misconfigured run fails loudly instead of billing), and
// isolation comes from --setting-sources project + --strict-mcp-config in
// the empty scratch cwd. The HTTP lane exists for API-billed candidates;
// this provider exists only for the $0 lane. NOTE: the CLI still reports a
// nominal total_cost_usd in its result envelope; nothing is billed
// (verify apiKeySource=none in metadata.init).
//
// Config: { model, timeout_ms }. Env overrides: EVAL_ROUTING_MODEL,
// EVAL_ROUTING_TIMEOUT_MS.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const core = require('./claude-cli-core.js');

function parseChatPrompt(prompt, vars) {
  let system = null;
  let user = null;
  try {
    const parsed = JSON.parse(String(prompt));
    if (Array.isArray(parsed)) {
      for (const msg of parsed) {
        if (msg && msg.role === 'system' && typeof msg.content === 'string') {
          system = msg.content;
        } else if (msg && msg.role === 'user' && typeof msg.content === 'string') {
          user = msg.content;
        }
      }
    }
  } catch (_) { /* fall through to vars */ }
  if (system === null && vars && typeof vars.skill === 'string') system = vars.skill;
  if (user === null && vars && typeof vars.user === 'string') user = vars.user;
  if (user === null) user = String(prompt);
  return { system, user };
}

class RoutingCliProvider {
  constructor(options = {}) {
    this.providerId =
      (options.id) || (options.label) || (options.config && options.config.id) ||
      'claude-cli-routing';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}, _params) {
    const cfg = this.config;
    const vars = (context && context.vars) || {};

    const model =
      process.env.EVAL_ROUTING_MODEL || cfg.model || 'claude-sonnet-4-6';
    const timeoutMs = Number(
      process.env.EVAL_ROUTING_TIMEOUT_MS || cfg.timeout_ms || 240_000,
    );

    const { system, user } = parseChatPrompt(prompt, vars);
    if (!system || !String(system).trim()) {
      return { error: 'routing provider: no system message (skill bundle) in the rendered prompt' };
    }
    if (!user || !String(user).trim()) {
      return { error: 'routing provider: no user message in the rendered prompt' };
    }

    // Empty scratch cwd: no skills, no CLAUDE.md, nothing to contaminate the
    // measurement. The system prompt is written here too (tmpfile for
    // --system-prompt-file).
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-eval-'));
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_API_TOKEN;

    try {
      const systemFile = path.join(cwd, 'system-prompt.md');
      fs.writeFileSync(systemFile, String(system));
      core.writeSandboxSettings(cwd);

      const stdoutFile = path.join(cwd, 'stdout.json');
      const stderrFile = path.join(cwd, 'stderr.log');

      const args = [
        '-p',
        '--output-format', 'json',
        '--model', model,
        '--tools', '',
        '--setting-sources', 'project',
        '--strict-mcp-config',
        '--mcp-config', '{"mcpServers":{}}',
        '--no-session-persistence',
        '--system-prompt-file', systemFile,
      ];

      const { exitCode, timedOut, durationMs } = await core.spawnClaude({
        args,
        cwd,
        env,
        timeoutMs,
        stdoutFile,
        stderrFile,
        stdin: String(user),
      });

      const stdout = core.readSafe(stdoutFile);
      const stderr = core.readSafe(stderrFile, 2_000);

      if (timedOut) {
        return { error: `routing candidate timed out after ${timeoutMs}ms (model=${model})` };
      }
      if (exitCode !== 0) {
        return { error: `routing candidate failed (exit=${exitCode}, model=${model}): ${stderr.slice(-1500)}` };
      }

      let envelope;
      try {
        envelope = JSON.parse(stdout);
      } catch (_) {
        return { error: `routing candidate returned unparseable output: ${stdout.slice(0, 1500)}` };
      }
      if (envelope.is_error) {
        return { error: `routing candidate reported is_error: ${String(envelope.result || '').slice(0, 1500)}` };
      }
      const output = String(envelope.result || '');
      if (!output.trim()) {
        return { error: 'routing candidate returned an empty answer' };
      }

      const usage = envelope.usage || {};
      // The CLI reports the system prompt under cache_creation/cache_read
      // rather than input_tokens; fold both in so the prompt column reflects
      // what was actually sent.
      const promptTokens =
        (usage.input_tokens || 0) +
        (usage.cache_creation_input_tokens || 0) +
        (usage.cache_read_input_tokens || 0);
      return {
        output,
        tokenUsage: {
          total: usage.total_tokens || (promptTokens + (usage.output_tokens || 0)),
          prompt: promptTokens,
          completion: usage.output_tokens || 0,
          cached: usage.cache_read_input_tokens || 0,
        },
        // Nominal figure from the CLI; nothing is billed on subscription.
        cost: envelope.total_cost_usd || 0,
        metadata: {
          model,
          auth: 'subscription',
          exit_code: exitCode,
          duration_ms: durationMs,
          num_turns: envelope.num_turns,
        },
      };
    } finally {
      try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (_) { /* noop */ }
    }
  }
}

module.exports = RoutingCliProvider;
