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
`extractVersionTemplate` when upstream tags carry a `v` prefix.

**Step 3. Install the four workflow files** from
`templates/github-workflows/` into `.github/workflows/`: `build.yml` (PRs
into the track branch pattern), `upload.yml` (push to track branches;
`platforms` list matching the definition's platform layout, with
`platform-flag: "--platform"` for multi-base SDKs), `renovate.yml`,
`renovate-check.yml`. Set the branch patterns to the track style. The
upload secret starts as `SDKCRAFT_STORE_CREDENTIALS_STAGING` — deliberate;
flipping to `_PROD` is a `publish-store.md` decision.

**Step 4. Execute the git sequence — confirm each mutation first.** Per
track (sequence in `references/onboarding-ci.md`):

1. `git add -A && git commit` — everything, including `VERSION`
2. `git rm VERSION && git commit` — main is the template, it carries none
3. `git checkout -b <TRACK> HEAD~1` — the branch starts from the commit
   WITH `VERSION` (set the track's own version if it differs)
4. `git rm .github/workflows/renovate.yml .github/workflows/renovate-check.yml && git commit`
   — renovate runs from main only
5. `git checkout main`; repeat 3–4 per additional track
6. Push `main` and every track branch — pushing is outward-facing:
   confirm, then push

**Step 5. Verify the shape.** `git ls-tree` per branch: main has
`renovate.json` + both renovate workflows and NO `VERSION`; each track
branch has `VERSION` + `build.yml`/`upload.yml` and NO renovate workflows.
Report `git log --oneline` for each pushed branch.

**Step 6. Name what remains manual.** The repo secret
(`SDKCRAFT_STORE_CREDENTIALS_STAGING`) must exist for uploads — route to
`publish-store.md` if the Store side is not set up yet.
</process>

<verification>
- [ ] Preflight passed (adopt-info wiring, clean tree) before any mutation.
- [ ] Every git command was confirmed before running; pushes doubly so.
- [ ] Branch-shape check ran per branch (ls-tree, not recollection).
- [ ] renovate.json names every track in `baseBranchPatterns` with a
      matching `packageRules` entry.
- [ ] The user knows which secrets are still missing.
</verification>

<anti_patterns>
- Onboarding a repo whose definition hardcodes `version:` — renovate will
  bump `VERSION` and nothing will change.
- Leaving `VERSION` on main, or renovate workflows on a track branch.
- Inventing a datasource when the upstream scheme is unknown — ask, with a
  recommendation.
- Pointing `upload.yml` at the production secret during onboarding.
- Using a base (`24.04`) as a track name.
- Running the git sequence unconfirmed, or force-pushing anything.
</anti_patterns>

<success_criteria>
- main = template (renovate config + workflows, no VERSION); every track
  branch = VERSION + build/upload workflows; both pushed after
  confirmation; remaining manual steps named.
</success_criteria>

<source_docs>
- `how-to/develop-sdks/build-an-sdk.md` (start from the template)
- `how-to/develop-sdks/publish-an-sdk.md` (automate uploads from CI)
</source_docs>
