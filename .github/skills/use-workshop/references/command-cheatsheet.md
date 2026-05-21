<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Dense reference for every `workshop` and `sdk` subcommand. One block per command: signature, purpose, key flags, single-line example. The most-loaded reference — read this first when you know roughly what you want and need to confirm the flag.

All commands accept `-h`/`--help` and the `workshop` CLI also accepts `-p`/`--project <DIR>` to target a project directory other than the current one. The `workshop` and `sdk` CLIs ship Bash, Zsh, and Fish completion scripts that dynamically complete workshop names, plugs, slots, and recent change IDs — prefer letting the user tab-complete names rather than hard-coding them.

**Workshop-name argument rule.** In single-workshop projects the workshop name is OPTIONAL and may be omitted on most subcommands. In multi-workshop projects (definitions under `.workshop/<NAME>.yaml`) the workshop name is REQUIRED on every subcommand that takes one — bare `workshop refresh`, `workshop exec`, `workshop run`, etc. are rejected with a name-required error, NOT silently expanded across all workshops. Always surface this when diagnosing a multi-workshop "command complained" symptom.
</overview>

<workshop_lifecycle>
**`workshop launch <WORKSHOP>... [flags]`** — Construct workshop(s) from definition; runs SDK setup hooks; on success ties the workshop to the project and starts it. Exists in `Off` → moves to `Ready` (or `Error`/`Waiting` on failure).
- `--wait-on-error` pauses on error (single workshop only; mutually exclusive with `--continue` and `--abort`); resume with `--continue`, undo with `--abort`.
- `--no-wait` returns the change ID immediately without blocking.
- `--verbose` combines stdout+stderr from hooks.
- Workshop name is optional if the project has only one workshop.
- Example: `workshop launch nimble jazzy`

