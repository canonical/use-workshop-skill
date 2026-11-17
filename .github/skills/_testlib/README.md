<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# `_testlib` — shared eval tooling

Shared implementation for both skills' `tests/` suites. **Not a skill** — no
`SKILL.md` here, on purpose, so no skill loader ever discovers this directory.

Two consumption patterns:

- **Check scripts** (`check-source-docs.sh`, `check-yaml-keys.py`,
  `check-scenarios.py`, `check-contracts.py`) and `_summarize.py` are invoked directly by each
  suite's `Makefile` with argv flags (`--skill-root`, `--manifest`,
  `--allowed-keys`, `--tests-dir`, …). No per-suite copies.
- **Drivers and providers** (`run-routing.sh`, `regenerate-bundle.sh`,
  `provider-agentic.js`, `provider-routing-cli.js`,
  `provider-routing-copilot.js`, `provider-judge-cli.js`, with
  `claude-cli-core.js`, `routing-prompt.js` and `copilot-preflight.js`
  behind them) are reached through ~10-line wrappers in each suite's
  `scripts/` (or referenced by `file://` path from promptfoo configs). Suite
  deltas live in the wrapper env, not in forked copies.
- **`check-contracts.py`** — stdlib-only contract gate for a skill's
  machine-readable hand-off blocks (today: onboard-workshop's
  `references/onboarding-verdict.schema.json`). `--self-test` proves the
  `valid/` fixtures pass and the `invalid/` ones fail (cross-checked with
  `jsonschema` when it happens to be installed); `--transcript` extracts
  the last fenced block for a scorer. Unsupported schema keywords exit 2
  rather than being ignored.
- **`behavior-checks.js`** — harness-owned checks against a launched
  workshop (`exec_ok`, `exec_output_matches`, `service_active`,
  `http_status`, `wait_for_port`, `persists_across_refresh`), run after the
  agent exits and before teardown. Used by design-sdk's full-tier
  reconstruction.
- **Non-interactive mode** — every provider that runs an agent (agentic,
  both reconstructions; never the judge or the routing candidate) adds
  `claude-cli-core.js` `nonInteractiveArgs()`: AskUserQuestion,
  ScheduleWakeup and CronCreate are denied, and an appended directive makes
  the agent decide by the skill's own defaults and list those choices under
  `## Decisions`.

The last three borrow from rascheel/snap-packager-skill-test and
rascheel/scheel-skills (lib.sh assertions, validate_contracts.py, the
NONINTERACTIVE_DIRECTIVE).

Auth for anything that shells the `claude` CLI is controlled by `EVAL_AUTH`
(`subscription` default — no API key, bills nothing; `api` opt-in — requires
`ANTHROPIC_API_KEY`). The reconstruction harness's legacy `RECON_AUTH` is
accepted as an alias. The Copilot routing candidate uses the stored Copilot
login and the `@github/copilot-sdk` from the repo-root `package.json`
(`make eval-deps`); it is graded by the same local claude judge. See
`TESTING.md` at the repo root for the lane doctrine.

History: extracted 2026-08-20 from ~1,200 lines of near-identical per-suite
copies, which had already diverged enough to cause real bugs (a dead
`.claude/skills` resolution path in one agentic provider, a five-levels
`repo_root` hack in the other suite's agentic config).
