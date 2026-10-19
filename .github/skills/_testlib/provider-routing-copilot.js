// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
//
// Promptfoo CANDIDATE provider for the routing suites, backed by GitHub
// Copilot on the local Copilot login — the cross-vendor lane. The skills ship
// to Copilot users as well as Claude Code users, and this lane measures how a
// non-Claude model routes through them. Single-turn and TOOL-LESS, like the
// claude subscription lane: the candidate answers from the skill bundle alone.
//
// Delivery: the Copilot SDK (@github/copilot-sdk, pinned in package.json,
// installed by `make eval-deps`), not the `copilot` CLI. The CLI has no
// --system-prompt-file, and its instruction files (AGENTS.md etc.) APPEND to
// Copilot's own coding-agent prompt. The SDK's
// `systemMessage: { mode: 'replace' }` sends the bundle as the entire system
// message — verified 2026-10-19 from the session's messages snapshot: the
// system turn is exactly our text, and the only addition is a
// <current_datetime> line Copilot prefixes to the user turn.
// `availableTools: []` disables every built-in and MCP tool (the session
// reports them all disabled), and the permission handler rejects anything
// that asks anyway. The prompt itself (bundle + harness note) comes from
// routing-prompt.js, shared with the claude lane, so the two lanes differ in
// model only.
//
// Model pinning: Copilot silently REMAPS model ids it does not serve — a
// request for `gpt-5.5` was answered by `gpt-5.6-sol` on 2026-10-19 with no
// error. The served model is read back from every `assistant.usage` event and
// a mismatch is returned as an error, so a remap quarantines the run instead
// of landing in a baseline under the wrong name.
//
// Auth and billing: the SDK uses the stored Copilot login (useLoggedInUser).
// GH_TOKEN / GITHUB_TOKEN / COPILOT_GITHUB_TOKEN are scrubbed from the child
// env because they take precedence over the stored login. Unlike the claude
// lane this is NOT free: each call draws on the account's monthly premium
// allowance. `cost` stays 0 (promptfoo treats it as USD); the real figures go
// to metadata.ai_credits (from copilotUsage.totalNanoAiu) and
// metadata.premium_requests.
//
// Config: { model, timeout_ms }. Env overrides: EVAL_COPILOT_MODEL,
// EVAL_ROUTING_TIMEOUT_MS.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { withHarnessNote, parseChatPrompt } = require('./routing-prompt.js');

const DEFAULT_MODEL = 'gpt-5.6-sol';

function loadSdk() {
  try {
    return require('@github/copilot-sdk');
  } catch (err) {
    throw new Error(
      'cannot load @github/copilot-sdk — run `make eval-deps` in the suite\'s ' +
      `tests/ directory (installs node_modules at the repo root): ${err.message}`,
    );
  }
}

class RoutingCopilotProvider {
  constructor(options = {}) {
    this.providerId =
      (options.id) || (options.label) || (options.config && options.config.id) ||
      'copilot-routing';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}, _params) {
    const cfg = this.config;
    const vars = (context && context.vars) || {};

    const model = process.env.EVAL_COPILOT_MODEL || cfg.model || DEFAULT_MODEL;
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

    let sdk;
    try {
      sdk = loadSdk();
    } catch (err) {
      return { error: err.message };
    }

    // Empty scratch cwd, as in the claude lane: nothing in it can be read
    // (no tools), and it keeps the runtime away from any project config.
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-eval-copilot-'));
    const env = { ...process.env };
    delete env.GH_TOKEN;
    delete env.GITHUB_TOKEN;
    delete env.COPILOT_GITHUB_TOKEN;
    env.COPILOT_AUTO_UPDATE = 'false';

    const started = Date.now();
    const usage = [];
    let toolEvents = 0;
    let client;
    let session;
    try {
      client = new sdk.CopilotClient({ cwd, env, logLevel: 'error' });
      await client.start();
      session = await client.createSession({
        model,
        workingDirectory: cwd,
        systemMessage: { mode: 'replace', content: withHarnessNote(system) },
        availableTools: [],
        onPermissionRequest: () => ({ kind: 'reject', feedback: 'no tools in this harness' }),
      });
      session.on((ev) => {
        if (ev.type === 'assistant.usage') usage.push(ev.data || {});
        else if (ev.type === 'tool.execution_start') toolEvents += 1;
      });

      let message;
      try {
        message = await session.sendAndWait({ prompt: String(user) }, timeoutMs);
      } catch (err) {
        const msg = String((err && err.message) || err);
        if (/timeout|timed out/i.test(msg)) {
          return { error: `routing candidate timed out after ${timeoutMs}ms (model=${model})` };
        }
        return { error: `routing candidate failed (model=${model}): ${msg.slice(0, 1500)}` };
      }
      const durationMs = Date.now() - started;

      const served = [...new Set(usage.map((u) => u.model).filter(Boolean))];
      if (served.length && served.some((m) => m !== model)) {
        return {
          error: `copilot served ${served.join(', ')} for requested model ${model} — ` +
            'pin a model id the account serves (see `make eval-routing-copilot` preflight)',
        };
      }
      if (toolEvents > 0) {
        return { error: `routing candidate ran ${toolEvents} tool call(s) despite availableTools: [] — instrument breach` };
      }

      const output = String((message && message.data && message.data.content) || '');
      if (!output.trim()) {
        return { error: 'routing candidate returned an empty answer' };
      }

      const sum = (key) => usage.reduce((acc, u) => acc + (Number(u[key]) || 0), 0);
      const promptTokens = sum('inputTokens');
      const completionTokens = sum('outputTokens');
      const nanoAiu = usage.reduce(
        (acc, u) => acc + (Number(u.copilotUsage && u.copilotUsage.totalNanoAiu) || 0), 0);
      return {
        output,
        tokenUsage: {
          total: promptTokens + completionTokens,
          prompt: promptTokens,
          completion: completionTokens,
          cached: sum('cacheReadTokens'),
        },
        // Copilot bills premium allowance, not USD; see metadata.
        cost: 0,
        metadata: {
          model,
          served_model: served.join(', ') || null,
          auth: 'copilot',
          duration_ms: durationMs,
          model_calls: usage.length,
          premium_requests: sum('cost'),
          ai_credits: nanoAiu / 1e9,
        },
      };
    } catch (err) {
      return { error: `copilot candidate failed (model=${model}): ${String((err && err.message) || err).slice(0, 1500)}` };
    } finally {
      try { if (session) await session.disconnect(); } catch (_) { /* noop */ }
      try { if (client) await client.stop(); } catch (_) { /* noop */ }
      try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (_) { /* noop */ }
    }
  }
}

module.exports = RoutingCopilotProvider;
module.exports.DEFAULT_MODEL = DEFAULT_MODEL;
