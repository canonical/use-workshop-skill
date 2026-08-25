<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
The decision doctrine for designing an SDK: how to split work between parts
and hooks, between `setup-base` and `setup-project`, how to lay out
interfaces, ship background services, and write health checks. Distilled from
the published "Design best practices" explanation and the shipped reference
SDKs; every generated SDK maps each construct to one of these named patterns.
</overview>

<services>
Background processes ship as **user-level systemd units**, never as processes
exec'd from a hook. This is the canonical pattern (the docs hedge that hooks
"shouldn't start services directly" — that hedge forbids raw daemon exec from
hook scripts; installing a unit and letting systemd own the process is the
documented, recommended shape):

1. The unit file rides in a dedicated `dump` part:

```yaml
# <name>/sdkcraft.yaml
parts:
  services:
    plugin: dump
    source: services
    source-type: local
```

2. `setup-project` installs and enables it (user-level units tie their
   lifetime to the `workshop` user's session and need no sudo — preferred
   over root-level units):

```bash
install -D --mode=644 --target-directory ~/.config/systemd/user "$SDK/<name>.service"
systemctl --user daemon-reload
systemctl --user enable --now <name>
```

3. The unit runs through a login shell so it sees the profile.d environment
   the SDK set up:

```ini
[Unit]
Description=<Name> Service
After=network.target

[Service]
ExecStart=/bin/bash -lc "<name> serve"
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
```

A serving SDK pairs the unit with a `tunnel` slot on the service's port so
host tools can reach it, and `check-health` polls the service (see below).
</services>

<parts_decomposition>
- One part for a cohesive toolchain distributed as a unit (go).
- Multiple parts along functional boundaries when components update
  independently: runtime binaries / configuration / data assets / auxiliary
  tools. A daemon SDK is the standard two-part case: the binary part plus a
  `services` dump part (ollama).
- Parts are optional: the minimal viable SDK forgoes them entirely and does
  everything in hooks (SDKcraft supplies a nil default part). A version-only
  SDK keeps a single nil part just to run `craftctl set version`.
</parts_decomposition>

<parts_or_hooks>
- The SDK's own deliverable → a part, always. The SDK tree is mounted
  read-only and version-locked by Workshop; installing the tool from a hook
  at runtime (`pip`/`uv`/`npm` into `~/…` or `$SDK/venv`) puts it in
  user-writable space where it can self-update outside version management —
  and packs an empty SDK image. Distinguish a *standalone application*
  (baked into the part, immutable — hermes for Python) from a
  *library/environment other SDKs consume* (the venv slot/plug shape in
  `<sdk_dependencies>`, where the runtime install IS the shared resource).
  Mount plugs carry the tool's user data (config, credentials, sessions) —
  never the tool itself.
- Debian packages → `setup-base`, never parts: integrates with the image's
  apt cache and keeps distribution security updates flowing.
  `stage-packages`/`stage-snaps` are rejected by SDKcraft outright.
- Binary artifacts → parts, when you need to pin versions independent of the
  archive, ship custom builds, or provide tools apt doesn't have. Verify
  checksums for hand-rolled downloads when upstream publishes them.
- Third-party apt repositories (vendor toolchains) → configure the repo and
  install in `setup-base`; a part's `override-build` may stage small marker
  files (version, apt series per platform) for the hook to read from `$SDK/`.
</parts_or_hooks>

<setup_base_or_setup_project>
`setup-base` (root, before the project mount and before any connection; its
result is captured in the base snapshot, so refreshes start warm):
- System package installation
- Global environment configuration (`/etc/profile.d/`)
- One-time setup; content that should be part of snapshots

`setup-project` (the `workshop` user, after the project mount and after
auto-connect):
- Project-specific configuration that depends on project context
- Operations requiring auto-connected interfaces (e.g. GPU detection — the
  hardware is only visible after connection)
- Per-user state: `~/.profile`, `~/.config/systemd/user/`, venv activation
- Content that should NOT be in snapshots (frequently updated or very large)
</setup_base_or_setup_project>

<environment_variables>
- System-wide: write `/etc/profile.d/<name>.sh` from `setup-base`. Escape the
  self-reference so expansion happens at login, not in the heredoc:

```bash
cat <<EOF >/etc/profile.d/<name>.sh
export PATH="$SDK/bin:\$PATH"
EOF
```

- User-specific: append to `~/.profile` from `setup-project`, with a comment
  explaining why the value is what it is.
- Never touch `~/.bashrc` or `~/.bash_profile` — Workshop supports multiple
  shell interpreters and shell-specific files are not sourced consistently.
- Prefix variable names with the SDK name to avoid conflicts.
</environment_variables>

<health_checks>
`check-health` must test real functionality, not the mere presence of files,
and report through `workshopctl set-health` — quickly (the runner allows five
seconds per attempt):

- Channel the failing command's own output into the message so
  `workshop info` and `workshop changes` show something actionable:

```bash
if ! output=$(sudo -u workshop --login <name> list 2>&1); then
  workshopctl set-health waiting "$output"
  exit
fi
workshopctl set-health okay
```

- `waiting` is the still-starting signal: Workshop retries after one second,
  up to ten consecutive times, then flips the SDK to Error — so a daemon that
  needs a few seconds to come up reports `waiting`, not `error`.
- Use `--code=<slug>` for distinct failure modes when there are several.
- The hook runs as root: wrap user-context checks in
  `sudo -u workshop --login` so PATH and profile.d take effect.
</health_checks>

<sdk_dependencies>
SDKs share resources through mount slot/plug pairs instead of dependency
management: the providing SDK exposes a slot (`workshop-source` inside the
workshop), consumers declare a plug. The pairing only happens when the
workshop definition wires it in a `connections:` block — without it the
consumer's plug falls back to the host directory Workshop allocates, so the
consumer still works standalone. Design consequence: a consuming SDK must
behave sensibly in BOTH wirings (e.g. create its own venv when the shared one
is absent), and its README must show the `connections:` snippet.
</sdk_dependencies>

<interface_layout>
Selection heuristic (full policy table: load
`../use-workshop/references/interfaces.md`):
- `mount` for persistent data, caches, and cross-SDK sharing
- `gpu` when GPU acceleration is required
- `tunnel` for network services that must be reachable externally
- `ssh-agent` for authentication with remote services

A cache or persistent-data need is a mount plug; a resource offered to other
SDKs is a mount slot; a served port is a tunnel slot. Mount-backed
directories cross filesystems — hardlinking is unavailable there, so tools
that hardlink by default need a copy fallback (`UV_LINK_MODE=copy` is the
canonical example, set in `~/.profile` with a comment).
</interface_layout>

<source_docs>
- `explanation/sdks/best-practices.md` (the doctrine this file distills)
- `explanation/sdks/parts.md` (parts mechanism)
- `explanation/sdks/runtime-hooks.md` (hook contract backing the setup-base/setup-project split)
- `how-to/develop-sdks/build-an-sdk.md` (service-unit pattern, user-level systemd preference)
- `how-to/develop-sdks/share-content-between-sdks.md` (slot/plug sharing walk-through)
- `how-to/develop-sdks/configure-mount.md` (mount attribute details)
</source_docs>
