<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Reconstruction round: four upstream repos, machine vs maintainer

**Date:** 2026-08-13 · **Tier:** offline · **Auth:** local Claude subscription
(`apiKeySource=none` in all eight runs — zero API spend) · **Judge:**
`provider-judge-cli.js` on the same subscription.

Four real repositories were cloned at pinned SHAs, stripped of every trace of
their maintainer-written Workshop setup, handed to the `onboard-workshop`
skill, and the result compared against what the maintainers actually wrote.

| Repo | SHA | What the maintainers wrote |
|---|---|---|
| `canonical/mir` | `5ce58e5f` | `.workshop/dev.yaml` + in-project `mir` SDK |
| `canonical/subiquity` | `2ef6b41e` | `subiquity-noble.yaml` + `subiquity-resolute.yaml` + `install-deps` SDK |
| `locnnil/formally-verify-rust-neetcode-with-creusot` | `4a36c4c1` | `.workshop/dev.yaml` + `fv` SDK |
| `canonical/store-workshop` | `f29dee3a` | `store-jammy.yaml` + 6 in-project SDKs, 16 tunnel plugs |

## Headline

| Guinea pig | Sonnet 4.6 scorecard | Sonnet rubric | Opus 5 scorecard | Opus rubric |
|---|---|---|---|---|
| mir | **PASS** | **pass** (0.8) | **PASS** | **pass** (0.8) |
| subiquity | **PASS**¹ | **pass** (0.8) | **PASS** | **pass** (1.0) |
| creusot | **PASS** | **fail** (0.6) | **PASS** | **pass** (0.8) |
| store-workshop | FAIL (`.gitignore`) | fail (0.4) | **PASS** | **pass** (0.8) |
| **Total** | **3/4** | 2/4 | **4/4** | **4/4** |

¹ Under the corrected expectation — see *Harness corrections* below. As
originally written the threshold failed subiquity for a phrasing difference,
not a capability one.

Runtime ≈ 31 min per pass (4 repos, serialised); 6–9 min per repo.

## Method

- **Clean room.** Each repo is checked out at its pinned SHA into a detached
  worktree and copied **without `.git`** — so the commit history that added the
  definition never reaches the sandbox. No `.workshop.lock`.
- **Ground truth parked.** `.workshop/*.yaml` and every `.workshop/<sdk>/` with
  an `sdk.yaml` are moved out of the tree before the agent starts.
- **Everything else scrubbed.** Every remaining file mentioning Workshop is
  redacted line-wise, so arguments (workshop names, SDK names, ports) cannot
  leak: mir 5 files, subiquity 2 + its workshop-driving `ci.yaml` parked,
  creusot 1, store-workshop 4 (including its entire README and Makefile).
  Residual mentions after scrubbing: **0 in all four repos.**
- **Sandbox path neutralised** for `store-workshop` (the agent's cwd would
  otherwise have said "workshop").
- **Non-definition files rescued.** creusot keeps real project tooling under
  `.workshop/` (`prove_one.sh`, `verify_one.sh`, `proofstat.py`,
  `new_crate.sh`); these were relocated to `scripts/` with their call sites
  rewritten rather than deleted with the definition.

## Per-repo comparison

### mir — closest match of the four

| | Maintainers | Sonnet 4.6 | Opus 5 |
|---|---|---|---|
| name | `dev` | `dev` ✓ | `dev` ✓ |
| base | `ubuntu@26.04` | `ubuntu@26.04` ✓ | `ubuntu@26.04` ✓ |
| Store SDKs | `vscode-remote`, `copilot` | — (+`rust`) | — (+`rust`) |
| in-project SDK | `mir` | `mir-deps` | `mir-toolchain` |
| docs tunnel | slot+plug :8000 | ✓ :8000 | ✓ :8000 |
| actions | cmake, build, package, test, doc, ccache | configure, build, test, lint, docs-html, docs-run | +ctest, symbols-check, coverage, run, run-headless, docs-linkcheck, docs-lint (15) |

