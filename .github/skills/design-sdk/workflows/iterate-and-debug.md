<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Drive the try-refresh loop until the SDK builds, installs, and reports
healthy in a real workshop — then graduate the manual checks into spread
tests. This is the fail-fast core of the skill: every generated or edited
SDK passes through here before it is called done.
</objective>

<required_reading>
1. `references/runtime-hooks.md` — which hook runs when, as whom
2. `../use-workshop/references/command-cheatsheet.md` — verbatim `workshop`
   signatures
3. `../use-workshop/references/async-and-recovery.md` — change/task model,
   recovery flags
4. `references/spread-tests.md` — for the graduation step
</required_reading>

<process>

**Step 1. Build into the try area.** `sdkcraft clean && sdkcraft try` — the
deterministic default; `clean` may be skipped only when nothing but hook
bodies changed since the last try. Useful flags: `--verbose`;
`--platform <p>` / `--build-for <arch>` to target one platform;
`--destructive-mode` for speed on a disposable host; `--debug` to shell
into the build environment on failure; `--shell-after` to inspect a
successful build. Confirm from the output that the artifact landed in the
try area.

**Step 2. Consume as a try SDK.** Test workshop from
`templates/test-workshop.yaml`: `base` matching a packed platform, the SDK
listed as `- name: try-<NAME>`. Tunnel plugs graft onto the system SDK in
the test definition when the SDK exposes a service (shape in the template's
comments).

**Step 3. First run, fail fast.**
`workshop launch --verbose --wait-on-error` (single-workshop constraint —
one `--wait-on-error` workshop at a time). Subsequent iterations:
`workshop refresh` (add `--wait-on-error` while diagnosing).

**Step 4. Verify.** The triplet — `workshop changes` →
`workshop tasks <ID>` → `workshop info` — after every launch/refresh; the
SDK's health line in `workshop info` must be okay. Then hook-specific
checks via `workshop exec`:
- `setup-base`: the installed packages/files exist; `/etc/profile.d/<NAME>.sh`
  says what it should.
- `setup-project`: user-context config exists;
  `systemctl --user status <NAME>` active for daemon SDKs.
- `check-health`: exercise the same probe by hand and compare.
- state hooks: mutate → `workshop refresh` → confirm the state survived.

**Step 5. On failure, investigate in place.** The workshop parks in
`Waiting`: `workshop shell` in, run the failing hook body by hand — as the
right user (`setup-project` runs as `workshop`; root hooks may need
`sudo -u workshop --login` for user-context probes). Quote the failing
`workshop tasks` output in the report — never summarize from memory. Fix
the SDK source, `workshop refresh --abort` (or `workshop launch --abort`)
to release the parked workshop, back to Step 1.

**Step 6. Respect setup-base semantics.** An applied refresh does NOT
re-run `setup-base` — it reuses the post-setup-base snapshot. After editing
`setup-base`, recreate: `workshop remove` then `launch` (the one legitimate
remove+launch case). A change to an SDK also invalidates the snapshot of
every SDK listed BELOW it in the definition — expect those to re-run.

**Step 7. Graduate.** When the manual checks pass twice in a row, encode
each as a spread job — hand off to `write-spread-tests.md`. A pass that
lives only in the transcript is not a regression net.

`workshop sketch-sdk` is the interactive (human-only, `$EDITOR`) way to
prototype an SDK in place; the agent-drivable equivalent is prototyping a
command via `workshop exec` before baking it into a hook, then this loop.
</process>

<verification>
- [ ] Every `sdkcraft try` was confirmed from output, not assumed.
- [ ] Every launch/refresh was followed by the triplet, and the SDK's
      health state was reported.
- [ ] Failures were diagnosed from `workshop tasks` output quoted in the
      report.
- [ ] setup-base edits went through remove+launch, not refresh.
- [ ] The loop ended in either a healthy SDK or an explicit blocked report.
</verification>

<anti_patterns>
- Iterating on `setup-base` via refresh and concluding the edit "didn't
  take".
- Editing files inside the workshop to make it healthy — the SDK source is
  the artifact; a fix that lives only in the container evaporates on the
  next launch.
- Guessing why a change failed instead of reading `workshop tasks <ID>`.
- Leaving a `--wait-on-error` workshop parked and starting another.
- Calling the SDK done after a green build with no launch, or a launch with
  no health check.
- Walking the user through a `sketch-sdk` editor session step by step.
</anti_patterns>

<success_criteria>
- The SDK packs, launches as `try-<NAME>`, and reports healthy; every
  advertised capability was exercised at least once; the checks that proved
  it are queued for spread.
</success_criteria>

<source_docs>
- `how-to/develop-sdks/build-an-sdk.md` (the iterate loop)
- `explanation/sdks/concepts.md` (the try area, `try-` naming)
- `explanation/sdks/lifecycle.md` (sketch → in-project → build → publish)
- `explanation/sdks/runtime-hooks.md` (snapshot and ordering semantics)
- `reference/cli/sdkcraft.md`
- `reference/cli/workshop.md`
</source_docs>
