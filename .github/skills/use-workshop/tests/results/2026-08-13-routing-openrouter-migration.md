<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Routing gate moved to OpenRouter: measurement round

**Date:** 2026-08-13 · **Suites:** `use-workshop` (76 cases) migrated,
`onboard-workshop` (53 cases) measured and **rejected** · **Judge:**
`gpt-5.5` throughout — the model never changed, only the vendor of record.

The routing eval billed two vendors: Anthropic for the candidate model and
OpenAI for the `llm-rubric` judge. Anthropic credits were exhausted three times
during the preceding round, leaving the 76-case suite pinned at an unverified
73/76. This round moved the whole run to a single vendor, re-pinned it, and
measured whether the sibling suite should follow.

## Headline

| Suite | Before | After | Verdict |
|---|---|---|---|
| `use-workshop` (76) | Sonnet 4.6 + OpenAI judge | **GLM-5.2 + gpt-5.5, both via OpenRouter** | **migrated, pinned 76/76, 0 errors** |
| `onboard-workshop` (53) | Sonnet 4.6 + OpenAI judge | *unchanged* | **rejected** — GLM-5.2 scores 50/53 |

The migrated suite needs **`OPENROUTER_API_KEY` and nothing else**. No assertion
and no skill content was changed to reach 76/76.

## Cost — measured, not estimated

Computed from each run's reported token usage. The method validates against the
one run promptfoo prices natively: Sonnet's 3,168,078 prompt + 40,440 completion
at $3/$15 per M gives $10.11, matching its recorded `cost_usd` to the cent.

| | prompt | completion | rate (in/out per M) | cost |
|---|---|---|---|---|
| candidate `z-ai/glm-5.2` | 2,456,030 | 41,157 | $0.40 / $2.52 | **$1.09** |
| judge `openai/gpt-5.5` | 30,319 | 5,611 | $5.00 / $30.00 | **$0.32** |
| | | | **total** | **$1.41** |

Against ~$10.43 before (Sonnet $10.11 + the same judge) — **~7× cheaper**.

Two things worth recording, because both contradict pre-run estimates made in
this round and now corrected in `BASELINE.md` and `README.md`:

- **The judge is cheap, not expensive.** It was estimated at ~$3.20/run on the
  assumption that a reasoning-class grader spends ~800 output tokens per call.
  Actual grading completions average **~49 tokens per call** — 5,611 across ~115
  rubric assertions. The pre-run claim that "the judge is the more expensive
  half" is false; it is 23% of the run.
- **The headline saving was understated at "~$13.30 → ~$4.50".** Both halves
  were wrong in the same direction: the true figure is **~$10.43 → ~$1.41**.

`cost_usd` reads **0** in every committed OpenRouter summary — those slugs are
not in promptfoo's cost table — so the gate row carries no cost signal of its
own. The OpenRouter dashboard remains authoritative.

## Three config decisions, each forced by evidence

None of these are stylistic. Each was found by running the suite and each is
load-bearing for the row being a *gate* rather than a snapshot.

### 1. Backend routing pinned

`z-ai/glm-5.2` is served by **~32 OpenRouter backends at quantizations from fp8
down to fp4**, with context lengths from 96,890 to 1,048,576. OpenRouter selects
one per request. This is precisely why `BASELINE.md` describes open-weight rows
as "a snapshot, not a pin" and excludes them from CI gating — an unconstrained
row measures a different machine run to run.

```yaml
provider:
  allow_fallbacks: false
  quantizations: [fp8]
```

Verified passed through by promptfoo's `OpenRouterProvider`, which whitelists
`provider`, `route`, `models`, `transforms` plus arbitrary `passthrough`.
`quantizations` rather than a single `order:` backend, so one backend going down
does not take the gate with it. Diagnostic tiers are deliberately left unpinned.

### 2. `showThinking: false` — grade the answer, not the reasoning

GLM-5.2 returns a `reasoning` field, and promptfoo's OpenRouter provider
**prepends it to the graded output** (`showThinking ?? true`). Measured at ~12%
of graded text on a sample case.

That grades the wrong artifact twice over. The Anthropic rows were never graded
on hidden reasoning, so the comparison was not like-for-like; and a reasoning
trace enumerates-and-rejects options far more freely than a final answer does,
which is exactly what trips this suite's `not-contains` guards — the failure
class behind six of the eleven recorded assertion fixes.

Confirmed client-side only: the candidate cache still hit after the change
(`Eval: 38,287 (cached)`), and the grading prompt shrank 813 → 667 tokens,
matching the ~148 reasoning tokens removed.

### 3. `max_tokens: 3072` — because reasoning bills against the same budget

The direct consequence of (2). With reasoning no longer *counted* as output but
still *billed* against `max_tokens`, the usual 1024 budget starves the answer.

## The two-run story

**First full run: 73/76, 0 errors.** All three failures were diagnosed before
anything was pinned.