Both models independently landed the maintainers' exact workshop **name** and
**base**, and both found `ppa:mir-team/dev` — from `spread/ubuntu/task.yaml`, a
directory `git archive` would have silently dropped (see *Harness
corrections*). Sonnet enumerated the 35 `Build-Depends` from `debian/control`
where the maintainers simply run `apt-get build-dep mir`: more verbose,
functionally the same.

**Real divergences.** Neither model reproduced the maintainers' `build` and
`ccache` **mount plugs**, which deliberately place the build tree and ccache
outside the project mount (`~/build`, `~/.cache/ccache`); both build in-tree.
Neither produced the `package` action (`dpkg-buildpackage`) or the `desktop`/
`gpu` plugs that let a developer actually run the compositor. `vscode-remote`
and `copilot` are **information gaps** — no `.vscode` artifacts exist in the
tree to signal them.

### subiquity — machine output exceeds the maintainers'

The maintainers' definition is minimal: two series variants, one SDK, and **no
actions at all**. Both models produced a single definition with a full action
set (Sonnet 12, Opus 15) wrapping every Makefile entry point — `unit`, `api`,
`integration`, `check`, `coverage`, `lint`, `format`, `dryrun`,
`dryrun-server`, docs.

Both split `make install_deps` correctly rather than copying it: apt packages
into `setup-base` (root, pre-mount) and `make gitdeps` into `setup-project`.
The maintainers run `sudo make install_deps` from `setup-project` — the split
is arguably the better placement.

**Real divergence.** Both produced one definition where the maintainers ship
`subiquity-noble` **and** `subiquity-resolute`. This is an information gap: the
CI matrix that iterates series was parked as ground truth, and
`snapcraft.yaml` pins `core24` only. Both also added a docs tunnel on :8000 the
maintainers don't have — harmless surplus.

### creusot — where the two models separated

| | Maintainers | Sonnet 4.6 | Opus 5 |
|---|---|---|---|
| name / base | `dev` / `ubuntu@26.04` | `creusot` / `ubuntu@24.04` | `dev` ✓ / `ubuntu@24.04` |
| SDKs | `rust`, `uv`, `copilot`, `project-fv` | `rust`, `project-tools` | `rust` (live `sdk info`), `project-creusot` |
| `prove` | `cargo creusot -- --workspace …` | wraps `scripts/prove_one.sh` | **byte-equivalent to ground truth** |

Opus recovered the maintainers' `prove` command exactly — it read
`mcp-creusot.json`, which carries the literal `prove_command` — *and* wrapped
the four relocated helper scripts as extra actions. Sonnet used the
single-crate script for `prove` and missed the whole-workspace form.

**The finding worth acting on:** both models install Creusot with
`snap install creusot`. That snap does not exist; the maintainers sideload a
`.snap` from `canonical/creusot-snap` GitHub releases with
`--dangerous --classic`. The download URL is genuinely absent from the scrubbed
tree, so *inventing an install path* is the failure mode, not *not knowing the
URL*. The difference between the two runs is honesty: Sonnet asserted it
(rubric fail), Opus shipped the same command but named "no Store SDK for
Creusot, snap confinement unverified" as explicit gaps (rubric pass). Neither
marked the install itself UNVERIFIED, which is what the honesty gate should
have produced.

### store-workshop — the deliberately unreconstructable one

Its 17 microservices are cloned on demand from Launchpad and gitignored, so
the tree the agent sees has **no services and no ports**; its README, Makefile
and AGENTS.md are themselves workshop-authored and are gutted by the scrub.
Scored derivable-only by design; the real test is criterion (c) — name the gap
or invent?

- **Sonnet** produced no tunnels at all, two in-project SDKs, and *forgot the
  `.gitignore` line* — the one genuine, fully derivable miss in the round.
