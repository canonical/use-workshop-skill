<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Encode the iterate loop's manual verifications as spread jobs under
`tests/`, then run them with `sdkcraft test` and report per-job results.
Smoke tests prove real functionality — an SDK that "installs" but cannot do
its job must fail its suite.
</objective>

<required_reading>
1. `references/spread-tests.md` — layout, `sdkcraft test` mechanics, the
   smoke-test menu
2. Templates: `templates/tests/`
</required_reading>

<process>

**Step 1. Lay out the suite from templates.** `tests/spread.yaml` (project
name, lxd backend, BASE variants matching the SDK's bases) plus one
directory per job: `tests/main/<job>/task.yaml` with its
`workshop.yaml.in`. The prepare idiom is fixed:

```
prepare: |
  envsubst '${BASE}' <workshop.yaml.in >workshop.yaml
  workshop launch
restore: |
  workshop remove || true
```

**Step 2. Always ship the launch job.** `workshop launch` succeeds and
`workshop info` reports the SDK healthy — the floor every SDK ships with.

**Step 3. One job per advertised capability**, from the smoke-test menu:
- Binary on PATH answers with the right version — `MATCH` against
  `EXPECTED_VERSION` pulled from the host at parse time
  (`'$(HOST: cat "$(git rev-parse --show-toplevel)/VERSION")'`, dots
  escaped for the regex).
- Service SDKs: probe the endpoint through the tunnel from the test.
- Mount-backed persistence: write → `workshop refresh` → read back.
- State hooks: mutate tracked state → refresh → confirm it survived.
Keep `execute:` blocks to real assertions (`MATCH`, exit codes); put
diagnostic output in `debug:` blocks.

**Step 4. Run.** `sdkcraft test` — it packs the platforms matching the
current architecture, copies them in via the try mechanism, installs
Workshop in the test environment, and skips variants for bases that were
not packed. Scope while iterating: `sdkcraft test --list` to enumerate
jobs, a positional spread expression to run one, `--shell` /
`--shell-after` / `--debug` to inspect.

**Step 5. Report per job** — `<suite>/<job> [variant]: pass|fail`, with the
failing job's output quoted. A red suite loops back to
`iterate-and-debug.md`; never weaken an assertion to go green without the
user agreeing the capability claim changed.
</process>

<verification>
- [ ] The launch job exists and passes.
- [ ] Every capability the README will advertise has a job.
- [ ] Version assertions read `VERSION` via the HOST idiom, not a pasted
      literal.
- [ ] `sdkcraft test` results were reported per job.
</verification>

<anti_patterns>
- Testing installation instead of functionality ("the binary exists").
- Hardcoding the version in an assertion — it goes stale on the first
  renovate bump.
- Variant names that don't match the packed bases — the jobs silently skip.
- Baking diagnostics into `execute:` so noise decides pass/fail.
- Green-by-weakening: editing the assertion instead of fixing the SDK.
</anti_patterns>

<success_criteria>
- `sdkcraft test` green across the declared bases, with jobs covering
  launch plus every advertised capability, reported per job.
</success_criteria>

<source_docs>
- `how-to/develop-sdks/build-an-sdk.md` (test your SDK)
- `reference/cli/sdkcraft.md` (the test section)
- `tutorial/part-4-craft-sdks.md`
</source_docs>
