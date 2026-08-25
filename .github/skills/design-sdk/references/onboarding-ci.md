<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
The repo-automation model every published SDK follows: a template `main`
branch plus one long-lived branch per Store track, thin GitHub Actions
workflows delegating to `canonical/sdkcraft-actions`, and a renovate config
that bumps the `VERSION` file as upstream releases ship. The release loop,
end to end: Renovate opens a PR bumping `VERSION` on a version branch → the
merge triggers the upload workflow → the new revision lands in the
configured channels.
</overview>

<branching_model>
- `main` is the template branch: carries `renovate.json`, the two renovate
  workflows, and `forward-port.yml` — and NEVER a `VERSION` file, not even
  transiently. Renovate runs from main and targets the version branches.
- One branch per Store track (`latest`, or `1.24`-style): cut from main,
  adds `VERSION` in its own commit, carries the build/upload workflows
  (and, harmlessly, `forward-port.yml` — it only fires on pushes to main),
  and NOT the renovate workflows.
- Track ↔ branch-pattern conventions:

| Track style | Branch pattern | Typical users |
|---|---|---|
| Single `latest` | `latest` | jupyter, vscode-remote, copilot |
| Major only | `"[0-9]+"` | node, rust |
| Major.minor | `"[0-9]+.[0-9]+"` | go, uv |

- Forward-porting main into the version branches is automated:
  `forward-port.yml` (on push to main) calls `canonical/sdkcraft-actions`'
  forward-port workflow, which opens one `main → <track>` PR per branch
  listed in the repo variable `LONG_TERM_BRANCHES` (a JSON array such as
  `["1.24","1.25"]`), skips a branch that already has one open, and
  requests review from whoever pushed. Content changes land on main and
  flow outward; only `VERSION` differs per branch. This is why `VERSION`
  is added ON the track and never committed to main: with `VERSION` absent
  from the merge base, the forward-port merge leaves the track's copy
  alone — had main ever carried it, the first forward-port would delete it
  (untouched) or conflict on it (renovate-bumped).
</branching_model>

