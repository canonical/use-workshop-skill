<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Workshop operations that mutate state are async: they produce a **change** (numeric ID) that contains a sequence of **tasks**. Knowing this model is what separates an agent that guesses from one that diagnoses.
</overview>

<core_model>
Every mutating command (`launch`, `refresh`, `start`, `stop`, `remove`, `restore`, `connect`, `disconnect`, `remount`) creates a change. The change has:
- An ID (numeric, project-scoped).
- A status: `Doing` → `Done`, or `Doing` → `Error` (with auto-reverted tasks marked `Undone`).
- A list of tasks, each with its own status, duration, and (sometimes) log tail.

By default the CLI blocks until the change reaches `Done` or `Error`. With `--no-wait`, the CLI returns the change ID immediately and the user can poll with `workshop changes` and `workshop tasks <ID>`.
</core_model>

<inspecting_changes>
1. `workshop changes` — list recent changes (ID, Status, Spawn, Ready, Summary). Find the failed one.
2. `workshop tasks <ID>` — drill into one change. Shows individual tasks; failed/undone ones are marked. Logs from the failed task are appended at the bottom of the output.
3. `workshop tasks` (no ID) — lists tasks for the most recent change. Convenient right after a failed command.
4. `workshop info` — current workshop status, useful to confirm whether the change auto-reverted (still `Ready`) or left the workshop `Error`/`Waiting`.

Always use this triplet — `changes` → `tasks <ID>` → `info` — as the verification loop after any mutating action.
</inspecting_changes>

<wait_on_error_recovery>
The default failure behavior is to revert the change and leave the workshop in its previous state. To pause instead and investigate:

```
workshop launch --wait-on-error            # or workshop refresh --wait-on-error
```

Constraint: only one workshop at a time. If the user lists multiple, the flag is rejected; if a multi-workshop launch errors, it auto-aborts all of them.

When the change errors with `--wait-on-error`, the workshop enters `Waiting`. Then:

1. **Diagnose:** `workshop changes` to confirm the change is paused; `workshop tasks <ID>` for logs.
2. **Investigate:** `workshop shell` to enter the container at the point of failure; inspect filesystem, retry the failing step manually, etc.
3. **Resolve:** EITHER
   - Fix the cause and resume: `workshop launch --continue` or `workshop refresh --continue`. Workshop returns to `Ready`.
   - Give up: `workshop launch --abort` or `workshop refresh --abort`. Workshop reverts to its previous state.

Editing the workshop definition while paused is NOT supported: changes mid-flight require an `--abort` and a fresh start.
</wait_on_error_recovery>

<no_wait_pattern>
For long operations (large SDK pulls, multi-workshop launches), `--no-wait` returns the change ID immediately:

```
workshop launch --no-wait nimble    # prints the change ID, e.g. "42"
workshop tasks 42                   # check progress later
workshop info nimble                # confirm final status
```

`--no-wait` is supported on `launch`, `refresh`, `restore`, `connect`, `disconnect`, `remount`.
</no_wait_pattern>

<warnings>
Non-blocking, transient issues are surfaced as warnings (e.g., "mount source on host no longer exists"):
- `workshop warnings` lists current warnings. With `--all`, includes acknowledged ones.
- `workshop okay` acknowledges everything that was just listed.

Warnings don't pause anything; they're just observability. Surface them when the user asks "is everything OK?" or after a command that completed but seemed off.
</warnings>

<decision_summary>
| The user just ran... | And it... | Then do... |
|----------------------|-----------|------------|
| `workshop launch`/`refresh` | succeeded | `workshop info` to confirm `Ready` |
| `workshop launch`/`refresh` | failed (no `--wait-on-error`) | `workshop changes`, `workshop tasks <ID>`, then fix-and-retry |
| `workshop launch`/`refresh --wait-on-error` | failed | inspect tasks, `workshop shell`, fix, then `--continue` or `--abort` |
| Anything `--no-wait` | returned immediately | `workshop tasks <ID>` to track progress |
| Sees "warnings" | — | `workshop warnings` to read; `workshop okay` to ack |

**Never suggest `workshop remove` followed by `workshop launch` as the response to a refresh failure** — that throws away the previous good state. Use `--wait-on-error` + `--continue`/`--abort` instead.
</decision_summary>

<source_docs>
- `explanation/workshops/changes-tasks.md`
- `reference/cli/workshop-changes.md`, `reference/cli/workshop-tasks.md`
- `reference/cli/workshop-launch.md`, `reference/cli/workshop-refresh.md` (the `--wait-on-error`/`--continue`/`--abort` flags)
- `reference/cli/workshop-warnings.md`, `reference/cli/workshop-okay.md`
- `how-to/fix-workshops/debug-issues.md`
</source_docs>
