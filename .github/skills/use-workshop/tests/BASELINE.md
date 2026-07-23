<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Eval baseline for `use-workshop`

This file pins the **expected** pass rates per (model × eval mode). PRs
that drop a cell below its locked rate fail CI (for routing) or surface
in the agentic summary diff (manual). Update this file when you've
investigated and confirmed the change is intentional and not a
regression.

## Routing eval

76 cases across 12 scenario files — the prior 73-case suite plus 3 new cases
(2026-07-22) covering the Workshop **0.9.3/0.9.4** surface and two correctness
fixes: `purge.yaml` (orphaned workshop the user wants to KEEP — restore content
at the same absolute path), `author-in-project-sdk.yaml` (the minimal in-project
`sdk.yaml`: `name:` is the only required key, no `hooks:` field), and
`interfaces.yaml` (narrow a custom-device plug by `vendorid`/`productid`, 0.9.3+).
The same 2026-07-22 round **rewrote two existing cases and reworded one prompt**
to match ground truth verified against the upstream code and docs:
- `purge.yaml` orphan case now requires the recreate-directory recovery
  (`mkdir -p <same path>` + `workshop remove --project`) as the primary path,
  with manual `lxc delete` demoted to a mentioned fallback — previously it
  asserted `lxc list`/`lxc delete` as the answer.
- `author-in-project-sdk.yaml` ruff and inline-hooks cases now require the
  correct `sdk.yaml` shape (NO `hooks:` key; hooks are executable files
  discovered by filename) — previously they asserted a `hooks:` list.
- the "hook isn't running" prompt dropped its invalid premise (it claimed the
  script was "pointed at" via `sdk.yaml`'s `hooks:`, which strict validation
  rejects).
Because those rewrites can flip a previously-passing answer, every recorded rate
below predates this round. The earlier 9 cases (2026-06-23) covered the 0.9.2
surface. Every case is single-turn against the bundled skill (`SKILL.md` +
9 references + 10 workflows concatenated). Run with: `make eval-routing`
(Sonnet 4.6) or `make eval-routing-all-models`.

| Model              | Pass rate                      | Notes |
|--------------------|--------------------------------|-------|
| `claude-sonnet-4-6` | **76/76 (100%)** | full run under the 0.9.4 bundle (2026-07-23) |
| `claude-haiku-4-5`  | 59/59 prior + new cases 3/3 | full re-run under the 0.9.4 bundle optional (see below) |
| `claude-opus-4-7`   | 59/59 prior + new cases 3/3 | full re-run under the 0.9.4 bundle optional (see below) |

> ✅ **2026-07-23 (0.9.3/0.9.4): Sonnet 4.6 re-pinned at 76/76.**
> The Sonnet-only `make eval-routing` run was executed against the 0.9.4 bundle +
> 76-case suite and lands **76/76 (100%, 0 errors)** — Sonnet is re-pinned above.
> The run surfaced two over-strict assertions, both relaxed and re-verified (fixes
> #10 remount and #11 custom-device below; the answers were correct, the rubrics
> asked for irrelevant clauses). **Haiku 4.5 and Opus 4.7 remain stale by
> maintainer decision** — last full-run on the 59-case/0.9.2 bundle; a full re-run
> under the 0.9.4 bundle is optional. The open-weight sweeps stay diagnostic-only.
>
> ⚠️ **2026-06-23 (0.9.2): Anthropic pins were already stale before this round.**
> The 0.9.2 round substantially changed the bundle (correctness fixes + new
> feature coverage) and grew the suite to 73 cases, but — as in the 2026-06-09
> round — the Anthropic tiers were deliberately NOT re-run; only the GLM
> open-weight family was refreshed that cycle (OpenRouter, see below). The rates
> above are the last full Anthropic runs under *earlier* bundles and do not
> reflect 0.9.2 or later.

> **Status (historical — superseded by the 2026-07-23 re-pin above).** Sonnet 4.6
> was previously pinned at **60/60** under the 2026-06-03 bundle: the prior
> 59-case suite plus 1 new `troubleshoot.yaml`
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

