<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Eval baselines for `onboard-workshop`

Same contract as the sibling suite: PRs that change skill content must not
merge below a pinned cell without investigation.

## Routing eval (`make eval-routing`)

53 cases across 8 scenario files (incl. 8 cross-skill selection cases).
Judge: `openai:gpt-5.5-2026-04-23`, pinned in `promptfooconfig.yaml`.

| Model | Pass rate | Date | Notes |
|-------|-----------|------|-------|
| `claude-sonnet-4-6` | **53/53 (100%)** | 2026-08-13 | canonical baseline; 48→53 in the gap-fix round below |
| `claude-sonnet-4-6` | 48/48 (100%) | 2026-07-23 | superseded — prior 48-case suite |
| `z-ai/glm-5.2` (OpenRouter) | 50/53 (94.3%) | 2026-08-13 | diagnostic only — see below; this suite did NOT move to OpenRouter |

(The Haiku 4.5 and Opus 4.7 diagnostic rows sat at _pending_ since 2026-07-23
and were retired 2026-08-20 rather than re-run — a permanently pending cell is
not a baseline.)

> ### GLM-5.2 diagnostic — why this suite stays on Sonnet
>
> On 2026-08-13 the **sibling** `use-workshop` suite moved its gate to GLM-5.2
> via OpenRouter (candidate + judge), landing 76/76 and cutting a measured
> ~$10.43/run to ~$1.41. The same move was measured here and **rejected**.
>
> GLM-5.2 scores **50/53** on this suite (0 errors, result file
> `results/2026-08-13-routing-openrouter-z-ai-glm-5.2.json`). One failure was a
> token-budget artifact — the minimal-workshop-fallback case burned a full 3072
> tokens on reasoning and returned an empty answer; it passes at 8192. The other
> two are genuine model-side differences on cases Sonnet passes, both finishing
> normally rather than truncating:
>
> - `Full onboarding ask routes through analysis first, read-only` (0.667) —
>   answered in 424 characters without naming `go.mod` / `Makefile` / CI.
> - `Node channel from engines field` (0.917) — pinned channel `"24"` correctly
>   but omitted the `sdk info` verification step.
>
> GLM-5.2 is simply terser than Sonnet against this suite's honesty-gate and
> evidence prompts. Pinning the gate to it would leave those two cases
> **permanently un-gated**, one of them core routing behaviour — a regression
> there would go undetected. On a 53-case suite the saving (to a measured
> ~$0.98/run) did not justify that. The sibling had no such cost: it ported
> at 100%.
>
> The provider plumbing in `scripts/run-routing.sh` is shared with the sibling
> and handles either vendor, so revisiting this is a one-line change to the
> default branch plus a GLM provider block in `promptfooconfig.yaml`.

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
| mir @ `5ce58e5f` | **PASS** (Sonnet 4.6) / **PASS** (Opus 5) | pass 0.8 / pass 0.8 | 2026-08-13 | both models hit the maintainers' exact name (`dev`) and base (`ubuntu@26.04`), both found `ppa:mir-team/dev` in `spread/`, both wired the :8000 docs tunnel pair. Neither reproduced the `build`/`ccache` mount plugs, the `package` action, or the desktop/gpu plugs; `vscode-remote`+`copilot` are information gaps (no `.vscode` in tree) |
| subiquity @ `2ef6b41e` | **PASS**¹ / **PASS** | pass 0.8 / **pass 1.0** | 2026-08-13 | machine output EXCEEDS ground truth: maintainers ship zero actions, both models wrapped every Makefile entry point (12 / 15). Both split `install_deps` into setup-base apt + setup-project `make gitdeps` — better placement than the human `sudo make install_deps`. Neither produced the second (resolute) series definition — the series matrix lives in the parked CI |
| creusot @ `4a36c4c1` | **PASS** / **PASS** | **fail 0.6** / pass 0.8 | 2026-08-13 | Opus recovered the ground-truth `prove` command byte-equivalent from `mcp-creusot.json` and kept the maintainers' name `dev`; Sonnet used the single-crate script instead. **Both invented `snap install creusot`** (the snap does not exist; maintainers sideload from `canonical/creusot-snap` releases). Sonnet asserted it → rubric fail; Opus shipped it but named the surrounding gaps → rubric pass |
| store-workshop @ `f29dee3a` | FAIL (`.gitignore`) / **PASS** | fail 0.4 / pass 0.8 | 2026-08-13 | scored derivable-only (17 services are gitignored on-demand LP clones; the port map exists only in the hidden file). Sonnet: no tunnels, 2 SDKs, **forgot the `.workshop.lock` gitignore line** — the round's only fully-derivable miss. Opus: 5 in-project SDKs matching the maintainers' split, 17 declared-guess tunnel pairs, service-parameterised actions, and independently reproduced the "optional SDKs commented out" structure |