| Case | Score | Cause |
|---|---|---|
| `User reports a hook script that isn't running` | 0.000 | `finishReason: length`, **empty answer** — the whole 1024 budget went to reasoning |
| `Multi-turn recovery — turn 3` | 0.250 | same |
| `A workshop needs a host-only service` | 0.938 | not truncated — genuine rubric near-miss |

9 of 76 cases hit the 1024 ceiling; the 7 that front-loaded their answer passed,
the 2 that did not failed **on truncation alone**. Re-running exactly those
cases at 3072: **11/11, 0 errors**.

**Second full run: 76/76, 0 errors, 0 truncations**, lowest case score 0.983.
The `host-only service` case passed once the model had budget for a complete
answer — a prediction made during diagnosis, that it was a false pass exposed by
`showThinking: false`, was **wrong**; more room simply produced the fuller answer
containing the required DNS contrast.

The one genuine improvement carried in from `e31d177`: the vendor-agnostic
remote-IDE case went **0.867 → 1.000** (assertion fix #9).

## Why `onboard-workshop` was rejected

The same migration was applied to the 53-case suite and measured:
**50/53, 0 errors** (`../../onboard-workshop/tests/results/2026-08-13-routing-openrouter-z-ai-glm-5.2.json`,
~$0.98/run).

One failure was the same budget artifact — the minimal-workshop-fallback case
burned a **full 3072 tokens on reasoning** and returned nothing; it passes at
8192. The other two are genuine model-side differences on cases Sonnet passes
53/53, both finishing normally rather than truncating:

| Case | Score | What GLM-5.2 did |
|---|---|---|
| `Full onboarding ask routes through analysis first, read-only` | 0.667 | answered in 424 chars without naming `go.mod` / `Makefile` / CI |
| `Node channel from engines field` | 0.917 | pinned channel `"24"` correctly, omitted the `sdk info` verification step |

GLM-5.2 is simply terser than Sonnet against this suite's honesty-gate and
evidence prompts. Pinning its gate there would leave those two cases
**permanently un-gated** — one of them core routing behaviour, where a
regression would go undetected. On a 53-case suite the saving did not justify
that. The 76-case suite carried no such cost: it ported at 100%.

## Harness fixes made along the way

Both are provider-independent and were kept in **both** suites.

- **`--filter-providers` ids are now regex-escaped.** They were interpolated raw
  into `"^${id}$"`. A dotted slug like `z-ai/glm-5.2` matches too broadly, and a
  future slug carrying a regex quantifier would match *nothing* — which promptfoo
  reports as a clean 0-case run, silently overwriting a canonical baseline with
  an empty summary. Verified: the escaped pattern matches exactly one declared
  id, and `glm-5x2` no longer false-matches.
- **The judge preflight reads YAML instead of grepping.** It matched
  `provider: openai:` on a bare string; the moment the pin became an object it
  would have found nothing, silently skipping the preflight — losing the
  fast-fail exactly when the config changed. It now parses
  `defaultTest.options.provider` (both forms) and probes the endpoint matching
  the judge's scheme. `BASELINE.md` records this protection saving a full sweep
  once ("Judge-outage incident").

A third fix landed in CI: the `eval-routing` dispatch job ran a matrix over both
skills, but `OPENROUTER_API_KEY` is the repository's only secret — the
`onboard-workshop` leg would have failed on every dispatch. The job is now
scoped to `use-workshop`, which also removed a dangling `${{ matrix.skill }}`
in the artifact upload that would have resolved to an empty path.

## Caveats carried forward

1. **The gate is a proxy.** It measures how a *GLM* model routes through a skill
   written for *Claude*. GLM-5.2 tracked Sonnet closely — both 75/76 on the
   2026-07-23 suite under the same judge — but it is a proxy.
   `make eval-routing-anthropic` exists as the confirmation run and is worth
   spending before shipping substantial content changes.
2. **The judge lost its date pin.** OpenRouter exposes only the floating
   `openai/gpt-5.5`, not the `-2026-04-23` snapshot, so it can roll silently.
   A step change in borderline rubric verdicts is the symptom.
3. **The Anthropic rows are stale.** Sonnet's 76/76 predates the `e31d177` gap
   fixes; Haiku and Opus predate the 0.9.4 bundle entirely.

## Result files

| File | |
|---|---|
| `2026-08-13-routing-openrouter-z-ai-glm-5.2.json` | the pinned gate — 76/76, 0 errors |
| `2026-07-23-routing-openrouter-z-ai-glm-5.2.json` | prior GLM-5.2 diagnostic, 75/76 (unpinned routing, 1024 budget — **not** comparable) |
| `2026-07-23-routing-anthropic-messages-claude-sonnet-4-6.json` | former baseline, 75/76, $10.11 |
| `../../onboard-workshop/tests/results/2026-08-13-routing-openrouter-z-ai-glm-5.2.json` | the rejected migration — 50/53 |
