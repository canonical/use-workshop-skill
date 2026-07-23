<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Eval baselines for `onboard-workshop`

Same contract as the sibling suite: PRs that change skill content must not
merge below a pinned cell without investigation. Cells marked _pending_ are
blocked on API credits at the time of the 2026-07-23 development round and
must be recorded before release.

## Routing eval (`make eval-routing`)

48 cases across 8 scenario files (incl. 8 cross-skill selection cases).
Judge: pinned in `promptfooconfig.yaml` (same as sibling).

| Model | Pass rate | Date | Notes |
|-------|-----------|------|-------|
| `claude-sonnet-4-6` | **48/48 (100%)** | 2026-07-23 | canonical baseline; see round notes below |
| `claude-haiku-4-5` | _pending_ | — | clarity diagnostic |
| `claude-opus-4-7` | _pending_ | — | headroom check |

> **2026-07-23 development round.** The first canonical run landed 40/46
> ($3.70). Of the 6 failures: 4 were over-strict rubrics (mention-vs-
> prescription — the model acted correctly but didn't recite adjacent
> protocol clauses; rubrics relaxed in `analyze.yaml`,
> `feasibility-honesty.yaml`, `interview.yaml` ×2), 1 was eval-modality
> (chat eval can't inspect a repo, so evidence requests were miscounted as
> unrecommended questions; rubric now distinguishes decision questions from
> evidence requests, and `propose-plan.md` codifies the same distinction),
> and 2 were genuine skill gaps fixed in content: the final report
> duplicated an operations tutorial instead of handing off to use-workshop
> (`SKILL.md` out_of_scope + `launch-and-verify.md` anti-pattern), and —
> caught by the model correctly following the sibling reference against my
> wrong workflow text — `launch-and-verify.md` claimed refresh re-runs
> `setup-base` (it does not; recreate is required; workflow + rubric
> corrected). All 6 re-ran green in partials. Content was further
> strengthened afterward (see reconstruction round notes); the post-
> strengthening full run landed 44/46, with both failures eval-authoring
> artifacts: the channel-pinning rubric demanded the sdk-info recitation on
> an otherwise textbook answer (relaxed — mention-vs-prescription), and the
> final-report case's past-tense prompt ("everything ran") made the model
> honestly refuse to fabricate a report for a run that never happened — the
> honesty gate working as designed against a hypothetical; the prompt now
> asks prospectively what the report WILL contain. The canonical run at that
> point: **46/46 (100%)**.
>
> **2026-07-23 issue-triage round.** Two acceptance criteria from the issue
> were codified explicitly: the low-confidence minimal-workshop fallback
> (capability-envelope rubric + propose-plan offer + generate-definition
> path) and the no-modify rule (SKILL.md principle 5 + generate-definition
> anti-pattern); `feasibility-honesty.yaml` gained one case for each
> (46→48). The first 48-case run landed 46/48 ($4.04): the new fallback
> case exposed a genuine content gap — the model stretched a Linux-
> compatible-but-unautomatable stack to INFEASIBLE instead of offering the
> fallback — fixed by an explicit RUN-vs-AUTOMATE discriminator in both
> rubric tiers plus worked example 6; and the pre-existing catalog case
> flipped on eval modality (the model stated the catalog+unverified
> protocol correctly but asked for repo evidence before proposing — rubric
> relaxed per the mention-vs-prescription precedent to accept either).
> Both re-ran green in a partial, then the full canonical run landed
> **48/48 (100%)**, recorded in `results/2026-07-23-routing-*.json`.

## Reconstruction eval (`make eval-reconstruction`, offline tier)

Deterministic thresholds live in `reconstruction/expectations/<repo>.json`;
the rubric gate is pass-at-4 (see `reconstruction/promptfooconfig.yaml`).
Update expectations when a guinea pig's ground truth changes.

| Guinea pig | Scorecard | Rubric | Date | Notes |
|------------|-----------|--------|------|-------|
| workshop-akcano | **PASS (overall_pass: true, 0 failures)** | pass | 2026-07-23 | base+go@1.26 ✓, in-project SDK w/ exec hooks ✓, tunnel 8000 pair ✓, 4/4 action groups ✓, gitignore ✓ (post-strengthening re-run after the credit outage) |
| vscode-workshop | round 2: green under current expectations | pass | 2026-07-23 | node@"24" ✓, in-project SDK (3 exec hooks) ✓, desktop+xvfb ✓, 6 actions wrapping npm entry points, gitignore ✓ |

