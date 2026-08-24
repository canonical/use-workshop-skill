<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Testing doctrine

How this repo's three skills (`use-workshop`, `onboard-workshop`,
`design-sdk`) are evaluated — settled 2026-08-20, extended for design-sdk
2026-08-24. Three lanes; the only API key anywhere is `OPENROUTER_API_KEY`,
and Anthropic/OpenAI API spend is **zero by design**.

## The three lanes

| Lane | What | Cost | Keys | Where |
|------|------|------|------|-------|
| **0 — static** | `make check` in all three `tests/` dirs: source-doc paths vs the shared manifest, YAML parse + schema-key lint (incl. the sdkcraft classifier), bundle regen, shellcheck, catalog stamp, hooks exec bits, REUSE | $0 | none | CI, every push/PR |
| **1 — routing gate** | use-workshop's 84-case routing eval: candidate `z-ai/glm-5.2`, judge `gpt-5.5`, both via OpenRouter, backend-pinned | ~$1.41/run | `OPENROUTER_API_KEY` (the repo's only secret) | CI `workflow_dispatch`, or locally (`make eval-routing`) |
| **2 — subscription** | Everything that shells the `claude` CLI on the local subscription login: use-workshop's Sonnet confirmation (`make eval-routing-subscription`), the onboard-workshop and design-sdk routing gates (`make eval-routing` in each), all three agentic E2E suites (`make eval-agentic`), the onboard reconstruction harness (`make eval-reconstruction[-full]`) and design-sdk's one-off SDK-reconstruction round (`make eval-reconstruction` there; candidate `claude-sonnet-5`, pair never re-run). Local Claude judge for all llm-rubric grading | $0 | none | **Local only** — a CI runner has no CLI login |

Lane 2 mechanics: the harness drops `--bare`, **unsets**
`ANTHROPIC_API_KEY`/`ANTHROPIC_API_TOKEN` (a misconfigured run fails loudly
instead of billing), and isolates with `--setting-sources project
--strict-mcp-config --mcp-config '{"mcpServers":{}}'`. Every transcript's
`[SYSTEM init]` line records `apiKeySource=none` as the proof. The CLI still
prints a *nominal* `total_cost_usd`; nothing is billed. `EVAL_AUTH=api` is
the opt-in escape hatch back to `--bare` + `ANTHROPIC_API_KEY`.

## What runs when

- **Every push/PR** — Lane 0 (CI does it; run `make check` locally first).
- **Any skill-content change** — Lane 1 gate for use-workshop
  (`make eval-routing`, iterate until green); onboard and design-sdk changes
  run their Lane 2 gates (`make eval-routing` in each suite, ~20–35 min).
  Editing any `SKILL.md`, reference, or workflow **changes
  `skill-bundle.md`** (regenerated on every run), which changes every prompt
  and invalidates promptfoo's response cache — budget a full re-run, not a
  cached one. Adding or renaming a skill also changes the auto-discovered
  `skill-selection-context.md`, re-opening every suite's skill-selection
  cases.
- **Substantial content change** — add the use-workshop Sonnet confirmation
  (`make eval-routing-subscription`, ~25–45 min, $0): the GLM gate measures
  a proxy; this measures the model family the skills are written for.
- **Workflow/procedure changes** — the affected agentic suite
  (`make eval-agentic`; real LXD, ~15–20 min, $0).
- **Release / re-pin round** — the lot: Lane 1 gate, all Lane 2 routing
  runs, all three agentic suites, reconstruction offline tier
  (`make eval-reconstruction`, 4 SHA-pinned public repos). New rates land in
  the `BASELINE.md` files in the same PR. design-sdk's SDK-reconstruction
  round is one-off calibration, not part of the re-pin set.

Iterating on one case? `--filter-pattern '<description substring>'` on any
routing/agentic driver — partial runs are quarantined under `results/raw/`
and can never overwrite a canonical baseline (the same quarantine catches
errored runs and the empty-run footgun).

## Baselines are per (candidate, judge) pair

The OpenRouter `gpt-5.5` judge and the local Claude judge are different
instruments; the retired `openai:gpt-5.5-2026-04-23` judge was a third.
Never compare rates across pairs — each `BASELINE.md` table carries a judge
column, and a judge change means seeding a new row, not editing an old one.

## Housekeeping

- `make eval-clean` (either suite): drop the generated bundle(s) and
  `results/raw/` (can reach ~750 MB in use-workshop after many raw runs).
- `make -C .github/skills/onboard-workshop/tests eval-clean-all`: also drops
  the reconstruction repo cache and work dirs (~150 MB; re-clones next run).
- Ground truth refresh (maintainer, after a Workshop release):
  `WORKSHOP_REPO=<checkout> make -C .github/skills/use-workshop/tests
  update-docs-manifest` regenerates the shared `docs-manifest.txt` +
  `allowed-keys.json`; `make -C .github/skills/onboard-workshop/tests
  update-sdk-catalog` re-stamps the SDK catalog.
- Versions: promptfoo 0.121.17 everywhere (CI pins it for the gate; Lane 2
  is verified on it too) with claude CLI 2.1.241 (whose binary carries the
  `--system-prompt-file` flag the routing candidate depends on — see
  `_testlib/provider-routing-cli.js`; the design-sdk round also verified
  `--model claude-sonnet-5` on it).

## Layout

Shared implementation lives in `.github/skills/_testlib/` (drivers,
providers, check scripts — see its README); each suite's `tests/` holds only
its configs, scenarios, fixtures, baselines, and ~15-line wrappers. Suite
specifics: `use-workshop/tests/README.md`, `onboard-workshop/tests/README.md`
(+ `reconstruction/README.md` for the guinea-pig harness), and
`design-sdk/tests/README.md` (+ its `reconstruction/README.md` for the
one-off SDK-reconstruction round).
