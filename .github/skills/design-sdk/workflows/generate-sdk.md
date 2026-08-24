<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Materialize an approved Design Proposal as the SDK source tree:
`sdkcraft.yaml`, `VERSION`, `hooks/`, `services/` (if a daemon), and the
`tests/` scaffold. Generation is not done until the SDK has been through the
try loop — hand off to `iterate-and-debug.md` at the end.
</objective>

<required_reading>
1. `references/sdkcraft-definition.md` — field-level ground truth
2. `references/runtime-hooks.md` — hook contract and per-hook patterns
3. `references/anti-patterns.md` — the trap table for the self-check
4. Templates: `templates/` here (`minimal/`, `binary/`, `service/`,
   `hooks/`, `tests/`)
</required_reading>

<process>

**Step 1. Pick the base template.** `templates/minimal/sdkcraft.yaml`
(version-only, everything in hooks), `templates/binary/sdkcraft.yaml`
(pinned upstream binary as a part), or `templates/service/sdkcraft.yaml`
(daemon: binary part + services part + tunnel slot). `sdkcraft init` is the
CLI equivalent for a bare scaffold; the templates carry the proposal-shaped
structure, so prefer them. Replace every placeholder.

**Step 2. Write `sdkcraft.yaml` with `adopt-info` + `VERSION` from day
one.** Never hardcode `version:` — the version-owning part reads
`$CRAFT_PROJECT_DIR/VERSION` and calls `craftctl set version` in
`override-pull`. This makes repo onboarding (`onboard-repo.md`) a
no-rewrite step. Write `VERSION` with the current upstream version, one
line. Respect the proposal exactly: platforms, parts, plugs/slots with the
approved names and endpoints.

**Step 3. Write the hooks.** Copy stubs from `templates/hooks/`; keep only
the hooks the proposal names; fill each per the patterns in
`references/runtime-hooks.md`. Every hook: `chmod +x`, bash, and
shellcheck-clean — pack fails otherwise. apt installs go in `setup-base`;
user-context config and service enablement in `setup-project`; probes of
real functionality in `check-health`.

**Step 4. Write the service unit (daemon SDKs).** `services/<NAME>.service`
staged by a `dump` part sourcing `services/`, installed and enabled by
`setup-project`:

```
install -D --mode=644 --target-directory ~/.config/systemd/user "$SDK/<NAME>.service"
systemctl --user daemon-reload
systemctl --user enable --now <NAME>
```

**Step 5. Scaffold `tests/`.** Copy `templates/tests/` (spread.yaml + the
launch job with its `workshop.yaml.in`); set the project name and BASE
variants to the proposal's bases. Full test authoring happens in
`write-spread-tests.md`; the scaffold ships now so `sdkcraft test` has a
suite from the first commit.

**Step 6. Self-check against the trap table.** Walk
`references/anti-patterns.md` end to end. Non-negotiables: no
`stage-packages`/`stage-snaps`; no `apps:`/`services:` key; quoted
numeric-looking `version:` values; no reserved names (`agent`, `system`,
`sketch`, `try-*`, `project-*`); singleton plug names for
camera/desktop/gpu/ssh-agent; every mount path under `$SDK` exists in prime
(or `override-prime: mkdir -p` it); `version:` XOR `adopt-info:`;
`adopt-info` names a real part.

**Step 7. List every written file, then hand off** to
`iterate-and-debug.md`. Generation without a try run is an unfinished
state, not a deliverable.
</process>

<verification>
- [ ] Every construct in the files traces to a Design Proposal line — no
      silent additions or omissions.
- [ ] `VERSION` exists; `adopt-info` names the part that reads it.
- [ ] Hooks are executable and pass `shellcheck --shell=bash`.
- [ ] The self-check (Step 6) was walked explicitly, not recalled.
- [ ] `tests/spread.yaml` and the launch job exist.
- [ ] The user knows every path that was written.
</verification>

<anti_patterns>
- Hardcoding `version:` "just for now" — onboarding will have to rewrite
  the definition and the part.
- Synthesizing YAML from memory instead of copying a template.
- An `apps:` or `services:` KEY in sdkcraft.yaml — daemons are a dump part
  plus a systemd user unit, nothing else.
- `stage-packages` in a part — sdkcraft hard-rejects it; apt work belongs
  in `setup-base`.
- Starting a daemon by exec'ing it from a hook script instead of
  `systemctl --user enable --now` on an installed unit.
- A mount plug or slot pointing under `$SDK` at a directory that is not in
  prime — the interface linter blocks the pack.
- Skipping the hand-off: declaring the SDK done because the files look
  right.
</anti_patterns>

<success_criteria>
- The SDK source tree matches the approved proposal exactly, passes the
  trap-table self-check, and is on its way into the try loop.
</success_criteria>

<source_docs>
- `reference/definition-files/sdkcraft-definition.md`
- `reference/definition-files/schema-sdkcraft.json`
- `how-to/develop-sdks/build-an-sdk.md`
- `how-to/develop-sdks/write-runtime-hooks.md`
- `how-to/develop-sdks/declare-plugs-slots.md`
- `how-to/develop-sdks/configure-mount.md`
</source_docs>
