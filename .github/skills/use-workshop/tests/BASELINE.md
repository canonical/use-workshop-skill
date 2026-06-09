<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Eval baseline for `use-workshop`

This file pins the **expected** pass rates per (model × eval mode). PRs
that drop a cell below its locked rate fail CI (for routing) or surface
in the agentic summary diff (manual). Update this file when you've
investigated and confirmed the change is intentional and not a
regression.

## Routing eval

64 cases across 12 scenario files — the prior 60-case suite plus 4 new cases
(2026-06-09): 3 in `troubleshoot.yaml` covering daemon-stall recovery (a change
stuck in `Doing` with every command failing on `other changes in progress` →
`snap restart workshop` then recreate; post-uncontrolled-Off poison state →
don't trust reported `Ready`, recreate; and a negative guard — an ordinary
refresh failure must NOT get a daemon restart) and 1 in `interfaces.yaml` for
the 0.9.1 `custom-device` interface (host serial adapters → `subsystem` plug +
manual `workshop connect`). Every case is single-turn against the bundled skill
(`SKILL.md` + 9 references + 10 workflows concatenated). Run with:
`make eval-routing` (Sonnet 4.6) or `make eval-routing-all-models`.

| Model              | Pass rate                      | Notes |
|--------------------|--------------------------------|-------|
| `claude-sonnet-4-6` | **60/60 (100%)** | full run under the 2026-06-03 bundle — predates the 2026-06-09 changes (see below) |
| `claude-haiku-4-5`  | 59/59 prior + new cases 3/3 | full re-run under the new bundle optional (see below) |
| `claude-opus-4-7`   | 59/59 prior + new cases 3/3 | full re-run under the new bundle optional (see below) |

> ⚠️ **2026-06-09: Anthropic pins are stale by maintainer decision.** The
> daemon-stall/custom-device round changed the bundle (skill content) and grew
> the suite to 64 cases, but the Anthropic tiers were deliberately NOT re-run —
> only the open-weight matrix was refreshed. The rates above are the last full
> Anthropic runs under the *previous* bundles. Re-pin Sonnet (and optionally
> Haiku/Opus) at 64/64 with `make eval-routing` / `make eval-routing-all-models`
> when the next Anthropic sweep is scheduled.

> **Status.** Sonnet 4.6 is pinned at **60/60** from a full run under the current
> skill bundle (2026-06-03): the prior 59-case suite plus 1 new `troubleshoot.yaml`
> storage case (`No space left on device` → resize the LXD pool). Adding the
> storage content to the bundle surfaced one over-strict rubric —
> `Refresh failed (paraphrase 2)` — that forbade even a correctly-scoped
> `remove`+`launch` for a workshop genuinely stuck in `Error`, contradicting
> `states-and-transitions.md`; the rubric was relaxed (diagnosis-first still
> required). Haiku 4.5 and Opus 4.7 were last run in full on the 59-case suite
> (all green, 177/177 across three models); the 3 `workshop init` cases passed on
> all three there, and the new storage case is verified 3/3 via a filtered run. A
> full 3-model re-run under the new bundle is optional to formally pin Haiku/Opus
> at 60/60 — the only test change since their last full run is the rubric
> relaxation above, which cannot newly fail a case. Seven earlier assertion fixes
> (plus this one) are documented under "Assertion fixes" below.

### OpenRouter (open-weight) routing — diagnostic only, not a CI gate

The same 60 routing cases can be run against open-weight models through
OpenRouter (`make eval-routing-openrouter[-all]`, requires
`OPENROUTER_API_KEY`). These are **cross-model diagnostics, not a regression
gate** — they are not pinned and a drop here does not fail CI. They answer a
different question than the Anthropic baseline: *how portable is the skill's
routing to non-Anthropic models?* Tiers mirror the Anthropic diagnostic roles
(small ≈ Haiku clarity, mid ≈ Sonnet baseline, large ≈ Opus headroom).

