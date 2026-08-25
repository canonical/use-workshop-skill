<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
The publisher-side contract for the five runtime hooks: execution context,
firing order within an operation, ordering across SDKs, snapshot semantics,
and the health protocol — plus the per-hook pattern library mined from the
shipped reference SDKs. Hooks are how a packed SDK participates in the
running workshop; SDKcraft enumerates `hooks/` automatically at pack time and
ShellCheck-lints every hook (an error blocks the pack).
</overview>

<execution_contract>
Every hook runs as a non-interactive bash login session with `errexit` and
`pipefail` set (plus `xtrace` under `workshop launch/refresh --verbose`).
`$SDK` — the SDK's mount point `/var/lib/workshop/sdk/<SDK>/` — is in scope
for every hook.

| Hook | Runs as | Working dir | Extra env |
|------|---------|-------------|-----------|
| `setup-base` | root | the SDK's `hooks/` dir | none |
| `setup-project` | the `workshop` user | `/project/` | `$HOME`, `$XDG_RUNTIME_DIR`, `$DBUS_SESSION_BUS_ADDRESS` |
| `check-health` | root | `hooks/` | none |
| `save-state` | root | `hooks/` | `$SDK_STATE_DIR` |
| `restore-state` | root | `hooks/` | `$SDK_STATE_DIR` |

`save-state` and `restore-state` run as **root** with `$SDK_STATE_DIR` — not
as the workshop user; wrap user-context commands (`go env`, service control)
in `sudo -iu workshop` / `sudo -u workshop --login`.
</execution_contract>

<stage_order>
Within one operation:

- **launch**: unpack base → start workshop → `setup-base` (before the project
  mount, before ANY plug/slot connection) → mount `/project/` → auto-connect
  → `setup-project` → `check-health` after ALL SDKs' `setup-project`.
- **refresh / restore**: `save-state` first, on the OLD revision, before the
  old workshop is destroyed → (new workshop as at launch) `setup-base` →
  mount + auto-connect → `setup-project` → `restore-state` after ALL SDKs'
  `setup-project`, on the NEW revision → `check-health` after ALL SDKs'
  `restore-state`.

Consequences worth designing around:
- `setup-base` cannot see `/project/` or any connected interface.
- `setup-project` CAN rely on auto-connected interfaces (this is why GPU
  detection lives there) but must not assume manual connections exist.
- `restore-state` may rely on every SDK's `setup-project` having finished.
</stage_order>

<cross_sdk_order>
For each hook kind, SDKs run sequentially — the system SDK first, then the
user-listed SDKs in the order they appear in the workshop definition, then
the sketch SDK. Each hook waits for the previous one. There is NO dependency
resolution: the listing order is the contract. An SDK that needs another
SDK's `setup-base` done must simply be listed later — say so in the README.
</cross_sdk_order>

<snapshot_semantics>
A refresh reuses the post-`setup-base` base snapshot instead of re-running
the hook — but only if the base image and the SDKs listed ABOVE this one are
unchanged. Any change invalidates the snapshot for this SDK and every SDK
below it. Two design consequences:
- Put slow, stable work (apt installs) in `setup-base` so refreshes start
  warm; put volatile work in `setup-project`, which always runs.
- While iterating: an applied refresh does NOT re-run an unchanged SDK's
  `setup-base`; after editing that hook, rebuild and refresh (the changed
  revision invalidates its snapshot), or remove + launch for a fully cold
  start.
</snapshot_semantics>

<health_protocol>
`check-health` reports via `workshopctl set-health okay|waiting|error
[--code=<slug>] ["message"]`:
- `okay` + exit 0 → the SDK is Ready.
- `waiting` → Workshop sleeps one second and re-runs the hook; ten
  consecutive `waiting` results → Error. Use `waiting` for services still
  starting.
- `error`, a non-zero exit, exiting without reporting, or not returning
  within five seconds → Error.
Include a message with `waiting`/`error` (typically the failing command's own
output); `okay` takes none.
</health_protocol>

<state_dir>
`$SDK_STATE_DIR` exists to carry data across a refresh/restore — a refresh
discards the workshop's writable filesystem. It is NOT for stop/start
persistence (the filesystem survives those) and not a substitute for a mount
plug: mounts persist host-side across refreshes without any hook code, so
reserve state hooks for data that lives inside the workshop filesystem and
cannot reasonably be mount-backed (e.g. tool settings harvested from the old
revision).
</state_dir>

<hook_patterns>
Per-hook shapes proven in the reference SDKs:

- `setup-base` — PATH via profile.d with the self-reference escaped
  (`export PATH="$SDK/bin:\$PATH"` inside an unquoted heredoc), or a single
  entrypoint symlink into `/usr/local/bin` when `$SDK/bin` is a venv (its
  `python` on PATH would shadow the system interpreter — hermes); apt work
  (`apt-get update` then `eatmydata apt-get install <pkgs>` — no `-y`, the
  image's apt config supplies defaults); shell completions into
  `/etc/bash_completion.d/`; pre-creating a mount slot's source directory
  (`sudo -u workshop mkdir -p <workshop-source>`); third-party apt repo keyed
  by marker files the build staged (`$(cat "$SDK/series")`).
- `setup-project` — install + enable the user systemd unit (see
  `design-best-practices.md`); append documented env vars to `~/.profile`;
  create a fallback venv only when no shared one is wired; GPU-type detection
  via `lspci` before choosing packages.
- `check-health` — probe the real feature; `waiting` while a daemon starts;
  `sudo -u workshop --login` for user-context probes; `--code=` slugs for
  distinct failures.
- `save-state` — harvest from the old revision into `$SDK_STATE_DIR`
  (e.g. `sudo -iu workshop go env -changed | ... > "$SDK_STATE_DIR"/env-vars`).
  Copy directories glob-safely: `cp -a "$SRC/." "$DEST/"` — a bare `"$SRC"/*`
  breaks on empty or hidden-only directories under errexit.
- `restore-state` — guard on existence (`[[ -f "$SDK_STATE_DIR"/... ]]`) and
  replay into the new revision.

Hook files: bash, executable (0755 — mandatory in packed SDKs),
ShellCheck-clean. Keep each hook idempotent where feasible (guard
`dpkg-divert`, check-before-install) — launch retries and restores re-run
them.
</hook_patterns>

<source_docs>
- `explanation/sdks/runtime-hooks.md` (the five hooks, execution contract, cross-SDK ordering, health protocol)
- `reference/sdks.md` (per-operation firing table, state directory, `workshopctl` reference)
- `how-to/develop-sdks/write-runtime-hooks.md` (worked example of all five hooks)
- `explanation/sdks/lifecycle.md` (where hooks sit in the sketch → in-project → build → publish → consume flow)
</source_docs>
