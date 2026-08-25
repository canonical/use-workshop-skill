<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Bring the SDK repo to the template model: `main` as the renovate-driven
template branch, one long-lived branch per release track carrying
`VERSION`, thin CI workflows delegating to `canonical/sdkcraft-actions`.
This workflow runs git mutations — each is confirmed with the user before
it executes.
</objective>

<required_reading>
1. `references/onboarding-ci.md` — the branching model, workflow files,
   renovate anatomy, and the git sequence
2. Templates: `templates/renovate.json`, `templates/github-workflows/`
</required_reading>

<process>

**Step 1. Preflight.** Confirm: `VERSION` exists and `sdkcraft.yaml` uses
`adopt-info` with the part reading it (if not, fix via `generate-sdk.md`
Step 2 first); tracks decided (single `latest` vs per-major/major.minor);
datasource and dep name known; the working tree is clean and on `main`.
Anything open → one batched question set with recommendations.

**Step 2. Fill `renovate.json`** from the template: the custom regex
manager on `/^VERSION$/`, `depNameTemplate`/`datasourceTemplate` for the
upstream, `baseBranchPatterns` naming every track branch, one
`packageRules` entry per track pinning `allowedVersions`, and
`extractVersionTemplate` when upstream tags carry a `v` prefix. A part
that pins a second component inline (`npm-node-version`, a `source-tag`, a
checksum) gets a second regex manager over `sdkcraft.yaml` — "Secondary
pins" in `references/onboarding-ci.md`.

**Step 3. Install the five workflow files** from
`templates/github-workflows/` into `.github/workflows/`: `build.yml` (PRs
into the track branch pattern), `upload.yml` (push to track branches;
`platforms` list matching the definition's platform layout, with
`platform-flag: "--platform"` for multi-base SDKs), `renovate.yml`,
`renovate-check.yml`, `forward-port.yml` (push to main; targets the
branches listed in the `LONG_TERM_BRANCHES` repo variable). Set the branch
patterns to the track style. The
upload secret starts as `SDKCRAFT_STORE_CREDENTIALS_STAGING` — deliberate;
flipping to `_PROD` is a `publish-store.md` decision.

When the user asks for one of these files directly and only bounded knobs
are open (track-branch pattern, platform layout), write the file from the
template with the recommended defaults and mark the knobs inline — name
`canonical/sdkcraft-actions` and flag the choices for confirmation rather
than holding the file hostage to the interview.

**Step 4. Execute the git sequence — confirm each mutation first.** Per
track (sequence in `references/onboarding-ci.md`):

1. `git add -A && git reset -q VERSION && git commit` — everything EXCEPT
   `VERSION`: main never carries it, not even for one commit
2. `git checkout -b <TRACK> main` — the track is cut from main
3. `echo "<version>" > VERSION && git add VERSION && git commit` — the
   track's own `VERSION`, in its own commit, so the merge base with main
   has none and forward-ports merge clean
4. `git rm .github/workflows/renovate.yml .github/workflows/renovate-check.yml && git commit`
   — renovate runs from main only
5. `git checkout main`; repeat 2–4 per additional track
6. Push `main` and every track branch — pushing is outward-facing:
   confirm, then push
7. `gh variable set LONG_TERM_BRANCHES --body '["<TRACK>", ...]'` — the
   forward-port workflow's target list; outward-facing, confirm first

**Step 5. Verify the shape.** `git ls-tree` per branch: main has
`renovate.json` + both renovate workflows and NO `VERSION`; each track
branch has `VERSION` + `build.yml`/`upload.yml` and NO renovate workflows;
`git ls-tree $(git merge-base main <TRACK>) VERSION` prints nothing.
Report `git log --oneline` for each pushed branch.

**Step 6. Name what remains manual.** The repo secret
(`SDKCRAFT_STORE_CREDENTIALS_STAGING`) must exist for uploads — route to
`publish-store.md` if the Store side is not set up yet — and the
`LONG_TERM_BRANCHES` variable must list every track branch (if `gh` was
unavailable, name the exact command).
</process>

<verification>
- [ ] Preflight passed (adopt-info wiring, clean tree) before any mutation.
- [ ] Every git command was confirmed before running; pushes doubly so.
- [ ] Branch-shape check ran per branch (ls-tree, not recollection), and
      the merge base of main and each track carries no `VERSION`.
- [ ] renovate.json names every track in `baseBranchPatterns` with a
      matching `packageRules` entry.
- [ ] The user knows which secrets are still missing.
</verification>

<anti_patterns>
- Onboarding a repo whose definition hardcodes `version:` — renovate will
  bump `VERSION` and nothing will change.
- Leaving `VERSION` on main, or renovate workflows on a track branch.
- Committing `VERSION` on main and removing it afterwards (branching from
  `HEAD~1`) — it lands in the merge base, and the first forward-port
  deletes or conflicts on it.
- Inventing a datasource when the upstream scheme is unknown — ask, with a
  recommendation.
- Pointing `upload.yml` at the production secret during onboarding.
- Using a base (`24.04`) as a track name.
- Running the git sequence unconfirmed, or force-pushing anything.
</anti_patterns>

<success_criteria>
- main = template (renovate config + workflows, never VERSION); every
  track branch = its own VERSION commit + build/upload workflows; both
  pushed after confirmation; `LONG_TERM_BRANCHES` set or named among the
  remaining manual steps.
</success_criteria>

<source_docs>
- `how-to/develop-sdks/build-an-sdk.md` (start from the template)
- `how-to/develop-sdks/publish-an-sdk.md` (automate uploads from CI)
</source_docs>
