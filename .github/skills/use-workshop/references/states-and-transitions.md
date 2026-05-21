<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Workshop status diagram, encoded for routing decisions. Each status pins down which commands the workshop will accept and which transitions are possible. Authoritative source: `reference/workshop-status.md` (resolve via `<base>` from SKILL.md `<docs>`).
</overview>

<states>

<state name="Off">
The workshop exists only as a definition file; no container yet. Always the starting point.
- Transitions: `workshop launch` → `Ready` (or `Error` on failure, or `Waiting` with `--wait-on-error`).
- Accepts: `launch`, definition edits, `info`/`list`/etc.
</state>

<state name="Ready">
Operational. Container running, project mounted, ready for use.
- Transitions: `workshop stop` → `Stopped`; `workshop remove` → `Off`; `workshop refresh` → `Ready` (or `Error`/`Waiting --wait-on-error` on failure); `workshop remount` → `Ready`; `workshop restore` → `Ready`.
- Accepts: every command including `exec`, `run`, `shell`, interface ops.
</state>

<state name="Stopped">
Operational but not running. Container is shut down but still linked to the project.
- Transitions: `workshop start` → `Ready`; `workshop remount` → `Stopped`.
- Does NOT accept `exec`, `run`, `shell`. Start it first.
</state>

<state name="Pending">
Intermediate state during a state change. Only a few commands accepted. Usually transient — wait for `workshop changes` to show the change as `Done` or `Error`.
</state>

<state name="Waiting">
Paused mid-change because `--wait-on-error` was used and an error occurred. Container is up; only a few commands accepted, most importantly `workshop shell` (for debugging) and `workshop refresh --continue` / `--abort` (or `workshop launch --continue`/`--abort`).
- Transitions: `launch --continue` / `refresh --continue` → `Ready`; `launch --abort` → `Off`; `refresh --abort` → `Ready` (reverts).
- Use this state to investigate failed hooks. You can shell in and fix the cause manually before continuing.
</state>

<state name="Error">
Non-operational: the workshop failed at some stage and the container is no longer functional.
- Transitions: `workshop remove` → `Off`. That's it. Fix the cause and re-launch.
</state>

</states>

<routing_rules>
**If the user wants to operate the workshop, branch on its current status:**

| Current status | What works | What doesn't | Recovery |
|----------------|-----------|--------------|----------|
| Off | `launch` | exec, run, shell | — |
| Ready | everything | — | — |
| Stopped | `start`, `remount`, definition reads | exec, run, shell | `workshop start` |
| Pending | wait | most things | `workshop changes`/`workshop tasks` |
| Waiting | `shell`, `refresh --continue`/`--abort`, `launch --continue`/`--abort` | most things | resume or abort |
| Error | `remove` | everything else | `workshop remove` then `launch` |

**Always check status before acting on a workshop you didn't just launch.** Use `workshop info` (single workshop) or `workshop list` (project view).
</routing_rules>

<command_failure_default>
On a failed change without `--wait-on-error`, the change is auto-reverted via Undone tasks. The workshop returns to its previous state. Inspect the failure with:
1. `workshop changes` — find the failed change ID.
2. `workshop tasks <ID>` — see which task errored, with its log tail.

To pause instead of reverting next time, re-run with `--wait-on-error` (single workshop only).
</command_failure_default>

<source_docs>
- `reference/workshop-status.md`
- `explanation/workshops/concepts.md` (Workshop status section)
- `explanation/workshops/changes-tasks.md`
</source_docs>