**Active families: GLM (Zhipu), MiniMax, and Kimi.** All declared in
`promptfooconfig.yaml`. Tiers were refreshed to the current OpenRouter catalog
on 2026-07-23: `make eval-routing-openrouter` targets `glm-5.1` and
`-openrouter-all` sweeps `glm-4.7-flash` / `glm-5.1` / `glm-5.2`;
`make eval-routing-minimax` targets `minimax-m2.7` and `-minimax-all` sweeps
`minimax-m2.5` / `m2.7` / `m3`; `make eval-routing-kimi-all` sweeps
`kimi-k2.6` / `kimi-k2.7-code` / `kimi-k3`. Superseded slugs (GLM 4.5-air/4.5/4.6
and glm-5, MiniMax m1/m2, Kimi k2.5/k2-thinking) are retired from the targets;
their recorded results stay below as a historical record. The 2026-07-23
refreshed-tier flagships are shown first, then the 2026-06-23 GLM sweep, then the
2026-06-10 full matrix; Qwen3 (archived) follows.

#### Refreshed-tier flagships (2026-07-23, 76-case suite)

The current flagship of each basic family, run against the 0.9.4 bundle + 76-case
suite after the tier refresh (GLM `glm-5.2`, MiniMax `minimax-m3`, Kimi
`kimi-k3`). Diagnostic only — 0 run errors. Run at `2026-07-22T23:50Z` (late
2026-07-23 local); result files carry the local date.

| Model (via OpenRouter) | Role | Pass rate |
|------------------------|------|-----------|
| `z-ai/glm-5.2`            | GLM flagship     | **75/76 (98.7%)** |
| `moonshotai/kimi-k3`      | Kimi flagship    | **71/76 (93.4%)** |
| `minimax/minimax-m3`      | MiniMax flagship | 66/76 (86.8%) |

**Reads.**
- **The two 0.9.4 correctness fixes hold across the flagships.** The in-project
  `sdk.yaml` cases (ruff / minimal / inline-hooks) and the orphan-recovery case
  pass on `glm-5.2` and `kimi-k3`. On `minimax-m3` they are only *partial* misses
  (ruff `llm-rubric` 0.97, hook-not-running 0.92) over peripheral tokens like
  `chmod +x` — not the old `hooks:`-key shape. No failure on any tier traces to
  the bugs this round fixed.
