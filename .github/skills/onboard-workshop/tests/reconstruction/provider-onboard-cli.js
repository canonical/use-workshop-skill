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

    // Auth + isolation come from the shared core: subscription (default)
    // drops --bare and unsets the key vars — see claude-cli-core.js for the
    // full contract, including why --safe-mode is not an option (it disables
    // skills, the very thing under test).
    const auth = core.resolveAuth(maxBudgetUsd);
    if (auth.error) {
      return { error: auth.error };
    }
    const subscription = auth.subscription;

    const transcriptPath = path.join(sandbox, 'transcript.jsonl');
    const stderrPath = path.join(sandbox, 'stderr.log');

    const claudeArgs = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      ...auth.isolationArgs,
      '--permission-mode', 'acceptEdits',
      '--allowedTools', ...allowedTools,
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

    const generated = core.dumpTree(repoDir, ['workshop.yaml', '.workshop.yaml', '.gitignore'], '.workshop');
    const groundTruth = core.dumpTree(gtDir, ['workshop.yaml', '.workshop.yaml'], '.workshop');

    // Full tier: teardown the launched workshop.
    let cleanupError = null;
    if (tier === 'full') {
      cleanupError = core.teardownWorkshops(repoDir, [workshopName]);
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

// (Helpers live in ../../../_testlib/claude-cli-core.js.)

module.exports = OnboardReconstructionProvider;
