<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Diagnose and recover from a failed `workshop launch`/`refresh`/`start` (or any other mutating change). Walk a deterministic decision tree from the error symptom to a fix, using `workshop changes`/`workshop tasks`/`--wait-on-error` rather than guessing.
</objective>

<required_reading>
1. `references/async-and-recovery.md` — change/task model, `--wait-on-error` flow
2. `references/states-and-transitions.md` — what the workshop's current status implies
3. `references/command-cheatsheet.md` — `changes`, `tasks`, `info`, `warnings`, `okay`
4. `references/anti-patterns.md` — what NOT to do under stress
</required_reading>

<process>

**Step 1. Capture the symptom and the latest change.**
```
workshop changes
workshop tasks            # tasks of the most recent change
workshop info             # current status
```
- If a change shows `Status: Error`, drill in: `workshop tasks <ID>`. The log tail at the bottom of that output is usually the root cause.
- If status is `Pending`, the change is still in flight — wait or use `--no-wait` to track.

**Step 2. Look up the failed task.**
The task list in `workshop tasks <ID>` has states:
- `Done` — succeeded.
- `Doing` — in progress.
- `Error` — the failed task. The log lines under "..............." headers belong to it.
- `Undone` — auto-rolled back due to the error.
- `Hold` — never ran because an earlier task errored.

The error log usually identifies the SDK and hook (e.g., `Run hook "setup-base" for "<sdk>" SDK`). That tells you whether the cause is network (channel pull), SDK build (hook), or wiring (interface).

**Step 3. Decide on a recovery path.**

| Cause | Action |
|-------|--------|
| Transient network error during channel pull | Retry: `workshop refresh` (or `launch`, depending on what failed) |
| Specific SDK setup-base hook failure | Pin a different `channel:` (use `sdk info <name>` to inspect); refresh |
| Multi-SDK conflict | Comment out SDKs one at a time, refresh, find the offending one |
| Plug conflict (mount target already in use) | Bind one plug to the other (`bind: <SDK>:<PLUG>`) — see `manage-interfaces.md` |
| Port already taken (tunnel) | Free the port on the host or change `endpoint:` to another port |
| Refresh failure where you want to investigate live | Re-run with `workshop refresh --wait-on-error <name>`; shell in; fix; `--continue` or `--abort` |
| Hook in an in-project SDK exits non-zero | `workshop tasks <ID>` shows hook stdout/stderr; for live investigation, re-run with `--wait-on-error` and shell in. See `author-in-project-sdk.md` Step 9 |
| `No space left on device` during unpack/install (or writes inside the workshop fail) | The LXD **storage pool** is full — not the host disk. Diagnose and grow it; see Step 6 |
| Every command fails with `other changes in progress`; a change is stuck in `Doing` | Daemon-level stall, not a task failure — see Step 7 |

**Step 4. Use `--wait-on-error` for live debugging.**
```
workshop refresh --wait-on-error <name>     # or: workshop launch --wait-on-error <name>
```
The workshop enters `Waiting`. Then:
```
workshop shell                # interactively reproduce the failing step
# (apply your fix)
workshop refresh --continue   # resume; workshop returns to Ready
# OR
workshop refresh --abort      # discard the in-flight change; workshop reverts
```
Constraint: this flag accepts only one workshop at a time. Editing the workshop definition WHILE paused is not supported — you must `--abort` first if you need to change the YAML.

**Step 5. Check warnings.**
Some failures aren't blocking but indicate drift (e.g., a host mount source disappeared). List and clear:
```
workshop warnings
workshop okay              # acknowledge what was just listed
```

**Step 6. `No space left on device` — the LXD storage pool is full.**

This is almost never your host disk. Workshop keeps its data in an LXD storage pool named `workshop` (ZFS on Linux, Btrfs on WSL) that LXD sizes at ~20% of free disk when it is first created, clamped to 5–30 GiB, and **never grows on its own**. So the pool can fill up while the host disk still has terabytes free. Workshop does not manage the pool size for you — resizing is a deliberate, manual LXD operation.