- **Opus** produced 5 in-project SDKs (`devel`, `cassandra`, `charmcraft`,
  `go-dev`, `sca` — matching the maintainers' split almost exactly), 17 tunnel
  pairs on sequential ports 8001–8017, service-parameterised actions
  (`start-db`, `run`, `test`, `lint` taking a service name), and independently
  reproduced the maintainers' "optional SDKs commented out by default"
  structure. It named "unknown ports" and "redacted Makefile bodies" as gaps.

Neither could recover the real port map (`5000`, `8000`–`8021` with two
remapped collisions) — it exists only in the hidden file. Opus's sequential
ports are a **declared guess**, which is the honest available move; the base
(`24.04` vs `22.04`) is likewise unpinned by any surviving evidence.

## Findings for the skill

1. **Invented install paths survive the honesty gate.** Both models emitted
   `snap install <name>` for a snap that does not exist, in one case while
   simultaneously listing "no Store SDK exists" as a gap. Principle 2 forbids
   invented SDK names; it does not visibly cover invented *install commands* in
   hooks. Worth an explicit rule: an install path not evidenced in the repo is
   tagged UNVERIFIED in the hook and in the report.
2. **The `.gitignore` line is dropped under load.** It is in
   `<success_criteria>` and was the sole scorecard failure of the round
   (Sonnet/store-workshop) — the one repo where the agent had the most to
   juggle.
3. **Mount interfaces for build artefacts are not being reached for.** mir's
   maintainers deliberately keep the build tree and ccache off the project
   mount; neither model considered it on the repo where it matters most.
4. **Multi-series repos.** Neither model proposed parallel definitions for
   subiquity. Defensible on the scrubbed evidence, but a signal worth adding to
   `toolchain-signals.md` if series matrices are common.

Nothing under `SKILL.md`, `references/`, `workflows/` or `templates/` was
changed for this round — the run measures the skill as it stands.

## Harness corrections made during this round

1. **`git archive` was silently deleting evidence.** It honours
   `export-ignore`; mir marks `debian/`, `.github/`, `.gitignore` and `spread/`
   that way, so the primary build evidence never reached the sandbox. Staging
   now copies a detached worktree checkout instead. This affected every prior
   run against any tarball-shipping repo.
2. **Exec-bit check flagged data files.** `hooks/` may legitimately hold
   `packages.list` / `snaps.list` at 0644; only the five real hook names are
   checked now. (Related observation: 3 of these 4 upstream repos ship their
   hooks at **0644**, which contradicts the skill's stated requirement — worth
   confirming against Workshop itself.)
3. **`anywhere_tokens` was all-of and phrasing-sensitive.** Added
   `anywhere_token_groups` (any-of); subiquity's dependency bootstrap now
   accepts either wrapping `install_deps` or decomposing it.
4. **Thresholds calibrated so an exact reproduction of the human answer
   passes** — subiquity's action gate relaxed to 0 (the maintainers wrote none),
   creusot's to 1 (they wrote one), store-workshop's tunnels made advisory.
   Every expectations file now records *why* each threshold is what it is.
5. New: remote SHA-pinned guinea pigs, `RECON_AUTH=subscription`,
   `RECON_JUDGE=local`, repo-wide scrubbing with a per-repo scrub report,
   sandbox-name neutralisation, free workshop naming on the offline tier.

## Limitations

- **Offline tier: nothing was launched.** No action was proven to run. The
  `snap install creusot` defect is exactly the class the full LXD tier exists
  to catch, and it slipped past both the scorecard and (for Opus) the rubric.
- **The rubric penalises information gaps it cannot see.** It marked
  store-workshop down for missing ports that exist nowhere in the sandbox.
  Scorecard advisories handle this; the rubric does not know which gaps were
  knowable.
- **Expectations are curated judgement**, calibrated so the maintainers' own
  answer passes. They are not an objective standard.
- **Single sample per repo per model.** These are agentic runs; run-to-run
  variance is real and none of the deltas here are statistically established.