**Active families: GLM (Zhipu) and MiniMax.** Both are declared in
`promptfooconfig.yaml`; `make eval-routing-openrouter` targets `glm-4.5` and
`make eval-routing-minimax` targets `minimax-m2`. Their latest sweep is shown
together below; Qwen3 (archived) follows as a prior comparison.

Latest full sweep **2026-06-08**, under the post-fix bundle (see *Post-fix
verification* below). All tiers, 0 errors each:

| Model (via OpenRouter)   | Pass rate          |
|--------------------------|--------------------|
| `z-ai/glm-4.5-air`       | 56/60 (93.33%)     |
| `z-ai/glm-4.5`           | 57/60 (95.00%)     |
| `z-ai/glm-4.6`           | 53/60 (88.33%)     |
| `minimax/minimax-m1`     | 54/60 (90.00%)     |
| `minimax/minimax-m2`     | 52/60 (86.67%)     |
| `minimax/minimax-m3`     | 53/60 (88.33%)     |

> **Open-weight aggregates wobble run-to-run.** OpenRouter routes these slugs to
> varying backend providers/quantizations, so even at `temperature 0` a handful
> of *unrelated* cases flip between sweeps — the 2026-06-04 GLM snapshot was a
> monotonic 55/56/57, and the pre-fix MiniMax snapshot was 55/53/55 (both 0
> errors / 0 truncations; MiniMax m1/m3 are reasoning models but stayed within
> the 1024-token budget). Treat the table as a snapshot, not a pin — the
> reproducible signal is the per-case verification below.

#### Post-fix verification (2026-06-08): in-project-SDK iteration loop

The cross-family weak spot flagged in earlier sweeps — in-project-SDK authoring —
was addressed with a **skill-content-only** change (no rubric/test edits):

- `workflows/author-in-project-sdk.md` (Step 8): the iteration loop now folds in
  failure inspection (`workshop changes` → `workshop tasks <ID>` →
  `workshop refresh --continue`), which previously lived only in the separate
  Step 9 — so a model answering "what's the loop for iterating?" surfaces the
  diagnostic commands the rubric expects.
- `references/in-project-sdk.md`: `setup-base` now states explicitly that it runs
  **before the SDK is mounted into the workshop** (was only implied).

Verified by re-running all three families — GLM, MiniMax, and Qwen3 (the last
temporarily re-declared for the run, then removed):

| Target case | Pre-fix failing tiers | Post-fix |
|-------------|-----------------------|----------|
| *update an existing in-project SDK's `setup-project`* | GLM ×3, Qwen3-14b, Qwen3-32b, MiniMax-m2 (6 of 9) | **passes on all 9 tiers** |
| *`setup-base` for system packages* | Qwen3-14b/235b, MiniMax-m1/m2 | MiniMax-m1 now passes; scores rose across the board; residual `llm-rubric` near-misses on MiniMax-m2 (0.71), Qwen3-14b (0.94), Qwen3-235b (0.96) |
| *ruff via in-project SDK (authoring)* | MiniMax m1/m2/m3 | still fails all 3 MiniMax tiers (GLM/Qwen3 pass) — model terseness against the full `hooks:`-list rubric, not a skill gap; candidate for a future rubric look |

The **primary cross-family miss is fully resolved**: "update `setup-project`"
flipped fail→pass on exactly the six tiers that were broken and regressed on
none. Aggregate movement elsewhere (e.g. `glm-4.6` 57→53) is the run-to-run
variance noted above — the cases that flipped are unrelated to in-project-SDK
content (first-time setup, build-compare, multi-turn recovery, remote-IDE, …)
and churn bidirectionally across tiers between sweeps.

> ⚠️ **Sonnet CI gate not re-run.** This skill edit changed the bundle, so the
> pinned Sonnet **60/60** (`make eval-routing`) was left *unverified* — and the
> 2026-06-09 round kept it that way by maintainer decision (see the staleness
> note at the top of this section). The edits are additive clarifications and
> Sonnet already passes these cases, so regression risk is low.