- **`glm-5.2` is the strongest open-weight router** at 98.7%, essentially matching
  the capable Anthropic tiers. Its lone miss was the vendor-agnostic remote-IDE
  rubric — an over-strict assertion, since relaxed (fix #9 below).
- **`minimax-m3`'s one notable miss:** it prescribed `snap remove --purge` for a
  simple orphan (tripping the `not-contains` guard) instead of the recreate-dir
  path — a model routing weakness, not a skill gap. Its other misses are
  borderline (0.75–0.97) token/rubric near-misses.
- **`--reason` hallucination** on `minimax-m3` and `kimi-k3`: both invented a
  `set-health --reason` flag the skill explicitly says doesn't exist — the skill
  is right; the models slip.
- **One shared miss across all three tiers** was the vendor-agnostic remote-IDE
  case (~0.87–0.89): a rubric-strictness artifact (all three gave the correct
  workshop-side answer), relaxed as assertion fix #9. These rates predate that
  fix; a re-run would show +1 on each.
- Result files:
  `results/2026-07-23-routing-openrouter-{z-ai-glm-5.2,minimax-minimax-m3,moonshotai-kimi-k3}.json`.

#### GLM family refresh (2026-06-23, 73-case suite)

The GLM family was re-pinned to three current tiers mirroring the
Haiku/Sonnet/Opus diagnostic roles and run against the 0.9.2 bundle + 73-case
suite. **GLM-only this round** (no other open-weight families, no Anthropic), at
the user's request. 0 run errors.

| Model (via OpenRouter) | Role | Pass rate |
|------------------------|------|-----------|
| `z-ai/glm-4.7-flash`   | clarity ≈ Haiku  | 59/73 (80.8%) |
| `z-ai/glm-5`           | baseline ≈ Sonnet | **71/73 (97.3%)** |
| `z-ai/glm-5.2`         | headroom ≈ Opus  | **71/73 (97.3%)** |

**Reads.**
- **The 0.9.2 content ports cleanly.** The two capable tiers (`glm-5`,
  `glm-5.2`) land at 97.3% — at or above the prior GLM generation's ~95%. The
  nine new 0.9.2 cases pass across the board except three single-tier misses:
  mount-ownership and the same-project-DNS case miss only on the weak
  `glm-4.7-flash` tier, and the host-only-tunnel case misses only on `glm-5.2`
  (its rubric wants an explicit DNS contrast the model left implicit). These are
  rubric strictness / weak-tier capacity, not skill gaps.
- **`glm-4.7-flash` is the clarity tier and wobbles run-to-run** (a first pass of
  this same sweep scored 61/73). Its misses are the usual flickery cases
  (first-time setup, vendor-agnostic remote-IDE, name-omission — see the variance
  watch-items below) plus the two weak-tier new-case misses above. The grading
  model `gpt-5.5` is non-deterministic, so a handful of `llm-rubric` verdicts
  flip between sweeps even with cached candidate responses — treat the flash row
  as a snapshot, not a pin.
- **Tooling note:** the `gpt-5.5` judge preflight in `scripts/run-routing.sh` was
  fixed this round (`max_completion_tokens` 16 → 2000): 16 tokens are consumed
  entirely by a reasoning grader's hidden reasoning, so the probe returned an
  `error` and aborted every sweep until raised.
- Result files:
  `results/2026-06-23-routing-openrouter-z-ai-glm-{4.7-flash,5,5.2}.json`.

#### Full-matrix sweep (2026-06-10): all 10 families on the 64-case suite

The first complete matrix under the daemon-stall/custom-device bundle —
29 tiers, every result canonical. Result files are dated 2026-06-09 (GLM,
MiniMax m1/m2, Kimi k2.5/k2.6, DeepSeek) and 2026-06-10 (the rest). `Nt` =
cases at the 1024-token output ceiling; `–` = not measurable (tier re-run
cache-warm, token usage recorded as cached).

| Family | small | mid | large |
|--------|-------|-----|-------|
| GLM (`z-ai`) | 4.5-air 58/64 (90.6%, 3t) | 4.5 **61/64 (95.3%, 25t)** | 4.6 59/64 (92.2%, 19t) |
| MiniMax | m1 53/64 (82.8%, 0t) | m2 55/64 (85.9%, 1t) | m3 57/64 (89.1%, –) |
| Kimi (`moonshotai`) | k2.5 59/64 (92.2%, 30t) | k2.6 59/64 (92.2%, 36t) | k2-thinking 58/64 (90.6%, –) |
| DeepSeek | v4-flash 58/64 (90.6%, 16t) | v3.2 **61/64 (95.3%, 1t)** | r1 59/64 (92.2%, 36t) |
| MiMo (`xiaomi`) | v2-flash 57/64 (89.1%, 3t) | v2.5 50/64 (78.1%, 0t) | v2.5-pro 56/64 (87.5%, 2t) |
| gpt-oss (`openai`) | 20b 54/64 (84.4%, 39t) | — | 120b 55/64 (85.9%, 38t) |
| Nemotron (`nvidia`) | nano-9b-v2 42/64 (65.6%, 31t) | super-49b 58/64 (90.6%, –) | 3-super-120b 51/64 (79.7%, –) |
| Gemma (`google`) | 3-4b 37/64 (57.8%, 20t) | 3-12b 53/64 (82.8%, 17t) | 3-27b 57/64 (89.1%, 4t) |
| Llama (`meta-llama`) | 3.1-8b 37/64 (57.8%, 1t) | 3.3-70b 45/64 (70.3%, 0t) | 4-maverick 57/64 (89.1%, 0t) |
| Mistral (`mistralai`) | ministral-3b 50/64 (78.1%, 4t) | ministral-8b 52/64 (81.2%, 0t) | small-3.2-24b 49/64 (76.6%, 0t) |

**Reads.**
- **The four new cases port well.** Across all 29 tiers: custom-device 28/29,
  post-uncontrolled-Off poison state 28/29, negative guard (no daemon restart
  for an ordinary `Error` change) 28/29, stuck-`Doing` escalation 25/29.
  Misses are confined to the smallest/weakest tiers (gemma-3-4b: stuck-Doing +
  custom-device; nemotron-nano: stuck-Doing + negative-guard; ministral-3b and
  nemotron-3-super-120b: stuck-Doing; gpt-oss-20b: poison-Off) — model-side
  capacity, not a skill gap.
- **Aggregates are consistent with the 60-case sweep** within the usual
  run-to-run variance; the suite growth did not shift any family's standing.
  The frontier open-weight tiers (GLM-4.5, DeepSeek-v3.2 at 95.3%) still port
  about as well as Anthropic Haiku.
- **Judge-outage incident.** The first attempt at this sweep was silently
  degraded by the `llm-rubric` judge running out of OpenAI credits (reported
  as generic 429s): the nemotron super-49b/120b runs were quarantined with
  16/35 errored cases and the sweep was stopped mid-Gemma. The judge is now
  pinned in `promptfooconfig.yaml`, preflighted per run, and sweeps abort on
  run-level errors (see the tooling commit in PR #5). The affected tiers were
  re-run clean; cached candidate responses meant the redo was mostly
  re-grading.
- Assertion fix 7 (below) landed between the two attempts; minimax-m3 and
  kimi-k2-thinking were re-graded under it (+1 case each — their canonical
  files are the 2026-06-10 re-runs).

#### Prior sweep (2026-06-08, 60-case suite): GLM + MiniMax

Superseded by the 2026-06-10 full-matrix table above. Kept for the post-fix
verification narrative below. All tiers, 0 errors each:

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

#### Expanded open-weight matrix (2026-06-08/09, 60-case suite)

Superseded by the 2026-06-10 full-matrix sweep above; kept as the first
sweep of the expanded families and for the per-family reads below.

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
7. **`Change stuck in Doing`** (troubleshoot, 2026-06-10) — surfaced on the
   first open-weight sweep of the new daemon-stall cases. A blunt
   `not-contains "snap remove"` fired on the models' own warnings ("don't
   reach for `snap remove --purge` here") — verified against the raw outputs
   for minimax-m3 and kimi-k2-thinking, both of which prescribed the correct
   `snap restart workshop` + recreate path and failed only on this assertion.
   Removed; the case's `llm-rubric` already forbids *prescribing* purge, which
   is the correct mention-vs-prescription distinction (same class as fixes 2
   and 3).
8. **`User asks for the full list of SDK hooks and their privilege`**
   (author-in-project-sdk, 2026-06-23) — a blunt `not-contains "setup-sdk"`
   fired on correct answers across all three GLM tiers: because the 0.9.2 skill
   emphatically states "there is no `setup-sdk` hook", a good answer lists the
   five real hooks and names `setup-sdk` precisely to exclude it. Removed; the
   case's `llm-rubric` already forbids presenting `setup-sdk` as a real hook
   (same mention-vs-prescription class as fixes 2, 3, and 7).
9. **`User wants to attach a remote IDE over SSH (vendor-agnostic)`**
   (ide-integration, 2026-07-23) — surfaced on the refreshed-tier open-weight
   sweep: all three flagships (glm-5.2, minimax-m3, kimi-k3) gave the correct
   workshop-side answer (`sshd` + tunnel + non-privileged host port) and did
   NOT improvise product-specific config, yet the rubric failed them (~0.87–0.89)
   solely for naming VS Code / JetBrains as *category examples* — the very names
   the skill's own routing table uses as the keys for this scenario. Relaxed to
   forbid improvising vendor-specific *config* the user didn't ask for while
   allowing example product names (same mention-vs-prescription class as fixes
   2, 3, 7, and 8). Verified against the raw outputs: all three would pass under
   the relaxed rubric.
10. **`Reassign a mount source to a different host directory`** (interfaces,
   2026-07-23) — surfaced on the Sonnet 4.6 re-pin run: a blunt
   `not-contains "workshop launch"` fired on the model's own warning that a
   `remount` does NOT survive `workshop remove` + `workshop launch` (which resets
   mounts to definition defaults). Verified against the raw Sonnet output — the
   answer correctly used `workshop remount` and only mentioned launch inside that
   caveat. Replaced with a rubric that forbids *prescribing* remove+launch as the
   reassignment mechanism while allowing the warning (same mention-vs-prescription
   class as fixes 2, 3, 7, 8, and 9).
11. **`Narrow a custom-device plug to one USB adapter by vendor/product ID`**
   (interfaces, 2026-07-23) — the lone Sonnet 4.6 miss on the re-pin run (0.95).
   Verified against the raw output: the answer was fully correct (quoted
   `vendorid`/`productid`, `productid` requires `vendorid`, `refresh` + manual
   `connect`, no invented attributes). The judge docked it only for not reciting
   the "at least one of subsystem/vendorid/productid is required" rule — which is
   irrelevant here, since the user's plug already has `subsystem`. Made that
   recitation optional in this new case's own rubric; Sonnet then passes 76/76.

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
