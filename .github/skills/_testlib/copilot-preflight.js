// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
//
// Preflight for the Copilot routing lane (run-routing.sh --copilot). Fails
// once, loudly, instead of erroring every case mid-run:
//   - the SDK is installed (make eval-deps);
//   - the stored Copilot login works;
//   - the account lists the requested model — Copilot otherwise REMAPS an
//     unknown id silently (gpt-5.5 was served as gpt-5.6-sol on 2026-10-19);
//   - one tiny replace-mode, tool-less call is served by that exact model.
// Prints the remaining premium allowance so a run starts with its budget on
// screen. Exit 0 = ready, 2 = not ready (the driver's run-level error code).
//
// Usage: node copilot-preflight.js <model>

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const model = process.argv[2];
  if (!model) {
    console.error('usage: copilot-preflight.js <model>');
    return 2;
  }
  let sdk;
  try {
    sdk = require('@github/copilot-sdk');
  } catch (err) {
    console.error('error: @github/copilot-sdk is not installed — run `make eval-deps` first');
    console.error(`       ${err.message}`);
    return 2;
  }

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-preflight-'));
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  delete env.COPILOT_GITHUB_TOKEN;
  env.COPILOT_AUTO_UPDATE = 'false';
  let client;
  let session;
  try {
    client = new sdk.CopilotClient({ cwd, env, logLevel: 'error' });
    await client.start();

    const ids = [...new Set((await client.listModels()).map((m) => m.id))];
    if (!ids.includes(model)) {
      console.error(`error: this Copilot account does not list model '${model}'.`);
      console.error('       Copilot would silently serve a different model for it. Listed:');
      console.error(`       ${ids.filter((id) => id !== 'auto').join(', ')}`);
      return 2;
    }

    session = await client.createSession({
      model,
      workingDirectory: cwd,
      systemMessage: { mode: 'replace', content: 'Reply with the single word: ok' },
      availableTools: [],
      onPermissionRequest: () => ({ kind: 'reject' }),
    });
    let usage = null;
    session.on('assistant.usage', (ev) => { usage = ev.data || {}; });
    const reply = await session.sendAndWait({ prompt: 'ok' }, 60_000);
    if (!reply || !String(reply.data && reply.data.content || '').trim()) {
      console.error('error: Copilot preflight call returned no answer');
      return 2;
    }
    if (usage && usage.model && usage.model !== model) {
      console.error(`error: requested ${model}, Copilot served ${usage.model}`);
      return 2;
    }
    const quota = usage && usage.quotaSnapshots && usage.quotaSnapshots.premium_interactions;
    if (quota && !quota.isUnlimitedEntitlement) {
      const left = Math.max(0, (quota.entitlementRequests || 0) - (quota.usedRequests || 0));
      console.log(
        `Copilot premium allowance: ${left} of ${quota.entitlementRequests} left ` +
        `(${quota.remainingPercentage}%), resets ${quota.resetDate}`,
      );
    }
    return 0;
  } catch (err) {
    console.error('error: Copilot preflight failed — is the Copilot CLI logged in (copilot login)?');
    console.error(`       ${String((err && err.message) || err).slice(0, 400)}`);
    return 2;
  } finally {
    try { if (session) await session.disconnect(); } catch (_) { /* noop */ }
    try { if (client) await client.stop(); } catch (_) { /* noop */ }
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (_) { /* noop */ }
  }
}

main().then((code) => process.exit(code));
