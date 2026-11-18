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
//   1. runs `claude -p` in <sandbox>/repo with a tier-dependent whitelist —
//      offline: generate-and-stop (no sdkcraft, no workshop, no network);
//      full: also sdkcraft + workshop + localhost curl, so the agent runs
//      the skill's try loop in a test workshop named vars.workshop_name,
//   2. captures the generated SDK tree and the parked reference tree,
//   3. runs compare-sdk.py (expectations-gated scorecard) and appends its
//      JSON to the output,
//   4. (full tier) runs the expectations' `online_checks` against the
//      launched workshop itself (_testlib/behavior-checks.js — the harness
//      proves behaviour, not the transcript), captures workshop state, and
//      tears the workshop down.
// Asserts then check `"overall_pass": true` (+ `"behavioral_pass": true` on
// the full tier) plus an llm-rubric comparing generated vs reference for
// functional equivalence and honesty.
//
// Full-tier network: sdkcraft itself downloads what the parts need, but the
// AGENT gets no general curl/git — fetching the published reference SDK
// would contaminate a reconstruction.

'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../../../_testlib/claude-cli-core.js');
const behavior = require('../../../_testlib/behavior-checks.js');

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

// Full tier: the skill's iterate loop (iterate-and-debug.md) on real LXD.
const FULL_EXTRA_TOOLS = [
  'Bash(sdkcraft *)',
  'Bash(workshop *)',
  'Bash(snap list*)',
  'Bash(lxc list*)',
  'Bash(lxc info*)',
  'Bash(curl -sf http://localhost*)',
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
    const tier = String(vars.tier || 'offline');
    const workshopName = String(vars.workshop_name || `recon-${sdkName}`);

    const model =
      vars.model || process.env.RECON_MODEL_OVERRIDE || cfg.model || 'claude-sonnet-5';
    const timeoutMs = Number(vars.timeout_ms || cfg.agent_timeout_ms || (tier === 'full' ? 2_700_000 : 900_000));
    const maxBudgetUsd = Number(vars.max_budget_usd || cfg.max_budget_usd || (tier === 'full' ? 8 : 3));
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

    // Full tier builds into the shared try area (keyed by SDK name): keep the
    // maintainer's own try builds safe (claude-cli-core.js snapshotTryArea).
    const trySnap = tier === 'full' ? core.snapshotTryArea() : null;

    const claudeArgs = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      ...auth.isolationArgs,
      ...core.nonInteractiveArgs(),
      '--permission-mode', 'acceptEdits',
      '--allowedTools', ...(tier === 'full' ? OFFLINE_ALLOWED_TOOLS.concat(FULL_EXTRA_TOOLS) : OFFLINE_ALLOWED_TOOLS),
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

    // Full tier: harness-owned behavioural checks, then state, then teardown
    // (from the project dir that owns the workshop, wherever the agent put
    // its test definition).
    let behaviorSection = '';
    let behaviorSummary = null;
    let cleanupError = null;
    if (tier === 'full') {
      let checks = [];
      try {
        checks = (JSON.parse(fs.readFileSync(expFile, 'utf8')).online_checks) || [];
      } catch (_) { /* no expectations → no checks; reported below */ }
      behaviorSummary = behavior.runBehaviorChecks(workshopName, checks, { sdkDir: repoDir });
      const owner = behavior.findWorkshop(workshopName);
      const projectDir = (owner && owner.project) || repoDir;
      const state = core.captureWorkshopState(projectDir, [workshopName]);
      behaviorSection =
        '\n\n--- BEHAVIORAL CHECKS (run by the harness after the agent) ---\n```json\n' +
        JSON.stringify(behaviorSummary, null, 2) + '\n```\n' +
        '\n--- WORKSHOP STATE AFTER ---\n' +
        'workshop list --global:\n' + (state.workshop_list_global.stdout || state.workshop_list_global.stderr) +
        '\nworkshop info ' + workshopName + ':\n' +
        ((state.per_workshop[workshopName] || {}).info || {}).stdout + '\n';
      cleanupError = core.teardownWorkshops(projectDir, [workshopName]);
    }
    const tryRestore = trySnap ? core.restoreTryArea(trySnap) : null;

    const output =
      transcriptText +
      '\n\n--- GENERATED FILES ---\n' + generated +
      '\n\n--- REFERENCE SDK (hidden from the agent) ---\n' + reference +
      '\n\n--- SCORECARD ---\n```json\n' + scorecard + '\n```\n' +
      behaviorSection +
      (timedOut ? '\n[harness] timed out after ' + timeoutMs + 'ms\n' : '') +
      (stderrText ? '\n--- claude stderr (tail) ---\n' + stderrText + '\n' : '');

    return {
      output,
      metadata: {
        model,
        auth: auth.subscription ? 'subscription' : 'api',
        sdk_name: sdkName,
        tier,
        behavioral_pass: behaviorSummary ? behaviorSummary.behavioral_pass : null,
        cleanup_error: cleanupError,
        try_area_restore: tryRestore,
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