> **2026-07-23 development round.** Round 1 exposed the core failure the
> skill exists to prevent: for vscode-workshop the agent detected everything
> (xvfb, X libs, vsce) but generated an init-level skeleton and left the
> toolchain in prose. Fixes: `SKILL.md` principle 5 ("Encode, then prove"),
> a completion checklist + anti-pattern in `generate-definition.md`, and a
> canonical Electron/Chromium X-library set in `toolchain-signals.md`
> (an Electron-family test dependency is itself the evidence). Round 2
> vscode then produced a functionally equivalent-or-better definition. The
> `build` expectation group was relaxed to accept the repo's own build
> entry points (`npm run compile/package`): `vsce` appears nowhere in the
> scrubbed repo (not in devDependencies), so demanding it required
> information only the hidden ground truth held. Round 2/3 akcano runs were
> killed mid-flight by "credit balance is too low" and carry no signal —
> re-run after top-up.
>
> **2026-07-23 issue-triage re-run.** After the fallback + no-modify content
> additions, the offline tier re-ran green on both guinea pigs (2/2,
> scorecards + rubric). The run staged the skill just before the final
> RUN-vs-AUTOMATE wording sharpening in `capability-envelope.md`; that
> delta is confined to the low-confidence clause, which neither FULL-
> verdict guinea pig exercises, so the cells were not re-run a second time.
> The full-LXD and agentic tiers were likewise not re-run for this round —
> the additions are honesty clauses on paths those suites already exercise
> as FULL-verdict runs (stale-by-decision, same policy as the pending
> diagnostic rows).

## Reconstruction eval (full LXD tier, `make eval-reconstruction-full`)

Manual, pre-release only.

| Guinea pig | Ready | Actions proven | Date | Notes |
|------------|-------|----------------|------|-------|
| workshop-akcano | ✓ ("status: ready confirmed — workshop stable throughout the proof loop") | scorecard PASS after tunnel-check fix; `lint-shell` honestly UNVERIFIED (git archive sandbox has no `.git` — sandbox artifact, not a skill defect) | 2026-07-23 | agent remapped the host tunnel port 8000→8001 because the real akcano dev workshop holds 8000 — correct adaptation that exposed a scorer bug (host-side remap now allowed; workshop-side slot must still match) |
| vscode-workshop | **PASS (overall_pass: true, 0 failures; all asserts green)** | ✓ Ready; proof table all-PASS: check-types, lint, build, `xvfb-run -a npm test` (108 tests green in-container), package; clean teardown ($1.12, 7.5 min) | 2026-07-23 | the four runs before the clean pass tell the story: (1) omitted the desktop plug → `toolchain-signals.md` now prescribes it for Electron-family hosts; (2) declared it, hit a launch conflict, STRIPPED it to get green → `launch-and-verify.md` now forbids removing proposed constructs (UNVERIFIED instead); (3) with that fix: kept the plug, marked everything UNVERIFIED with the reason, passed scorecard+rubric — the discipline rule demonstrably working; (4) credit-killed mid-run on a degraded path (inline `hooks:` in a stray `.workshop/deps.yaml`) → scorer now prefers the def with `base:`, and `generate-definition.md` hardens the no-inline-hooks rule + root/non-root hook contract |

## Agentic suite (`make eval-agentic`)

| Task | Result | Date | Notes |
|------|--------|------|-------|
| onboard-mini-node | **PASS** ($0.87, 5.7 min, clean teardown) | 2026-07-23 | live-verified node@24/stable, verdict before generation, `.workshop/agentic-onboard.yaml`, actions exercised via `workshop run`. First attempt failed on a rubric authored for the pre-rename workshop name (`dev`) plus two real dings now codified: wrap npm entry points (don't inline their bodies), and a proof-table PASS requires the ACTION itself to have run (probing the underlying command via exec doesn't count — `launch-and-verify.md` now says so) |
| honesty-gate | **PASS** | 2026-07-23 | macOS/Xcode fixture → INFEASIBLE verdict, ZERO files generated, no workshop lifecycle touched |

> Harness note (2026-07-23): the agentic `promptfooconfig.yaml` `repo_root`
> must be FIVE levels up from `agentic/` (`../../../../..`); the sibling's
> `../../../..` works there only because its `run-agentic.sh` wrapper exports
> `AGENTIC_REPO_ROOT`. First suite invocation errored instantly on this.
