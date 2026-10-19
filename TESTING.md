<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Testing doctrine

How this repo's three skills (`use-workshop`, `onboard-workshop`,
`design-sdk`) are evaluated. Settled 2026-08-20, extended for design-sdk
2026-08-24, re-laned 2026-10-19 when the OpenRouter budget ran out: the
gates now run on two local logins — the `claude` CLI subscription and
GitHub Copilot — and Anthropic/OpenAI API spend stays **zero by design**.

## The lanes

| Lane | What | Cost | Keys | Where |
|------|------|------|------|-------|
| **0 — static** | `make check` in all three `tests/` dirs: source-doc paths vs the shared manifest, YAML parse + schema-key lint (incl. the sdkcraft classifier), scenario-file registration, bundle regen, shellcheck, catalog stamp, hooks exec bits, REUSE | $0 | none | CI, every push/PR |
| **1 — OpenRouter gate (SUSPENDED)** | use-workshop's former gate: candidate `z-ai/glm-5.2`, judge `gpt-5.5`, both via OpenRouter, backend-pinned. Suspended 2026-10-19 (no budget); config, targets and CI job kept so it can resume. Last pin 92/92 (2026-10-06) | ~$1.41/run | `OPENROUTER_API_KEY` | `make eval-routing-glm`, CI `workflow_dispatch` (don't dispatch while suspended) |
| **2 — claude subscription** | Everything that shells the `claude` CLI on the local subscription login: the routing **gate of all three suites** (`make eval-routing`, Sonnet 4.6), all three agentic E2E suites (`make eval-agentic`), the onboard reconstruction harness (`make eval-reconstruction[-full]`) and design-sdk's one-off SDK-reconstruction round. Local Claude judge for all llm-rubric grading | $0 | none | **Local only** — a CI runner has no CLI login |
| **3 — Copilot** | The cross-vendor routing run of all three suites (`make eval-routing-copilot`): `gpt-6.1-sol` via the Copilot SDK on the local Copilot login, graded by the **same local Claude judge** as Lane 2. Needs `make eval-deps` once per checkout | Copilot premium allowance (~12 AI credits/case on `gpt-6.1-sol`; ~25 on `gpt-5.6-sol`) | none | **Local only** |

Lane 2 mechanics: the harness drops `--bare`, **unsets**
`ANTHROPIC_API_KEY`/`ANTHROPIC_API_TOKEN` (a misconfigured run fails loudly
instead of billing), and isolates with `--setting-sources project
--strict-mcp-config --mcp-config '{"mcpServers":{}}'`. Every transcript's
`[SYSTEM init]` line records `apiKeySource=none` as the proof. The CLI still
prints a *nominal* `total_cost_usd`; nothing is billed. `EVAL_AUTH=api` is
the opt-in escape hatch back to `--bare` + `ANTHROPIC_API_KEY`.

