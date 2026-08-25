<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Publisher-side traps: each row is a wrong move that looks plausible (usually
snapcraft muscle memory or a plausible-but-dead key), why it fails, and the
right move. `generate-sdk.md` runs its self-check against this table before
handing anything to the try loop.
</overview>

<traps>
| # | Wrong move | Why it fails | Right move |
|---|-----------|--------------|------------|
| 1 | `apps:`/`services:`/`daemons:` key in sdkcraft.yaml | No such keys — the schema rejects unknown fields | Daemon = unit file in a `dump` part + `systemctl --user enable --now` in `setup-project` |
| 2 | `stage-packages:`/`stage-snaps:` in a part | Hard-rejected by SDKcraft at load time | apt/snap installation in `setup-base` (apt cache + security updates) |
| 3 | Exec'ing a daemon directly from a hook | Hook processes aren't service-managed; hooks should configure, not run, the workload | The systemd user-unit pattern (`design-best-practices.md`) |
| 4 | `interface: ssh`, or a gpu plug named `nvidia` | The interface is `ssh-agent`; `camera`/`desktop`/`gpu`/`ssh-agent` plugs must be NAMED after their interface | Singleton names: `gpu: {interface: gpu}` etc. |
| 5 | Unquoted numeric-looking strings (`version: 1.0`, channel `24/stable` unquoted in YAML) | YAML parses them as numbers | Quote them: `version: "1.0"` |
| 6 | Reserved or prefixed names (`system`, `sketch`, `agent`, `try-*`, `project-*`) | Rejected by the name validator | Pick an unreserved name ≤40 chars |
| 7 | Hardcoded `version:` in a generated SDK | Renovate bumps `VERSION`, not YAML — the release loop breaks | `adopt-info` + `VERSION` file read in `override-pull` |
| 8 | Mount slot whose `workshop-source` never gets created | Slot sources are NOT auto-created; connection fails (and a `$SDK`-rooted path missing from prime fails the pack-time linter) | `mkdir -p` in `setup-base`, or `override-prime: mkdir -p ...` for `$SDK` paths |
| 9 | Relying on auto-connect for camera/custom-device/desktop/ssh-agent, or `connections:` for ssh-agent | Those interfaces never auto-connect, and `connections:` cannot override an outright policy block | Document the `workshop connect` step in the README |
| 10 | Leaving a multi-eligible mount/tunnel pairing to policy defaults | With several eligible slots, attempt order is NOT guaranteed | Write the topology in the workshop definition's `connections:`; note `bind:` and `connections:` are mutually exclusive per plug |
| 11 | `save-state`/`restore-state` written for the workshop user, or used for stop/start persistence | They run as ROOT (with `$SDK_STATE_DIR`), and the writable filesystem survives stop/start anyway | `sudo -iu workshop` for user-context commands; state hooks only for refresh-crossing data a mount can't carry |
| 12 | `cp "$SRC"/* "$DEST"/` in state hooks | Glob fails on empty/hidden-only dirs under errexit | `cp -a "$SRC/." "$DEST/"` |
| 13 | Assuming hardlinks work on mount-backed paths | Mounts cross filesystems | Configure a copy fallback (e.g. `UV_LINK_MODE=copy` in `~/.profile`, with a comment) |
| 14 | Using the base (`24.04`) as a Store track, or expecting `check-health` to get >5 s | Tracks are for versions/variants — platforms are tracked automatically; the health runner times out at five seconds per attempt (waiting ×10 max) | Version-style tracks (`1.x`); report `waiting` while starting |
| 15 | Installing the SDK's own software at runtime (`pip`/`uv`/`npm` from a hook into `~/…` or `$SDK/venv`) | The SDK tree is mounted read-only and version-locked; a runtime install lands in user-writable space where it can self-update outside Workshop's version management — and the packed SDK image is empty | Bake the deliverable into a part at build time (a Python application: the hermes pattern, interpreter bundled); runtime installs are only for shared environments (venv slot consumers) and apt |
</traps>

<verification_habits>
- Unverifiable upstream facts (download URL shape, tag prefix, checksum
  availability) are flagged, never guessed — a wrong URL fails only at
  build time, on someone else's machine.
- After generating: run the self-check against this table, then prove the
  SDK in the try loop before calling it done. Nothing ships untried.
</verification_habits>

<source_docs>
- `reference/definition-files/sdkcraft-definition.md` (schema rejections: names, stage-packages, interface attributes; the SDK installation tree is mounted read-only)
- `explanation/sdks/best-practices.md` (services, parts-vs-hooks, env-var doctrine)
- `explanation/sdks/runtime-hooks.md` (hook privileges, health timing, state semantics)
- `explanation/interfaces/plugs-and-slots.md` (auto-connect policy, connections/bind exclusivity)
- `how-to/develop-sdks/publish-an-sdk.md` (track naming caution)
</source_docs>