#### Expanded open-weight matrix (2026-06-08/09)

Eight more open-weight families added — 3 tiers each (gpt-oss has only 2), 23 models,
**0 run errors**. Qwen3 is re-declared in the config for parity but **not re-run**
(its numbers stay the 2026-06-04 snapshot below). All eight publish open weights by
license; OpenRouter's per-model "open weights" badge is inconsistent for some
first-party-served endpoints (Kimi/MiMo/DeepSeek) — we track the license, not the badge.

`Nt` = cases that hit the 1024-token output ceiling (completion ≥ 1020). The budget
is kept at 1024 for cross-row parity, so heavy-`t` rows are **budget-limited, not
purely routing-limited**.

| Family | small | mid | large |
|--------|-------|-----|-------|
| Kimi (`moonshotai`) | k2.5 54/60 (90.0%, 22t) | k2.6 57/60 (95.0%, 25t) | k2-thinking 57/60 (95.0%, 32t) |
| DeepSeek (`deepseek`) | v4-flash **58/60 (96.7%, 9t)** | v3.2 54/60 (90.0%, 3t) | r1 56/60 (93.3%, 42t) |
| MiMo (`xiaomi`) | v2-flash 56/60 (93.3%, 4t) | v2.5 47/60 (78.3%, 3t) | v2.5-pro 53/60 (88.3%, 2t) |
| gpt-oss (`openai`) | 20b 45/60 (75.0%, 39t) | — | 120b 54/60 (90.0%, 40t) |
| Nemotron (`nvidia`) | nano-9b-v2 47/60 (78.3%, 24t) | super-49b-v1.5 51/60 (85.0%, 12t) | 3-super-120b 51/60 (85.0%, 18t) |
| Gemma (`google`) | 3-4b 34/60 (56.7%, 22t) | 3-12b 48/60 (80.0%, 18t) | 3-27b 51/60 (85.0%, 2t) |
| Llama (`meta-llama`) | 3.1-8b 37/60 (61.7%, 1t) | 3.3-70b 39/60 (65.0%, 0t) | 4-maverick 56/60 (93.3%, 0t) |
| Mistral (`mistralai`) | ministral-3b 46/60 (76.7%, 2t) | ministral-8b 53/60 (88.3%, 5t) | small-3.2-24b 43/60 (71.7%, 0t) |

