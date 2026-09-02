<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
How SDK repos structure spread tests and what `sdkcraft test` adds over bare
spread: it packs the SDK for every platform matching the current
architecture, copies the artifacts into the test environment via the try
area, installs Workshop there, and skips spread variants whose base wasn't
packed. Smoke tests encode the manual checks from the try loop so they run on
every PR.
</overview>

<layout>
Fixed layout, required by `sdkcraft test` (it refuses to run without
`tests/spread.yaml`):

```
tests/
├── spread.yaml                # project, backend, suites, base variants
└── main/
    └── <job>/
        ├── task.yaml          # summary, prepare, execute, restore, debug
        └── workshop.yaml.in   # test workshop consuming try-<name>
```

```yaml
# tests/spread.yaml
project: <name>
path: /home/ubuntu/project
backends:
  lxd:
    systems:
      - ubuntu-24.04:
          username: ubuntu
          vm: true
suites:
  main/:
    summary: Test the <name> SDK inside workshops
    environment:
      BASE/noble: ubuntu@24.04
```

Variant names under `environment:` (`BASE/jammy`, `BASE/noble`,
`BASE/resolute`) are how one job runs against several bases — `sdkcraft
test` drops the variants whose base wasn't packed. Host-side values can be
captured at parse time:

```yaml
# tests/spread.yaml
      EXPECTED_VERSION: '$(HOST: cat "`git rev-parse --show-toplevel`/VERSION")'
```
</layout>

<task_shape>
```yaml
# tests/main/launch/task.yaml
summary: Launch a workshop with the <name> SDK and verify setup
prepare: |
  envsubst '${BASE}' <workshop.yaml.in >workshop.yaml
  workshop launch
restore: |
  workshop remove || true
execute: |
  workshop exec -- bash -lc '<name> --version' | MATCH "<version-regex>"
debug: |
  workshop exec -- bash -lc 'echo PATH=$PATH' || true
```

```yaml
# tests/main/launch/workshop.yaml.in
name: test-<name>
base: ${BASE}
sdks:
  - name: try-<name>
```

Conventions: `envsubst` renders the base variant into the definition;
`restore:` always tears down with `|| true`; assertions go through spread's
`MATCH`; a `debug:` block dumps environment state on failure. Commands run
inside the workshop via `workshop exec -- bash -lc '...'` — the login shell
is what picks up profile.d.
</task_shape>

<smoke_test_menu>
Always ship the `launch` job; add one job per advertised capability:
- Binary on PATH + version: `workshop exec -- bash -lc '<tool> --version' | MATCH ...`
  (escape dots when matching an exact `$EXPECTED_VERSION`).
- Service responds: probe through the tunnel slot's port or via the tool's
  own client command; health already gates Ready, so probe the feature.
- Persistence round-trip: write into the mount-backed path, `workshop
  refresh`, assert the data survived.
- State round-trip (SDKs with save/restore-state): change the tool setting,
  refresh, assert it stuck.
- Health honesty: `workshop info | MATCH 'status:\s+ready'` — `ready` is
  the workshop status that every SDK's `check-health` rolls up into.
  `okay` is only what the hook reports through `workshopctl set-health`;
  `workshop info` never prints it, and there is no per-SDK health line.

Keep the suite small and fast — these run in CI on every PR via the shared
build workflow.
</smoke_test_menu>

<running>
- `sdkcraft test` — full suite (packs, tries, provisions an LXD container
  per job).
- `sdkcraft test --list` — enumerate jobs without running.
- `sdkcraft test <spread-expression>` — one suite/job/variant.
- `--shell` / `--shell-after` / `--debug` — drop into the test container
  (before, after, or on failure).
Report results per job, quoting the failing job's output verbatim.
</running>

<source_docs>
- `how-to/develop-sdks/build-an-sdk.md` (test layout, starter job, smoke example)
- `reference/cli/sdkcraft.md` (`sdkcraft test` behavior and flags)
- `explanation/sdks/concepts.md` (try area mechanics the harness relies on)
</source_docs>
