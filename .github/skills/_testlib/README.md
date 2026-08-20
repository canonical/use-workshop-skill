<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# `_testlib` — shared eval tooling

Shared implementation for both skills' `tests/` suites. **Not a skill** — no
`SKILL.md` here, on purpose, so no skill loader ever discovers this directory.

Two consumption patterns:

- **Check scripts** (`check-source-docs.sh`, `check-yaml-keys.py`) and
  `_summarize.py` are invoked directly by each suite's `Makefile` with argv
  flags (`--skill-root`, `--manifest`, `--allowed-keys`, …). No per-suite
  copies.
- **Drivers and providers** (`run-routing.sh`, `regenerate-bundle.sh`,
  `provider-agentic.js`, `provider-routing-cli.js`, `provider-judge-cli.js`,
  `claude-cli-core.js`) are reached through ~10-line wrappers in each suite's
  `scripts/` (or referenced by `file://` path from promptfoo configs). Suite
  deltas live in the wrapper env, not in forked copies.

Auth for anything that shells the `claude` CLI is controlled by `EVAL_AUTH`
(`subscription` default — no API key, bills nothing; `api` opt-in — requires
`ANTHROPIC_API_KEY`). The reconstruction harness's legacy `RECON_AUTH` is
accepted as an alias. See `TESTING.md` at the repo root for the three-lane
doctrine.

History: extracted 2026-08-20 from ~1,200 lines of near-identical per-suite
copies, which had already diverged enough to cause real bugs (a dead
`.claude/skills` resolution path in one agentic provider, a five-levels
`repo_root` hack in the other suite's agentic config).