**Reads.**
- **Best porting:** DeepSeek `v4-flash` (96.7%) tops the *entire* open-weight matrix
  (above GLM's 95%); Kimi (95%), Llama `4-maverick` (93.3%), and MiMo `v2-flash`
  (93.3%) follow — the skill ports to the current frontier open-weight models about
  as well as it does to Anthropic Haiku.
- **Truncation confound:** gpt-oss (~40/60 at the ceiling), DeepSeek-`r1` (42), and
  Kimi (22–32) are heavily budget-limited — yet Kimi and DeepSeek-`r1` still score
  93–95% because they front-load the routing answer before exhausting the budget,
  while gpt-oss is genuinely hurt (a larger `max_tokens` would likely lift it).
- **Llama is the inverse:** ~0 truncation but the 3.x tiers score low (8b 61.7%,
  70b 65.0%) — a *genuine* routing weakness, not a budget artifact; only the gen-4
  `maverick` (93.3%) ports well.
- **Within-family non-monotonicity is common** (DeepSeek v4-flash > r1 > v3.2; MiMo
  flash best; Mistral 8b > 24b; Gemma cleanly monotonic 4b < 12b < 27b) — part
  run-to-run variance, part the truncation differences above.
- **The in-project-SDK fix holds** on most new tiers (the "update setup-project"
  case passes across Kimi/DeepSeek/MiMo/gpt-oss/Nemotron and the larger Gemma/Mistral
  tiers); it still misses on Llama (`3.3-70b`, `4-maverick`), `gemma-3-4b`, and
  `ministral-3b` — a per-model routing quirk, not a regression.

Per-case detail for every tier is in `results/<date>-routing-openrouter-<tag>.json`.

#### Prior comparison: Qwen3 (2026-06-04)

The first open-weight trial used the Qwen3 family. Recorded here because it
informed the switch to GLM — the result files remain under `results/` but the
slugs are no longer declared in the config.

| Model (via OpenRouter)   | Pass rate       | Failures (`length` = truncated) |
|--------------------------|-----------------|----------------------------------|
| `qwen/qwen3-14b`         | 51/60 (85%)     | 6 quality + 3 truncation |
| `qwen/qwen3-32b`         | **54/60 (90%)** | 4 quality + 2 truncation |
| `qwen/qwen3-235b-a22b`   | 51/60 (85%)     | 9 quality + 0 truncation |

Non-monotonic — 32B scored highest. Three cases failed on **all three tiers**
(systematic portability gaps, not model size): Store-publishing an SDK, driving
a `workshop sketch-sdk` session, and a specific remote-IDE vendor question — all
places the skill says *defer to docs / stay generic*, which Qwen3 held loosely
(it improvised `sdkcraft` / interactive `workshop` commands). Truncations
(`finishReason: length`) clustered in the smaller tiers; 235B had none. Qwen3 is
a reasoning model (~25K reasoning tokens/run), so the 1024-token budget was
tight for the verbose tiers.

Post-fix re-run (2026-06-08; temporarily re-declared, then removed): 14b 53/60,
32b 52/60, 235b 52/60 — within run-to-run variance. The in-project-SDK *"update
`setup-project`"* case flipped to pass on 14b and 32b (it already passed on 235b);
see *Post-fix verification* above.

> Caveats when reading any OpenRouter summary: (1) `cost_usd` reports **0** —
> OpenRouter slugs are not in promptfoo's built-in cost table; check the
> OpenRouter dashboard for real spend. (2) Token columns are not comparable to
> the Anthropic rows: a *fresh* OpenRouter run populates `prompt`/`completion`
> with `cached: 0` (no Anthropic prompt-cache discount — the full ~30K-token
> bundle is re-sent each case), whereas a summary regenerated from a cache-warm
> re-run shows everything under `cached`.

### Assertion fixes (2026-06-03)

The suite reached 100% **without changing any skill content**. Five
assertions were penalizing correct, well-warned model answers and were
corrected (these accounted for the 7 model×case failures observed before
the fix):

1. **`Refresh failed, user asks what to do`** (troubleshoot) — the rubric
   forbade recommending `workshop remove` + `workshop launch` outright, but
   the prompt is about a `setup-base` hook failure, and `setup-base` is a
   creation-only hook that `workshop refresh` cannot re-run. Recreating the
   workshop is the *correct* fix for a `setup-base` script edit. The rubric
   now allows that scoped exception while still forbidding blanket
   remove+launch. (Was failing on all three models.)
2. **`User edited base image and asks how to apply it`** (daily-ops) — a
   blunt `not-contains "workshop remove"` fired on the model's own "Don't
   `workshop remove`…" warning. Replaced with a rubric that forbids
   *prescribing* remove+launch but allows warning against it.
3. **`Cross-workshop networking`** (multi-workshop) — a blunt
   `not-contains "workshop connect api/"` fired on the model's own "Don't
   try `workshop connect api/…`" warning. Removed; the case's existing
   rubric already forbids a direct cross-workshop connect correctly.
4. **`Run two parallel test runs over the same source`** (parallel-envs) —
   brittle `contains-any` missed `shared-workshop` (hyphen) and title-cased
   "Per Worktree". Switched to `icontains-any` with the phrasing variants.
5. **`User reports a hook script that isn't running`** (author-in-project-sdk)
   — required mentioning the shebang, but a *silently skipped* hook is
   specifically the missing-`+x` case (a missing shebang surfaces as an exec
   error, not a silent skip). Shebang is now optional credit.
6. **`Refresh failed (paraphrase 2, repeated failure with Status Error)`**
   (troubleshoot) — surfaced when the storage case was added. The rubric forbade
   `remove`+`launch` outright, but for a workshop genuinely stuck in `Error`
   status (not auto-reverted to Ready), `remove` is the *only* command that works
   per `states-and-transitions.md`. The rubric now allows that conditional, scoped
   fallback while still requiring the response to lead with diagnosis (not
   prescribe remove+launch as the first move).

### Known variance watch-items (Haiku 4.5)

Not currently failing, but historically flickery under uncached re-runs.
If a future Haiku run dips, check these first — they are model-side
variance, not skill gaps:

- **`User wants to attach a remote IDE over SSH (vendor-agnostic)`** — Haiku
  tends to enumerate named IDE products on vendor-neutral prompts where
  Sonnet/Opus stay generic.
- **`User omits workshop name in a multi-workshop project`** — Haiku
  sometimes shows a name-less command elsewhere in the same response.

## Agentic E2E eval

8 tasks across 8 of 10 skill workflows (the `customize-actions-sketches`
task is renamed to `customize-actions`; the new `author-in-project-sdk`
task drives `.workshop/<name>/` authoring end-to-end). Each task spawns
`claude -p` in an isolated sandbox, drives a real workshop with LXD,
and asserts on the transcript + captured state. Run with:
`make eval-agentic`.

| Model              | Pass rate | Notes |
|--------------------|-----------|-------|
| `claude-sonnet-4-6` | **TBD** (was 7/7 (100%) on the prior 7-task suite) | re-baseline after rerun; expect ~16–18 min wall, ~$4 with the new task |

### Per-task baseline (Sonnet 4.6)

| Task                              | Pass | Wall  | Cost   |
|-----------------------------------|------|-------|--------|
| bootstrap-project                 | ✓    | 103 s | $0.28  |
| daily-ops                         | ✓    |  95 s | $0.09  |
| customize-actions                 | ✓    |  37 s | $0.08  |
| author-in-project-sdk             | ✓    |  71 s | $0.09  |
| manage-interfaces (HTTP tunnel)   | ✓    | 645 s | $1.42  |
| ide-integration (sshd + tunnel)   | ✓    | 573 s | $1.35  |
| multi-workshop-projects           | ✓    |  71 s | $0.12  |
| troubleshoot (broken-SDK recovery)| ✓    |  76 s | $0.15  |

> `author-in-project-sdk` numbers are TBD pending the first green
> agentic rerun against the updated skill. The renamed
> `customize-actions` task is unchanged from `customize-actions-sketches`
> in body — its baseline numbers carry over.

Tunnel-setup tasks (`manage-interfaces` and `ide-integration`) dominate
runtime and cost — the agent does extra refresh + verification work
around plug/slot wiring. The other five tasks complete in 1–2 minutes
each thanks to LXD's image cache being warm after the first launch.

Coverage gaps (workflows not yet wired into the agentic suite, only
the routing eval covers them):

- `parallel-environments` — needs git-worktree fixture setup; deferred
  to a follow-up.
- `purge-and-recover` — needs a pre-orphaned LXD container in the
  fixture, which is awkward to express as a simple file-copy fixture;
  deferred to a follow-up.

## Updating this file

When a real run materially changes a cell:

1. Investigate the changed cases. Use `promptfoo view` (routing) or read
   the latest `results/raw/<date>-*.full.json` (agentic) to see the
   model output and assertion details.
2. If a regression: fix the skill or the test, don't update this file
   without good reason.
3. If an intentional improvement (skill is clearer, more models pass
   more cases, etc.): update the locked-in pass rates here in the same
   PR that locks in the improvement.
4. If a model upgrade improves a cell: update and note the model
   version in the notes section if relevant.

Each routing run writes `results/<date>-routing-<tag>.json` (where `<tag>` is
the provider id flattened to a filename, e.g. `claude-sonnet-4-6` or
`openrouter-z-ai-glm-4.5`) with the exact per-case pass/fail breakdown —
that's the source of truth, this file is the human-readable summary.
