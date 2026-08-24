// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
//
// Promptfoo custom provider for the design-sdk SDK-reconstruction eval.
//
// The sandbox is PRE-STAGED by run-sdk-reconstruction.sh: <sandbox>/repo is
// an EMPTY working directory (only .claude/skills + project settings) and
// <sandbox>/ground-truth is a detached-worktree copy of the reference SDK
// repo the agent never sees. Unlike the onboard reconstruction there is no
// scrubbing — the candidate starts from a needs-phrased brief, not from a
// repo. This provider:
//   1. runs `claude -p` in <sandbox>/repo with the offline tool whitelist
//      (generate-and-stop: no sdkcraft, no workshop, no network),
//   2. captures the generated SDK tree and the parked reference tree,
//   3. runs compare-sdk.py (expectations-gated scorecard) and appends its
//      JSON to the output.
// Asserts then check `"overall_pass": true` plus an llm-rubric comparing
// generated vs reference for functional equivalence and honesty.

'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../../../_testlib/claude-cli-core.js');

const OFFLINE_ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash(ls *)',
  'Bash(cat *)',
  'Bash(pwd)',
  'Bash(echo *)',
  'Bash(mkdir *)',
  'Bash(touch *)',
  'Bash(chmod +x *)',
  'Bash(grep *)',
  'Bash(find *)',
  'Bash(head *)',
  'Bash(wc *)',
];

// The SDK-repo shape both dumps capture.
const SDK_CAPTURE_PATHS = [
  'sdkcraft.yaml',
  '.sdkcraft.yaml',
  'VERSION',
  'renovate.json',
  'README.md',
  '.gitignore',
  'hooks',
  'services',
  'tests',
  '.github/workflows',
];

class DesignReconstructionProvider {
  constructor(options = {}) {
    this.providerId =
      (options.id) || (options.config && options.config.id) || 'design-reconstruction';
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
      return { error: `Pre-staged sandbox not found (vars.sandbox=${vars.sandbox}); run via run-sdk-reconstruction.sh` };
    }
    const sdkName = String(vars.sdk_name || path.basename(sandbox));

    const model =
      vars.model || process.env.RECON_MODEL_OVERRIDE || cfg.model || 'claude-sonnet-5';
    const timeoutMs = Number(vars.timeout_ms || cfg.agent_timeout_ms || 900_000);
    const maxBudgetUsd = Number(vars.max_budget_usd || cfg.max_budget_usd || 3);
    const taskPrompt = vars.task || prompt;
    if (!taskPrompt || !String(taskPrompt).trim()) {
      return { error: 'No task prompt supplied (set vars.task).' };
    }

    const auth = core.resolveAuth(maxBudgetUsd);
    if (auth.error) {
      return { error: auth.error };
    }

    const transcriptPath = path.join(sandbox, 'transcript.jsonl');
    const stderrPath = path.join(sandbox, 'stderr.log');

    const claudeArgs = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      ...auth.isolationArgs,
      '--permission-mode', 'acceptEdits',
      '--allowedTools', ...OFFLINE_ALLOWED_TOOLS,
      '--no-session-persistence',
      String(taskPrompt),
    ];

    const { exitCode, timedOut, durationMs } = await core.spawnClaude({
      args: claudeArgs,
      cwd: repoDir,
      env: auth.env,
      timeoutMs,
      stdoutFile: transcriptPath,
      stderrFile: stderrPath,
    });

    const { transcriptText, digest } = core.flattenStream(transcriptPath);
    const stderrText = core.readSafe(stderrPath, 4_000);

    // Scorecard: expectations-gated comparison; the reference tree feeds the
    // overlap metrics and the rubric, not the gates.
    const expFile = path.join(here, 'expectations', `${sdkName}.json`);
    const cmpArgs = [
      path.join(here, 'compare-sdk.py'),
      '--repo-dir', repoDir,
      '--ground-truth', gtDir,
      '--expectations', expFile,
    ];
    const cmp = spawnSync('python3', cmpArgs, { encoding: 'utf8', timeout: 60_000 });
    const scorecard = cmp.status === 0
      ? (cmp.stdout || '').trim()
      : JSON.stringify({ overall_pass: false, failures: ['compare-sdk.py failed: ' + (cmp.stderr || cmp.error || 'unknown')] });

    const generated = core.dumpPaths(repoDir, SDK_CAPTURE_PATHS);
    const reference = core.dumpPaths(gtDir, SDK_CAPTURE_PATHS);

    const output =
      transcriptText +
      '\n\n--- GENERATED FILES ---\n' + generated +
      '\n\n--- REFERENCE SDK (hidden from the agent) ---\n' + reference +
      '\n\n--- SCORECARD ---\n```json\n' + scorecard + '\n```\n' +
      (timedOut ? '\n[harness] timed out after ' + timeoutMs + 'ms\n' : '') +
      (stderrText ? '\n--- claude stderr (tail) ---\n' + stderrText + '\n' : '');

    return {
      output,
      metadata: {
        model,
        auth: auth.subscription ? 'subscription' : 'api',
        sdk_name: sdkName,
        exit_code: exitCode,
        timed_out: timedOut,
        duration_ms: durationMs,
        digest,
        sandbox_dir: sandbox,
      },
      tokenUsage: digest.tokens || undefined,
      cost: digest.cost,
    };
  }
}

module.exports = DesignReconstructionProvider;
