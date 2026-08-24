// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
//
// Unified promptfoo provider for BOTH skills' agentic E2E suites: shells out
// to `claude -p` in an isolated sandbox with the configured skills installed,
// drives a real workshop with LXD where the task calls for it, and tears the
// workshop down afterwards. Replaces the two forked per-suite
// provider-claude-cli.js copies (one of which resolved skills from a
// .claude/skills path that does not exist in this checkout — the reason the
// use-workshop agentic baseline sat at TBD from May to August 2026).
//
// Skills are resolved from this file's own location: _testlib/ sits next to
// the skill directories under .github/skills/, so `<skill name>` resolves to
// path.resolve(__dirname, '..', name) with no repo_root plumbing. The
// AGENTIC_REPO_ROOT env var (exported by the run-agentic.sh wrappers) is used
// only to resolve fixture paths, which tasks state relative to the repo root.
//
// Auth: EVAL_AUTH=subscription (default) runs on the local CLI login at $0 —
// see claude-cli-core.js for the exact isolation contract; EVAL_AUTH=api is
// the legacy --bare + ANTHROPIC_API_KEY path with --max-budget-usd as the
// spend rail.
//
// Permission posture (unchanged from the forked copies):
//   - Permission mode: acceptEdits (auto-accept file edits inside the sandbox).
//   - allowedTools: a tight whitelist (union of both suites' historical
//     lists); anything else the agent reaches for halts the run. Tasks extend
//     per-test via vars.extra_allowed_tools.
//   - The sandbox is a fresh tmpdir, scrubbed after each run unless
//     vars.keep_sandbox is set; teardown forcibly removes the configured
//     workshop names and their LXD containers.
//
// Config (per-suite agentic/promptfooconfig.yaml):
//   skills: [use-workshop] | [onboard-workshop, use-workshop]
//   model, agent_timeout_ms, max_budget_usd (api mode only),
//   capture_generated_files: bool  (append the generated-definition dump —
//     used by the onboard suite, whose asserts read it),
//   sandbox_prefix: tmpdir prefix (default 'agentic-eval-')
//
// Per-task vars (agentic/tasks/*.yaml): workshop_name, fixture, task,
// timeout_ms, max_budget_usd, cleanup_workshops, extra_allowed_tools,
// keep_sandbox, model.
//
// Transcript markers ([SYSTEM init], [BASH], [FINAL TEXT],
// --- WORKSHOP STATE AFTER ---, --- GENERATED FILES ---) are preserved
// verbatim from the forked copies so existing task asserts keep passing.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const core = require('./claude-cli-core.js');

// Union of the two suites' historical whitelists.
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

class AgenticProvider {
  constructor(options = {}) {
    this.providerId =
      (options.id) || (options.config && options.config.id) || 'claude-cli-agentic';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}, _callApiContextParams) {
    const cfg = this.config;
    const vars = (context && context.vars) || {};

    const skillsDir = path.resolve(__dirname, '..');
    const repoRoot = path.resolve(
      process.env.AGENTIC_REPO_ROOT || path.resolve(skillsDir, '../..'),
    );

    const skills = Array.isArray(cfg.skills) && cfg.skills.length
      ? cfg.skills
      : ['use-workshop'];
    const skillSrcs = {};
    for (const name of skills) {
      const src = path.join(skillsDir, name);
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

    const cleanupNames = core.parseListVar(vars.cleanup_workshops, [workshopName]);
    const allowedToolsExtra = core.parseListVar(vars.extra_allowed_tools, []);
    const allowedTools = DEFAULT_ALLOWED_TOOLS.concat(allowedToolsExtra);

    const auth = core.resolveAuth(maxBudgetUsd);
    if (auth.error) {
      return { error: auth.error };
    }

    // 1. Set up sandbox dir.
    const sandboxPrefix = String(cfg.sandbox_prefix || 'agentic-eval-');
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), sandboxPrefix));
    try {
      // 1a. Copy fixture into sandbox if specified.
      if (vars.fixture) {
        const fixSrc = path.resolve(repoRoot, String(vars.fixture));
        if (!fs.existsSync(fixSrc)) {
          throw new Error(`fixture not found: ${fixSrc}`);
        }
        core.copyDir(fixSrc, sandbox);
      }

      // 1b. Install the configured skills so the CLI auto-loads them.
      for (const name of skills) {
        const dst = path.join(sandbox, '.claude', 'skills', name);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        core.copyDir(skillSrcs[name], dst);
        // The tests tree is dead weight in a sandbox and slows skill loading.
        fs.rmSync(path.join(dst, 'tests'), { recursive: true, force: true });
      }

      // 1c. Subscription mode: give --setting-sources project a known-empty
      //     project config to resolve to.
      if (auth.subscription) {
        core.writeSandboxSettings(sandbox);
      }

      // 2. Run claude -p with stream-json output.
      const transcriptPath = path.join(sandbox, '.agentic-transcript.jsonl');
      const stderrPath = path.join(sandbox, '.agentic-stderr.log');

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
        cwd: sandbox,
        env: auth.env,
        timeoutMs,
        stdoutFile: transcriptPath,
        stderrFile: stderrPath,
      });

      // 3. Flatten the stream-json into a readable transcript and a digest.
      const { transcriptText, digest } = core.flattenStream(transcriptPath);
      const stderrText = core.readSafe(stderrPath, 4_000);

      // 4. Capture post-state independently of the agent's own commands.
      const workshopState = core.captureWorkshopState(sandbox, cleanupNames);
      // capture_paths (optional) switches the capture from the workshop-shaped
      // dumpTree to an explicit file/dir list — used by the design-sdk suite,
      // whose artifacts (sdkcraft.yaml, VERSION, renovate.json, hooks/, …) the
      // default capture would miss entirely.
      const generatedFiles = cfg.capture_generated_files
        ? (Array.isArray(cfg.capture_paths) && cfg.capture_paths.length
            ? core.dumpPaths(sandbox, cfg.capture_paths)
            : core.dumpTree(sandbox, ['workshop.yaml', '.workshop.yaml', '.gitignore']))
        : null;

      // 5. Compose final output.
      let output =
        transcriptText +
        '\n\n--- WORKSHOP STATE AFTER ---\n```json\n' +
        JSON.stringify(workshopState, null, 2) +
        '\n```\n';
      if (generatedFiles !== null) {
        output += '\n--- GENERATED FILES ---\n' + generatedFiles;
      }
      if (timedOut) {
        output += '\n[harness] task timed out after ' + timeoutMs + 'ms; transcript may be partial\n';
      }
      if (stderrText) {
        output += '\n--- claude stderr (tail) ---\n' + stderrText + '\n';
      }

      // 6. Best-effort teardown.
      const cleanupError = core.teardownWorkshops(sandbox, cleanupNames);

      return {
        output,
        metadata: {
          model,
          auth: auth.subscription ? 'subscription' : 'api',
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

module.exports = AgenticProvider;