**`workshop refresh [<WORKSHOP>...] [flags]`** — Update existing workshops to match the current definition. Workshop must be `Ready`. Same `--wait-on-error`/`--continue`/`--abort`/`--no-wait`/`--verbose` flags as `launch`.
- Use this — not `remove`+`launch` — for definition changes, including `base:`, `sdks:`, `connections:`, and `actions:`. (Action edits don't actually require it; everything else does.)
- The recovery path for ANY hook failure during refresh is the diagnostic flow (`workshop changes` → `workshop tasks <ID>`) and `--wait-on-error` for live debug, NOT remove+launch. See `workflows/troubleshoot.md` and `references/async-and-recovery.md`.
- Note for in-project SDK authors only: `setup-base` is a creation-only hook (it becomes part of the workshop snapshot at launch), so picking up edits to a `setup-base` *script* requires recreating the workshop. This is an authoring-time constraint, not a recovery prescription. See `references/in-project-sdk.md` for the full hook taxonomy.
- Example: `workshop refresh --wait-on-error`

**`workshop start <WORKSHOP>... [flags]`** — Activate a `Stopped` workshop (move to `Ready`). Errors if workshop wasn't launched or is already started.
- Example: `workshop start nimble`

**`workshop stop <WORKSHOP>... [flags]`** — Deactivate a `Ready` workshop (move to `Stopped`).
- Example: `workshop stop nimble jazzy`

**`workshop remove <WORKSHOP>... [flags]`** — Delete the workshop container but preserve the definition file. Requires not `Off`/`Pending`. Auto-stops if `Ready`.
- Non-default sources set by `workshop remount` are NOT removed.
- Example: `workshop remove nimble`

**`workshop restore <WORKSHOP>... [flags]`** — Revert container filesystem to last `launch`/`refresh` state and reset connections+mounts to defaults. Workshop must be `Ready`. Transactional across multiple workshops.
- `--no-wait`, `--verbose`.
- Example: `workshop restore nimble`
</workshop_lifecycle>

<workshop_introspection>
**`workshop list [flags]`** — List workshops in current project (Project, Workshop, Status, Notes columns).
- `--global` lists workshops from all projects in the system (excludes `Off`).
- `--no-headers`.
- Example: `workshop list --global`

**`workshop info [<WORKSHOP>] [flags]`** — Print workshop's settings, status, SDK details, and connected mount plugs as YAML.
- Example: `workshop info`

**`workshop changes [flags]`** — List recent changes for all workshops in the project (ID, Status, Spawn, Ready, Summary).
- `--no-headers`.
- Use this to find a failed change ID, then drill in with `workshop tasks <ID>`.

**`workshop tasks [<CHANGE ID>] [flags]`** — List the tasks comprising a change (Status, Duration, Summary). May print log details for tasks that store them.
- Without an argument: lists tasks for the most recent change.
- `--no-headers`.

**`workshop actions [<WORKSHOP>] [flags]`** — Print the named actions defined in the workshop's `actions:` section as a YAML map.

**`workshop sketches [flags]`** — List sketch SDKs in the project (Project, Workshop, Rev, Notes — current/stashed). `--no-headers`.

**`workshop warnings [flags]`** — List system-wide warnings (broken mounts, transient issues). Already-acknowledged warnings are hidden unless they recur.
- `--all` shows acknowledged ones too.
- `--abs-time` switches to RFC 3339 absolute timestamps.
- `--unicode auto|never|always`, `--verbose`.

**`workshop okay`** — Acknowledge all warnings printed by the previous `workshop warnings` call.
</workshop_introspection>

<workshop_execution>
**`workshop exec [flags] [<WORKSHOP>] [--] <COMMAND>...`** — Run an arbitrary command in the workshop. Workshop must be `Ready` or `Waiting`.
- Auto-detects interactive vs non-interactive based on stdin/stdout TTYs; force with `-i`/`--interactive` or `-I`/`--non-interactive`.
- `--cwd, -w <PATH>` sets working directory in the workshop.
- `--env KEY=VAL` (or `--env KEY` to inherit from CLI environment); repeatable.
- `--uid <N>`, `--gid <N>` to run as a specific user/group inside the workshop.
- `--timeout <DURATION>` (units: `ns`, `us`/`µs`, `ms`, `s`, `m`, `h`).
- Use `--` to separate the workshop name from the command when there's ambiguity.
- Example: `workshop exec nimble -- go build main.go`

**`workshop run [flags] [<WORKSHOP>] [--] <ACTION> <ARGUMENTS>...`** — Invoke a named action from the workshop's `actions:` section. Same flags as `exec`.
- Trailing arguments are forwarded to the action's bash script as positional parameters (`"$@"`, `"$1"`, ...).
- Action edits do NOT require `workshop refresh` — they're parsed at run time.
- Example: `workshop run dev -- tests -run TestFoo ./pkg/...`

**`workshop shell [<WORKSHOP>]`** — Shorthand for `workshop exec` that opens an interactive login shell as the `workshop` user. Requires `Ready` or `Waiting`. Takes no flags; for a shell with custom uid/cwd/env, use `workshop exec [<WORKSHOP>] -- bash -l`.
- Example: `workshop shell nimble`
</workshop_execution>

<workshop_interfaces>
**`workshop connect <WORKSHOP>/<SDK>:<PLUG> [<WORKSHOP>/<SDK>][:<SLOT>] [flags]`** — Connect a plug to a slot. Listed as `manual` in `workshop connections` output.
- If the second argument is omitted, target is `<WORKSHOP>/system:<PLUG>`.
- If only `:<SLOT>`: target is `<WORKSHOP>/system:<SLOT>`.
- `--no-wait`.
- Example: `workshop connect nimble/go:mod-cache :mount`

**`workshop disconnect <WORKSHOP>/<SDK>:<PLUG OR SLOT> [<WORKSHOP>/<SDK>]:[<SLOT>] [flags]`** — Disconnect a plug from its slot, or a slot from all its plugs.
- `--forget`: prevents reconnection on the next `workshop refresh` for plugs that were originally auto-connected.
- `--no-wait`.

**`workshop connections [<WORKSHOP>] [flags]`** — List interface plug/slot connections for one workshop or the whole project.
- `--all`: include disconnected plugs in the output.
- `--no-headers`.

**`workshop remount <WORKSHOP>/<SDK>:<PLUG> <SOURCE> [flags]`** — Mount a new host source location to a mount-interface plug's target.
- Tries an atomic remount; if not possible, requires the workshop to be `Stopped`.
- `--no-wait`.
- The next `workshop refresh` re-applies the last source set this way.
- Example: `workshop remount nimble/go:mod-cache ~/new-cache-mount`
</workshop_interfaces>

<workshop_sketch_sdk>
**`workshop sketch-sdk [--stash|--restore|--eject|--remove] [<WORKSHOP>] [flags]`** — Edit the sketch SDK template in `$EDITOR`; saving auto-refreshes the workshop. One sketch SDK per workshop.
- `--stash`: temporarily revert the changes.
- `--restore`: re-apply a previously stashed sketch.
- `--eject` (with `--name <NAME>`): promote the sketch to an in-project SDK under `.workshop/<NAME>/`. After ejection it can be committed to the repo.
- `--remove`: drop the sketch SDK from the workshop entirely.
- `--verbose`.
</workshop_sketch_sdk>

<sdk_cli_invocation>
The `sdk` binary may not be on PATH. The Workshop snap publishes it as a namespaced executable: `workshop.sdk`. Resolution rule:

1. If `command -v sdk` resolves, use bare `sdk find` / `sdk info` / `sdk list` (most user-friendly form).
2. Otherwise fall back to the namespaced form: `workshop.sdk find …`, `workshop.sdk info …`, `workshop.sdk list …`. The flags and output are identical.
3. If neither resolves, the snap is not installed.

When emitting commands to the user, write `sdk` (the readable form) and add a one-line note "(or `workshop.sdk` if `sdk` isn't on PATH)" the FIRST time `sdk` appears in the response. Don't restate the fallback on every subsequent invocation in the same response.
</sdk_cli_invocation>

<sdk_cli>
**`sdk list [flags]`** — List local SDK volumes on this machine (multiple entries possible if several revisions co-exist). Use `workshop info` for per-workshop SDK installation status. `--no-headers`.

**`sdk find <QUERY> [flags]`** — Search the SDK Store for SDKs whose name/title/summary/description/publisher matches the query. Only the latest release per SDK is shown.
- Combine multiple words: `sdk find <keyword> <other-keyword>`. `--no-headers`.

**`sdk info <SDK> [flags]`** — Print the SDK's metadata, available Store channels, and workshops where the SDK is installed.
- `--base <BASE>`: filter Store channels to a specific base (e.g., `ubuntu@24.04`).
- `--arch <ARCH>` or `--arch all`: show channels for a different (or every) supported architecture.
</sdk_cli>

<source_docs>
- `reference/cli/workshop-*.md` — per-subcommand reference
- `reference/cli/sdk-*.md` — per-subcommand reference
- `reference/workshop-status.md` — state transition diagrams
</source_docs>
