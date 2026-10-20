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
5. `references/runtime.md` — ONLY when the symptom mentions a VM, `runtime:`, `lxd-vm`, a leftover `confinement:` key, or `--vm`
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
| A tunnel, custom-device or secret connection is gone after a `workshop refresh`, and the refresh printed `WARNING: There is 1 new warning` | Connection maintenance (0.9.8+): the refresh changed what the manual connection depends on (endpoint, device filter, secret lookup) and dropped it — `workshop warnings` shows `disconnected "<plug>" from "<slot>" because its definition changed`. Expected, not a failure: `workshop connect` it again, `workshop okay` to acknowledge |
| `secret plug "<SDK>.<PLUG>" is not connected` (exit 3) | The secret plug was never connected — usually because the pair was put in `connections:`, which can't connect a `secret` plug. `workshop connect <WS>/<SDK>:<PLUG> <WS>/system:<SLOT>`. See `references/secrets.md` |
| `cannot retrieve secret for plug "<SDK>.<PLUG>": unlock the secret provider and try again` (exit 2) | The host keyring is locked. The user unlocks it in their desktop session and re-runs; Workshop never prompts for the password |
| `no secret found for plug "<SDK>.<PLUG>"` (exit 1) | No keyring item carries all the slot's attributes (or the named `collection` doesn't exist). Compare with `secret-tool search <attr> <value>… >/dev/null`, fix the slot, `workshop refresh`, then connect again — the changed lookup disconnected it |
| `multiple secrets match plug "<SDK>.<PLUG>"; refine the secret slot` (exit 4) | Several keyring items match. `secret-tool search --all <attr> <value>… >/dev/null`; add an attribute only the intended item carries, refresh, reconnect — or delete the extras |
| An SDK silently runs without its credential | Check `workshop changes` for `Retrieve secret "<WS>/<SDK>:<PLUG>"` rows: none means nothing asked (the SDK didn't request it, or a pre-set env var took precedence); `Error` → `workshop tasks <ID>` names the cause. For `--env NAME`, an unset host variable is skipped without an error |
| SDK YAML error: `unknown SDK YAML fields: <name> (line N, column M)` (sketch wording: `sketch SDK YAML contains unknown fields: …`) | A typo'd or misplaced key in an in-project `sdk.yaml` or a sketch SDK (strict validation, 0.9.2+; SDK YAML **only**). Fix the named key; don't retry the same file unchanged |
| A `workshop.yaml` key seems ignored — an SDK not installed, a connection never proposed, an action missing | `workshop.yaml` gets **no** unknown-field validation: a typo'd top-level key there is silently ignored. Diff the file against `reference/definition-files/workshop-definition.md` (or lint against `schema.json`); there is no error string to hunt for |
| `workshop restore` / `launch --continue` / `refresh --continue` refused right after a Workshop snap update | Back-compat guard (0.9.5+): the updated daemon won't run those ops on an old-format workshop. Run `workshop refresh <name>` once — that migrates it. No forward compat: never downgrade the snap to "fix" this (downgrade = snap remove + reinstall, which deletes every workshop and SDK) |
| `ssh <workshop>.<project>.wp` fails (host-key prompt, password prompt, or no resolution) | Automatic SSH needs 0.9.5+ AND a workshop launched under 0.9.5+ — pre-existing workshops must be **removed and launched again** (refresh is not enough). Also check the distro supports `/etc/ssh/ssh_config.d/` and the drop-in `70-workshop-cert-authority.conf` exists there |
| `cannot continue: no refresh in progress` (or `abort` / `launch`) | Nothing is paused — there is no `Waiting` change to resume. Re-check `workshop info` / `workshop changes`; you likely didn't run `--wait-on-error`, or it already resolved |
| `… : <kind> change is in progress` (e.g. `launch change is in progress`) | Ordinary change-conflict — another change is still running. Wait for it or inspect `workshop changes`. NOT the stuck-`Doing` signature in Step 7; do **not** restart the daemon for this |
| GPU device missing/inaccessible (e.g. `/dev/kfd`) on a workshop created before 0.9.2 | `workshop refresh` to apply the 0.9.2 device-group fix (adds the `workshop` user to groups like `render`) |
| Refresh failure where you want to investigate live | Re-run with `workshop refresh --wait-on-error <name>`; shell in; fix; `--continue` or `--abort` |
| Hook in an in-project SDK exits non-zero | `workshop tasks <ID>` shows hook stdout/stderr; for live investigation, re-run with `--wait-on-error` and shell in. See `author-in-project-sdk.md` Step 9 |
| `No space left on device` during unpack/install (or writes inside the workshop fail) | The LXD **storage pool** is full — not the host disk. Diagnose and grow it; see Step 6 |
| `runtime "lxd-vm" is experimental` on launch | The VM runtime is opt-in. Run BOTH commands the error names: `sudo snap set workshop workshop.experimental-vms=1` then `sudo snap restart workshop.workshopd`. The restart is part of the opt-in. Say in the same answer that containers are the default and supported choice |
| `runtime changed from "<X>" to "<Y>"` on refresh | The runtime is fixed at launch. `workshop remove <name>` + `workshop launch <name>` — refresh cannot do it. Warn that this drops manual `connect`/`remount` wiring |
| `invalid runtime "<X>"; valid runtimes: lxd-container, lxd-vm` | A typo or a 0.9.7 value (`container`, `virtual-machine`) under the new key. Use `lxd-container` or `lxd-vm` |
| `Error: unknown flag: --vm` from `workshop init` | 0.9.8 replaced `--vm` with `--runtime lxd-vm` |
| A definition says `confinement: virtual-machine` but `workshop info` shows `runtime: lxd-container` | 0.9.8 renamed the key and silently ignores the old one, so the workshop is a container. Write `runtime: lxd-vm`, then remove + launch (the runtime is fixed at launch). See `references/runtime.md` |
| `SDKs are currently unavailable for virtual machines` | The host's LXD (`6/stable`) offers shifted disk mounts to containers only. Either drop `sdks:` from the VM definition, or switch LXD to `6/edge` — host-wide and not reversible to `6/stable`, so say that first. Probe with `lxc query /1.0/metadata/configuration \| jq -r '.configs["device-disk"]["device-conf"].keys[] \| select(has("shift")) \| .shift.condition'` — `container` means container-only. See `references/runtime.md` |
| A VM workshop is `Ready` but its plugs are all disconnected, or they disconnect again after every refresh | Expected: the VM runtime skips auto-connect at launch and refresh, and restores nothing. Re-wire with `workshop connect` each time. Proxy-device interfaces (tunnel, desktop, ssh-agent, camera, custom-device) are unavailable in a VM at all |
| A VM workshop reports no SDK health notes in `workshop info` | Expected: `check-health` is skipped for the VM runtime. Don't wait on a health signal that never arrives |
| `cannot start "<name>": workshop too old: use "workshop remove …" and "workshop launch …" to update it` | Format guard (0.9.6+) — the workshop predates the current snapshot format. Unlike the 0.9.5 `restore`/`--continue` guard, a `workshop refresh` does NOT clear this; follow the message verbatim |
| `upgrade Workshop and remove all workshops before downgrading again` | The snap was downgraded (0.9.6+ guard) and the daemon is degraded. Re-install the newer Workshop, remove every workshop, then downgrade if you truly must. Never prescribe a downgrade as a fix |
| `workshop warnings` shows `workshops with "base: ubuntu@20.04" are no longer supported` | Deprecation, not a failure — the workshop still launches. Move `base:` to `ubuntu@22.04`+ and `workshop refresh`; upstream has announced its removal without naming the release (it still works in 0.9.8) |
| `workshop` reports LXD missing, outdated, or unreachable | Follow the actionable error (0.9.3+): install/refresh/restart LXD — minimum LXD **6.8**, remedy `sudo snap refresh --channel=6/stable lxd` (install: `sudo snap install --channel=6/stable lxd`). `workshopd` sits in a degraded state and recovers on its own once LXD is available — no daemon restart needed |
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

This is almost never your host disk. Workshop keeps its data in an LXD storage pool named `workshop` (ZFS on Linux, Btrfs on WSL). Workshop only enforces a 5 GiB *minimum* when the pool is first created — otherwise LXD's own default of ~20% of free disk applies — and the pool **never grows on its own**. So it can fill up while the host disk still has terabytes free. Workshop does not manage the pool size for you — resizing is a deliberate, manual LXD operation. Since 0.9.3 the daemon monitors the pool and, at **90% usage**, enters **degraded mode**: it rejects state-changing commands (launching a workshop, for instance) and reports pool usage instead of letting writes fail opaquely, recovering on its own once space frees up. Treat that message the same way: free space or grow the pool. Note on older installs: the daemon's hint was fixed in 0.9.7 to name the pool-level `lxc storage set workshop size=<N>GiB`; 0.9.6 and earlier wrongly suggested the volume-level `lxc storage volume set …`, so correct that if the user pastes an older message.

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
3. Recreate, don't trust: if the workshop went Off uncontrolled, the post-restart state is unreliable even if `workshop info` reports `Ready`. Run `workshop remove <name>` then `workshop launch <name>`, and re-apply any manual `connect`/`remount` wiring — *remove* drops those records (an ordinary refresh preserves them, 0.9.5+).
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
- `reference/workshops.md` (the "Storage pools and drivers" section — pool sizing, degraded mode, and how to resize; the backward- and forward-compatibility policy behind the post-update refusals)
- `release-notes/v0.9.7.md` (the corrected storage-pool hint)
- `release-notes/v0.9.8.md` (`confinement:` replaced by `runtime:`)
- `how-to/customize-workshops/use-virtual-machines.md` (the VM runtime's errors and limitations)
</source_docs>