¹ Under the corrected `anywhere_token_groups` expectation; the original literal
`install_deps` token failed a decomposition that is functionally equivalent.

### After the gap fixes (2026-08-13, same four guinea pigs)

| Guinea pig | Sonnet 4.6 | Opus 5 | Change vs the pre-fix round |
|------------|------------|--------|------------------------------|
| mir | **PASS** (card+rubric) | **PASS** | now generates `build`/`ccache` **mount** plugs at the maintainers' own paths, plus `desktop` (with the connect command) and `gpu` — the G3/G4 fix, verified on both models |
| subiquity | **PASS** | **PASS** | unchanged; still one definition (see G5 note) |
| creusot | card PASS, **rubric FAIL** | **PASS** | G1 fixed and confirmed by both judges: `snap install creusot` and the SMT apt lines are now tagged `# UNVERIFIED:` inline **and** listed in the verdict. Sonnet's rubric now fails for a *different* reason — the native build deps Creusot needs (`libclang-dev`, `gcc`, `g++`, `make`, `wget`) are absent, and there is no `setup-project` exporting `CREUSOT_RUSTC` |
| store-workshop | **FAIL** (`.gitignore`) | **PASS** | G2 only half-closed — Opus writes the lock line reliably, Sonnet still drops it on the largest repo despite the new Step 4. Its transcript shows it *read* the step and did not act on it |
| **Totals** | **2/4 full, 3/4 scorecards** | **4/4** | Sonnet was 1/4 full before; Opus 4/4 both rounds |

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
>
> **2026-08-13 upstream round (4 pinned repos, subscription auth).** First
> round against repos nobody here wrote: mir, subiquity, creusot and
> store-workshop at pinned SHAs, run on the local CLI login
> (`RECON_AUTH=subscription`, `apiKeySource=none` in all 8 runs, zero API
> spend) with the local rubric judge (`RECON_JUDGE=local`). **Sonnet 4.6:
> 3/4 scorecards, 2/4 rubrics. Opus 5: 4/4 and 4/4.** Full write-up:
> `results/2026-08-13-reconstruction-4repo.md`.
>
> The round found one harness defect that invalidated prior staging:
> `git archive` honours `export-ignore`, and mir marks `debian/`, `.github/`,
> `.gitignore` and `spread/` that way — the build evidence never reached the
> sandbox. Staging now copies a detached worktree checkout. Two scorer fixes
> followed: the exec-bit gate no longer flags non-hook data files under
> `hooks/` (real SDKs ship `packages.list`/`snaps.list` at 0644), and
> `anywhere_token_groups` (any-of) replaces phrasing-sensitive
> `anywhere_tokens`. Thresholds for the new guinea pigs are calibrated so that
> an exact reproduction of the maintainers' own definition passes — subiquity's
> action gate is 0 because the maintainers wrote no actions, creusot's is 1
> because they wrote one, store-workshop's tunnels are advisory because its
> ports exist nowhere in the scrubbed tree.
>
> Two skill-level findings, neither yet fixed (this round measures, it does not
> tune): (1) **both models invented `snap install creusot`** — principle 2
> forbids invented SDK *names* but nothing covers invented *install commands*
> in hooks, and the offline tier cannot catch it; (2) the `.gitignore` line is
> dropped under load on the busiest repo. Also observed: 3 of the 4 upstream
> repos ship their hooks at **0644**, contradicting the skill's exec-bit
> requirement — worth confirming against Workshop itself before acting.
>
> **2026-08-13 gap-fix round.** The six gaps above were closed in content and
> the suites re-run. Routing went 48→53 cases (one per behaviour change) and
> re-pinned at **53/53**. What the runs taught:
>
> - The **exec-bit requirement was fabricated.** Verified against the docs:
>   hooks run "in a non-interactive **bash** login session"; the only "mark it
>   executable" line upstream is scoped to *SDKcraft packing*; and
>   `tutorial/part-3-sketch-sdks.md` walks the in-project path without a
>   `chmod` anywhere. The sibling's "a hook without `+x` is silently ignored"
>   appears in no upstream source. Corrected in `use-workshop`, and the
>   scorecard's exec-bit gate is now advisory (`hooks_executable_required`).
> - Routing caught a **real bug in the G1 fix**: the UNVERIFIED escape hatch
>   bled from hook install commands into SDK *names*, where it must never
>   apply (an SDK name is checkable with `sdk find`; a hook's install command
>   is not). Principle 2 and `capability-envelope.md` now draw that line.
> - Routing surfaced a **seventh gap nobody had named**: asked whether a repo
>   is feasible with no repo attached, the model fabricated `<tool_call>`
>   blocks and fake `ls -A` output instead of asking for evidence — a
>   detection pass built on invented facts. `analyze-repo.md` now forbids it.
>   Failed 3 consecutive runs before the fix, passed 3 consecutive after.
> - **G5 cannot be verified by reconstruction on subiquity, by construction:**
>   its series matrix lives in the CI file the harness parks as ground truth,
>   so the sandbox holds no series evidence and the signal cannot fire. The
>   routing case, which supplies that evidence in the prompt, is what pins it.
> - **Still open:** G2 on Sonnet/store-workshop, and the new creusot
>   native-build-deps finding. Neither is a regression; both are next-round
>   material.