Diagnose (confirm it's the pool, not the host):
```
df -h                                  # the HOST disk is almost certainly NOT full
sudo lxc storage list                  # find the pool (typically named `workshop`)
sudo lxc storage info workshop         # USED vs TOTAL space for the pool
sudo zfs list                          # ZFS-level usage, if the driver is ZFS
```

Grow the pool:
```
sudo lxc storage show workshop         # confirm a loop-file `source:` and current `size:`
sudo lxc storage set workshop size=64GiB   # grow it; ZFS resizes in place
```
- Confirm the pool name from `lxc storage list` first — don't assume `workshop`.
- ZFS pools can only be **grown, not shrunk**. Pick a target size you won't need to walk back.
- `size=` applies to loop-file-backed pools (the default). If `lxc storage show` reveals a block-device `source:`, grow that underlying device instead of using `size=` (see the storage docs).
- Members of the `lxd` group can drop the `sudo`.

Then retry whatever originally failed (`workshop refresh` or `workshop launch`) and run the verification loop.

**Step 7. A change stuck in `Doing` — `other changes in progress` on every command.**

Reach this step ONLY on this exact signature: a change sits in `Doing` indefinitely, its task never completes, and every other mutating command is rejected with `other changes in progress`. This means workshopd lost the operation mid-flight (usually the container died outside workshopd's control — an LXD-side kill, a host crash). The daemon has no change timeout and will never free it, and no CLI command can abandon a `Doing` change.

1. Confirm the signature: `workshop changes` (change `Doing`, old Spawn time, no Ready time), `workshop tasks <ID>` (a task that never finishes).
2. Restart the daemon:
   ```
   snap restart workshop
   ```
   (no sudo needed; preferred over the equivalent `sudo systemctl restart snap.workshop.workshopd.service`).
3. Recreate, don't trust: if the workshop went Off uncontrolled, the post-restart state is unreliable even if `workshop info` reports `Ready`. Run `workshop remove <name>` then `workshop launch <name>`, and re-apply any manual `connect`/`remount` wiring.
4. Run the verification loop as usual.

Do NOT use this step for an ordinary failed refresh (change reached `Error`, other commands still work) — that's Steps 1–4.

**Step 8. Escalate only if the above doesn't help.**

Verify the platform itself is healthy:
```
snap info workshop                 # version up to date
sudo snap services lxd             # LXD daemon active
sudo snap logs workshop            # daemon logs
```
If the LXD daemon isn't running:
```
sudo snap start --enable lxd.daemon
```
If `$USER` isn't in the `lxd` group: `sudo usermod -a -G lxd $USER` (then re-login).

If the workshop is in `Error` and unrecoverable, route to `purge-and-recover.md`.

</process>

<verification>
After applying a fix, the verification loop is mandatory:
```
workshop changes                  # newest change Done
workshop tasks <ID>               # all tasks Done
workshop info                     # status Ready
```
Surface the result to the user: "Recovery: change <ID> succeeded, status Ready. The cause was <root cause>."
</verification>

<anti_patterns>
- Reaching for `workshop remove && workshop launch` as a default response. You lose state and learn nothing about what failed.
- Using `--wait-on-error` with multiple workshop names. Single workshop only.
- Restarting the workshop daemon (`snap restart workshop`) for an ordinary failed change. Daemon restart is exclusively for the stuck-`Doing` / `other changes in progress` signature in Step 7.
- Editing the workshop YAML while a `--wait-on-error` change is paused. Abort first, then edit.
- Suggesting `sudo snap remove workshop --purge` before exhausting `workshop changes`/`workshop tasks` and `lxc list/delete`. Purge is the last resort.
- Treating `No space left on device` as a transient hook failure to retry (or reaching for `snap remove --purge`). It's a full LXD storage pool — diagnose with `lxc storage info` and grow it with `lxc storage set <pool> size=…`.
- Missing the log tail at the bottom of `workshop tasks <ID>` output and asking the user to "look at the logs" — the logs ARE there.
</anti_patterns>

<success_criteria>
- The user knows which task and which SDK caused the failure.
- A fix is applied (refresh succeeded) OR the workshop is cleanly reverted via `--abort`.
- Final `workshop info` reports `Ready` (or the user has a clear plan for the next step).
</success_criteria>

<source_docs>
- `how-to/fix-workshops/debug-issues.md`
- `how-to/fix-workshops/fix-installation.md`
- `explanation/workshops/changes-tasks.md`
- `reference/cli/workshop.md` (changes, tasks, launch, refresh, warnings, okay sections)
- `reference/workshops.md` (the "Storage pools and drivers" section — pool sizing and how to resize)
</source_docs>