<git_sequence>
The scripted onboarding sequence (confirm with the user before each
mutation; repeat steps 2–4 per track with that track's version):

```bash
# 1. Commit everything EXCEPT VERSION on main — main never carries it
git add -A && git reset -q VERSION
git commit -m "Add renovate config and version-based workflows"
# 2. Cut each track from main
git checkout -b <track> main
# 3. The track adds its own VERSION in its own commit
echo "<version>" > VERSION && git add VERSION && git commit -m "Add <track> branch"
# 4. Version branches don't run renovate
git rm .github/workflows/renovate.yml .github/workflows/renovate-check.yml
git commit -m "Remove Renovate workflows from version branch"
# 5. Back to main; push both
git checkout main
git push origin main <track>
# 6. Tell the forward-port workflow which branches to target
gh variable set LONG_TERM_BRANCHES --body '["<track>"]'
```

Verify afterwards: `git show main --stat` has no `VERSION`; `git show
<track> --stat` has no renovate workflows; `git ls-tree $(git merge-base
main <track>) VERSION` prints nothing (the merge base must not carry it);
report the `git log --oneline` shape of both branches.
</git_sequence>

<workflows>
Each SDK ships five thin workflow files, all delegating to
`canonical/sdkcraft-actions@main` (copy from `templates/github-workflows/`;
only branch patterns, platforms, the platform flag, and the track list
vary):

- `build.yml` — `on: pull_request` into the version-branch pattern; calls
  the shared build workflow (installs LXD + sdkcraft, packs, runs `sdkcraft
  test` when `tests/spread.yaml` exists).
- `upload.yml` — `on: push` to the version-branch pattern (+
  `workflow_dispatch` with a `branch` input); calls the shared upload
  workflow with:
  - `platforms`: JSON array — architectures for single-base SDKs
    (`'["amd64","arm64"]'`, used with the default `--build-for`), or
    `<BASE>:<ARCH>` pairs for multi-base SDKs
    (`'["ubuntu@22.04:amd64","ubuntu@24.04:amd64"]'` with
    `platform-flag: "--platform"`). Match this to the `platforms:` layout in
    `sdkcraft.yaml`.
  - `risk`: the channel risk to release to (default `edge` — the template
    leaves it unset; `risk: "stable"` is the promotion step, see
    `store-publishing.md`); track defaults to the branch name.
  - `secrets.SDKCRAFT_STORE_CREDENTIALS`: **staging by default**
    (`SDKCRAFT_STORE_CREDENTIALS_STAGING`); flip to
    `SDKCRAFT_STORE_CREDENTIALS_PROD` only when the SDK is ready to publish
    for real — see `store-publishing.md`.
- `renovate.yml` — cron + `workflow_dispatch`, `contents`/`pull-requests`/
  `issues: write`, delegates with `secrets.token: ${{ secrets.GITHUB_TOKEN }}`.
- `renovate-check.yml` — validates `renovate.json` on PRs touching it.
- `forward-port.yml` — `on: push` to `main`; `contents`/`issues`/
  `pull-requests: write`; delegates with
  `long-term-branches: ${{ vars.LONG_TERM_BRANCHES }}`. The repo variable
  (a variable, not a secret) holds the JSON array of track branches — set
  it with `gh variable set LONG_TERM_BRANCHES --body '["1.24","1.25"]'` and
  keep it in step with `baseBranchPatterns`.

Both build and upload set a concurrency group
(`${{ github.workflow }}-${{ github.ref || github.run_id }}`,
`cancel-in-progress: true`).
</workflows>

<renovate_config>
`renovate.json` anatomy (template in `templates/renovate.json`): a custom
regex manager watching the `VERSION` file, `baseBranchPatterns` naming every
version branch, and one packageRule per track pinning `allowedVersions`:

```json
{
  "customManagers": [{
    "customType": "regex",
    "managerFilePatterns": ["/^VERSION$/"],
    "matchStrings": ["(?<currentValue>[0-9.]+)"],
    "depNameTemplate": "go",
    "datasourceTemplate": "golang-version",
    "versioningTemplate": "semver"
  }],
  "baseBranchPatterns": ["1.24", "1.25"],
  "packageRules": [
    {"matchPackageNames": ["go"], "matchBaseBranches": ["1.24"], "allowedVersions": "/^1\\.24\\./"},
    {"matchPackageNames": ["go"], "matchBaseBranches": ["1.25"], "allowedVersions": "/^1\\.25\\./"}
  ]
}
```

Datasource selection — ask what upstream actually publishes, then map:

| Upstream | `datasourceTemplate` | `depNameTemplate` example |
|---|---|---|
| npm package | `npm` | `@github/copilot` |
| GitHub releases | `github-releases` | `ollama/ollama` |
| PyPI package | `pypi` | `jupyterlab` |
| Node.js runtime | `node-version` | `node` |
| Go runtime | `golang-version` | `go` |

Add `"extractVersionTemplate": "^v(?<version>.*)$"` when upstream tags are
`v`-prefixed (github-releases datasources usually are). Never invent a
datasource: when the upstream's release channel is unclear, ask, with a
recommendation.

Secondary pins: `VERSION` names only the primary upstream. When a part pins
a second component — a bundled Node runtime (`npm-node-version: 22.22.1`),
a `source-tag`, a checksum beside a download URL — the pin lives inline in
`sdkcraft.yaml` and gets its own regex manager over that file, so the
version (and its digest, captured as `currentDigest` when one sits beside
it) bump together in one PR, instead of a second `VERSION-<part>` file
(`canonical/template-sdk#3` settled on inline pins):

```json
{
  "customType": "regex",
  "managerFilePatterns": ["/^sdkcraft\\.yaml$/"],
  "matchStrings": ["npm-node-version: (?<currentValue>[0-9.]+)"],
  "depNameTemplate": "node",
  "datasourceTemplate": "node-version"
}
```

Shipped example of the inline pin: the `pi-coding-agent` and `oh-my-pi`
SDKs carry `npm-node-version` in `sdkcraft.yaml` beside the `VERSION`-driven
npm part.
</renovate_config>

<version_file>
`VERSION` holds the bare upstream version string (no `v` prefix, no
newline-sensitive tooling — one line). It is the single point renovate
bumps, `override-pull` reads (`craftctl set version=$(cat
"$CRAFT_PROJECT_DIR/VERSION")`), and spread tests can assert against. Each
version branch pins its own `VERSION`.
</version_file>

<source_docs>
- `how-to/develop-sdks/build-an-sdk.md` (what the template repo ships: VERSION, renovate.json, CI workflows)
- `how-to/develop-sdks/publish-an-sdk.md` (the CI release loop, credentials secret, staging-by-default upload)
</source_docs>