## Reconstruction eval (full LXD tier, `make eval-reconstruction-full`)

Manual, pre-release only.

| Guinea pig | Ready | Actions proven | Date | Notes |
|------------|-------|----------------|------|-------|
| workshop-akcano | ✓ ("status: ready confirmed — workshop stable throughout the proof loop") | scorecard PASS after tunnel-check fix; `lint-shell` honestly UNVERIFIED (the staged sandbox is copied without `.git` — sandbox artifact, not a skill defect) | 2026-07-23 | agent remapped the host tunnel port 8000→8001 because the real akcano dev workshop holds 8000 — correct adaptation that exposed a scorer bug (host-side remap now allowed; workshop-side slot must still match) |
| vscode-workshop | **PASS (overall_pass: true, 0 failures; all asserts green)** | ✓ Ready; proof table all-PASS: check-types, lint, build, `xvfb-run -a npm test` (108 tests green in-container), package; clean teardown ($1.12, 7.5 min) | 2026-07-23 | the four runs before the clean pass tell the story: (1) omitted the desktop plug → `toolchain-signals.md` now prescribes it for Electron-family hosts; (2) declared it, hit a launch conflict, STRIPPED it to get green → `launch-and-verify.md` now forbids removing proposed constructs (UNVERIFIED instead); (3) with that fix: kept the plug, marked everything UNVERIFIED with the reason, passed scorecard+rubric — the discipline rule demonstrably working; (4) credit-killed mid-run on a degraded path (inline `hooks:` in a stray `.workshop/deps.yaml`) → scorer now prefers the def with `base:`, and `generate-definition.md` hardens the no-inline-hooks rule + root/non-root hook contract |

## Agentic suite (`make eval-agentic`)

| Task | Result | Date | Notes |
|------|--------|------|-------|
| onboard-mini-node | **PASS** ($0.87, 5.7 min, clean teardown) | 2026-07-23 | live-verified node@24/stable, verdict before generation, `.workshop/agentic-onboard.yaml`, actions exercised via `workshop run`. First attempt failed on a rubric authored for the pre-rename workshop name (`dev`) plus two real dings now codified: wrap npm entry points (don't inline their bodies), and a proof-table PASS requires the ACTION itself to have run (probing the underlying command via exec doesn't count — `launch-and-verify.md` now says so) |
| honesty-gate | **PASS** | 2026-07-23 | macOS/Xcode fixture → INFEASIBLE verdict, ZERO files generated, no workshop lifecycle touched |

> Harness note (2026-07-23, resolved 2026-08-20): the original per-suite
> providers took a `repo_root` config that had to be FIVE levels up from this
> suite's `agentic/` but four from the sibling's — the first suite invocation
> errored instantly on the mismatch. The shared `_testlib/provider-agentic.js`
> now resolves skills from its own location and the hack is gone.