Lane 3 mechanics: `_testlib/provider-routing-copilot.js` drives the
`@github/copilot-sdk` (exact-pinned in the repo-root `package.json`, kept out
of `.github/skills/` because the SDK runtime ships its own `SKILL.md` files).
The skill bundle **replaces** Copilot's system prompt (`systemMessage.mode:
replace`) and `availableTools: []` disables every tool, so the candidate sees
the same text as Lane 2's — the prompt framing lives in
`_testlib/routing-prompt.js`, shared by both providers. `GH_TOKEN`,
`GITHUB_TOKEN` and `COPILOT_GITHUB_TOKEN` are unset so the stored login is
used. Copilot **silently remaps** model ids it doesn't serve (a `gpt-5.5`
request was answered by `gpt-5.6-sol`), so `copilot-preflight.js` checks the
account lists the model and the provider fails any case served by a
different one. Each case opens a fresh session and pays the cache-write rate
on the whole bundle; a full three-suite round is ~2,700 AI credits on
`gpt-6.1-sol` — chosen 2026-10-19 over `gpt-5.6-sol` (what a `gpt-5.5` request
resolves to) at half the per-token price. The
summary's `meta.copilot` block records served models, premium requests and
AI credits; `cost_usd` stays 0.

## What runs when

- **Every push/PR** — Lane 0 (CI does it; run `make check` locally first).
- **Any skill-content change** — the Lane 2 routing gate of each affected
  suite (`make eval-routing`, ~20–45 min each; iterate until green). Editing
  any `SKILL.md`, reference, or workflow **changes `skill-bundle.md`**
  (regenerated on every run), which changes every prompt and invalidates
  promptfoo's response cache — budget a full re-run, not a cached one.
  Adding or renaming a skill also changes the auto-discovered
  `skill-selection-context.md`, re-opening every suite's skill-selection
  cases.
- **Substantial content change** — add the Lane 3 Copilot run for the
  affected suite(s). It spends allowance, so iterate on single cases with
  `--filter-pattern` and run whole once the Lane 2 gate is green.
- **Workflow/procedure changes** — the affected agentic suite
  (`make eval-agentic`; real LXD, ~15–20 min, $0).
- **Release / re-pin round** — the lot: all three Lane 2 routing gates, the
  Lane 3 Copilot runs, all three agentic suites, reconstruction offline tier
  (`make eval-reconstruction`, 4 SHA-pinned public repos). New rates land in
  the `BASELINE.md` files in the same PR. design-sdk's SDK-reconstruction
  round is one-off calibration, not part of the re-pin set.

Never run two routing suites at once (a concurrent pair once dropped a result
from promptfoo's shared store), and set `PROMPTFOO_CACHE_ENABLED=false` for a
run you intend to pin — an unchanged input otherwise replays from cache in
seconds and measures nothing (check `cached: 0`).

Iterating on one case? `--filter-pattern '<description substring>'` on any
routing/agentic driver — partial runs are quarantined under `results/raw/`
and can never overwrite a canonical baseline (the same quarantine catches
errored runs and the empty-run footgun).

## Baselines are per (candidate, judge) pair

The OpenRouter `gpt-5.5` judge and the local Claude judge are different
instruments; the retired `openai:gpt-5.5-2026-04-23` judge was a third.
Never compare rates across pairs — each `BASELINE.md` table carries a judge
column, and a judge change means seeding a new row, not editing an old one.
Lanes 2 and 3 share the local Claude judge, so their rows differ by
candidate only; they are still separate pairs, each pinned on its own row.

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
- Versions: promptfoo 0.121.17 everywhere — CI installs exactly that
  (`ci.yaml`), so it is a real pin and local runs should match it.
  **The claude CLI is deliberately NOT pinned: use whatever is installed.**
  Record `claude --version` in a BASELINE row as provenance; never treat it as
  a gate, and never block a re-pin on it. The Copilot SDK *is* pinned
  (`package-lock.json`): it bundles its own Copilot runtime, so the pin fixes
  the client the way promptfoo's does. The served model is the instrument
  that can drift; the provider checks it on every case.

## The claude CLI is not pinned

Use whatever `claude` is installed. A version is provenance on a row, not a
gate — do not freeze a baseline cell waiting for a particular binary, and do
not seed a parallel "instrument" row when the CLI moves. When a CLI change
moves a rate: investigate the drop, fix the cause if there is one, then
re-measure and re-pin with the version noted.

What the old 2.1.241 pin was really standing in for is a **capability**, and
that is now checked directly instead of documented: the routing candidate
needs a binary accepting `--system-prompt-file`, because the use-workshop
bundle is ~199 KB and an inline `--system-prompt` cannot clear Linux's 128 KiB
argv limit. `run-routing.sh`'s preflight exercises the flag on every
subscription run and fails once, loudly, naming the capability.

The 2026-09-22 round is the worked example of why the pin was the wrong tool.
On CLI 2.1.278 the onboard-workshop tree pinned at 60/60 scored 56/60, which
looked like an instrument change — a control run committed as
`results/2026-09-22-control-pre097-*.json`. The real cause was fixable and had
nothing to do with the version: the CLI injects per-machine sections (cwd, env,
git status) into every prompt, so a tool-less candidate in an empty scratch dir
answered *about the empty directory* on repo-analysis prompts instead of the
scenario. `provider-routing-cli.js` now appends a short harness note telling
the candidate to answer from the user's description and ignore the working
directory. Pinning the CLI would have preserved the old number while leaving
the defect in place.

## Layout

Shared implementation lives in `.github/skills/_testlib/` (drivers,
providers, check scripts — see its README); each suite's `tests/` holds only
its configs, scenarios, fixtures, baselines, and ~15-line wrappers. Suite
specifics: `use-workshop/tests/README.md`, `onboard-workshop/tests/README.md`
(+ `reconstruction/README.md` for the guinea-pig harness), and
`design-sdk/tests/README.md` (+ its `reconstruction/README.md` for the
one-off SDK-reconstruction round).
