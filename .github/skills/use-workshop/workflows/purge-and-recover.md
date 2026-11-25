<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Copy out any files that live only inside the workshop, then remove it cleanly when standard `workshop remove` works; recover orphaned workshops (project directory deleted) by recreating the directory; fall back to direct LXD cleanup only when that fails. Last-resort: a full snap purge.
</objective>

<required_reading>
1. `references/command-cheatsheet.md` — `remove`, `restore`, `list`, `info`
2. `references/states-and-transitions.md` — `Error` is the only state from which only `remove` works
3. `references/anti-patterns.md` — when not to escalate
</required_reading>

<process>

**Step 0. Copy files out before any removal (0.9.10 docs).**

Removal is destructive. Removing a workshop deletes:
- everything inside it, including the `workshop` user's home;
- the host directories Workshop allocated for its mount plugs, under `~/.local/share/workshop/id/<PROJECT-ID>/<WORKSHOP>/mount/` (`workshop info` shows them as `host-source:`).

Only the directories the user manages survive: the project directory (`/project`) and any `workshop remount` target. Ask what the user needs to keep before Step 1, and do this first even when the workshop looks unrecoverable. `workshop restore` is not a safe substitute: after an agent with `sudo` broke the workshop, neither a restart nor `restore` is sure to bring it back.

- **The workshop still runs.** Copy into a new directory in the project:
  ```
  workshop shell <WORKSHOP>
  mkdir /project/workshop-recovery && cp -a ~/<PATH> /project/workshop-recovery/
  ```
  For a mount's data, copy the `host-source:` directory on the host.
- **It won't start, and it is a container.** The LXD instance is `<WORKSHOP>-<PROJECT-ID>` in the LXD project `workshop.<USERNAME>`, or `workshop.<UID>` when the username isn't a valid LXD project name (`id -u`). `lxc list --project workshop.<USERNAME> --columns nst` finds the instance and its type. Then:
  ```
  mkdir ~/workshop-recovery
  lxc file pull --recursive --project workshop.<USERNAME> <INSTANCE>/home/workshop/<PATH> ~/workshop-recovery/
  ```
  Run `lxc` **without `sudo`**, so the copies belong to the user; this needs `lxd` group membership. Symbolic links are copied as links.
- **It won't start, and it is a VM.** `lxc file pull` works only while the VM runs and its LXD agent answers. Otherwise, attach its disk to a second, empty VM workshop and copy from there. **Never mount the broken VM's disk on the host.** Anything inside the VM could have written that disk, and mounting a crafted filesystem can crash the host or hand it over. The procedure is upstream's `how-to/fix-workshops/purge.md` ("Copy files out of a broken workshop"):
  1. In a new, empty directory, `workshop init <R> --runtime lxd-vm --project ~/vm-recovery` and `workshop launch <R> --project ~/vm-recovery`. Give it no SDKs, so no interfaces connect it to the host, and keep its project directory empty.
  2. `lxc stop --force` the broken VM.
  3. `lxc storage volume set … workshop virtual-machine/<INSTANCE> security.shared=true`, then `lxc config device add … <R-INSTANCE> recovery disk pool=workshop source=<INSTANCE> source.type=virtual-machine`.
  4. In the recovery VM, find the unmounted disk with `lsblk -f`. Mount its `cloudimg-rootfs` partition **read-only**, copy the files to `/project/workshop-recovery/`, then unmount it.
  5. `lxc config device remove` the recovery device. The files are now in `~/vm-recovery/workshop-recovery/`.

Then go to Step 1.

**Step 1. Try the standard removal first.**
```
workshop remove <workshop>           # or: workshop remove (single-workshop project)
workshop list                         # confirm gone
workshop list --global                # confirm gone everywhere
```
This stops the container if running, deletes the LXD container, removes data and cache, and cleans up LXD profiles.

If it succeeds, you're done. (`workshop rm` is the 0.9.10+ alias.) Note: non-default mount sources set via `workshop remount` are NOT removed by `workshop remove` — clean those up separately if you need to.

**Step 2. If `workshop remove` fails or the workshop still appears — classify the failure.**

```
workshop list --global
```

- The workshop shows `Error` with a `missing-project` note → the project directory was deleted and the workshop is orphaned. Go to Step 3 — do NOT jump to `lxc delete`.
- Anything else (stuck container, unrecoverable LXD state) → go to Step 4.

**Step 3. Orphan: recreate the project directory first.**

Commands that resolve the project by pathname (including `workshop remove --project`) fail while the directory is missing, but the daemon keeps tracking the project's original absolute path. Recreating the directory restores the standard removal flow — no LXD surgery needed:

```
workshop list --global                     # note the PROJECT path, e.g. ~/projects/app
mkdir -p <SAME-ABSOLUTE-PATH>              # may stay empty
workshop remove --project <PATH> <NAME>
workshop list --global                     # confirm gone
rm -r <PATH>                               # drop the recreated directory
```

Removal isn't the only option: to KEEP the workshop, restore the project's content at the same path (e.g. `git clone`) instead — running any workshop command against the recreated directory re-associates it with the original project and recreates its `.workshop.lock`. Only if this recovery fails, continue to Step 4.

**Step 4. Identify the LXD project.**

LXD projects are named `workshop.<USERNAME>`; when the username contains characters LXD doesn't allow in a project name (e.g. `@`), the numeric UID is used instead — grep for both:
```
sudo lxc list --all-projects | grep -e workshop.$USER -e workshop.$(id -u)
```
Each container is named `<workshop-name>-<short-id>`. The commands below use `workshop.$USER`; substitute `workshop.$(id -u)` if that's what the listing shows.

**Step 5. Manually delete the orphan.**
```
sudo lxc delete --project workshop.$USER <CONTAINER> --force
```
Also check the snapshots project (Workshop keeps backup snapshots there):
```
sudo lxc list --all-projects | grep workshop-snapshots.$USER
sudo lxc delete --project workshop-snapshots.$USER <CONTAINER> --force
```

**Step 6. Clean up orphaned LXD profiles.**
Workshop creates one LXD profile per SDK, named `<container>-<sdk>`. If a container removal left them behind:
```
sudo lxc profile list --project workshop.$USER
```
For each profile in the list, check `USED BY`. If zero, it's safe to remove:
```
sudo lxc profile delete --project workshop.$USER <PROFILE>
```
If non-zero, identify which container uses it:
```
sudo lxc list --project workshop.$USER
sudo lxc config show --project workshop.$USER <CONTAINER>   # look at the `profiles:` key
```
Remove the profile only after confirming no remaining valid container needs it.

**Step 7. Remove leftover host directories.**

`lxc delete` doesn't remove Workshop's host-side state, keyed by project ID — the final dash-separated segment of the container name (e.g. `ec275767` for `app-ec275767`):
```
rm -rf ~/.local/share/workshop/id/<PROJECT-ID>
sudo rm -rf /var/snap/workshop/current/id/<PROJECT-ID>
sudo rm -rf /var/snap/workshop/common/workshop/cache/id/<PROJECT-ID>
```

**Step 8. If the container fails to start during recovery.**
```
sudo lxc info --show-log --project workshop.$USER <CONTAINER>
```
Increase LXD verbosity if needed:
```
sudo snap set lxd daemon.debug=true
sudo snap restart lxd.daemon
```
Then retry the delete.

**Step 9. Last-resort: purge the snap.**
```
sudo snap remove workshop --purge
```
This removes EVERY workshop for EVERY user on the system, plus all profiles, storage pools, etc. The snap's `remove` hook handles the cleanup. After this, reinstall:
```
sudo snap install workshop --classic
```
Use only when steps 1–8 have not resolved the problem.

**Step 10. Restore vs purge: a word on `workshop restore`.**
If the workshop is `Ready` but in a bad state and you just want to undo recent changes (`remount`, `connect`, runtime mutations) without losing the underlying container, prefer:
```
workshop restore <workshop>
```
This reverts the container filesystem to the last `launch`/`refresh` state and resets interface wiring to definition defaults — manual connections dropped, manual disconnects re-established (regardless of `--forget`), remount sources reverted (0.9.5+ semantics). Workshop must be `Ready` for this, and it is refused on a workshop not yet refreshed after a snap update. Cheaper than remove+launch.

</process>

<verification>
After orphan recovery (Step 3): `workshop list --global` no longer lists the workshop, and the recreated directory is deleted (or repopulated, if the user chose to keep the workshop).

After standard or manual removal:
```
workshop list --global             # workshop gone
sudo lxc list --all-projects | grep workshop.$USER   # no containers
sudo lxc profile list --project workshop.$USER       # no orphan profiles
```
After `workshop restore`:
```
workshop info                      # status Ready, connections back to defaults
workshop connections               # only auto-connections present
```
</verification>

<anti_patterns>
- Jumping to `sudo snap remove workshop --purge` for a single broken workshop. It nukes everyone.
- Removing (or `lxc delete`-ing) a broken workshop before asking what lives only inside it: its home and its Workshop-allocated mount directories go with it (Step 0).
- Mounting a broken VM's disk on the host to rescue files. Attach it to a second VM instead (Step 0).
- Running `lxc delete` without `--force` on a container that's in error — it may refuse and leave you in a worse state.
- Deleting LXD profiles without checking USED BY — kills profiles for valid workshops.
- Confusing `workshop remove` (deletes the container, keeps the YAML) with `workshop restore` (reverts the container's filesystem to a known good point and keeps it running).
- Jumping to manual `lxc delete` for a `missing-project` orphan without first trying the recreate-directory recovery — the daemon still tracks the original path, and `workshop remove --project` works again once the directory exists.
- Forgetting `workshop remove --project <path>` for workshops whose project directory still exists somewhere else (moved, not deleted).
</anti_patterns>

<success_criteria>
- Files the user needed from inside the workshop were copied out before removal, or the user said there were none.
- The target workshop is gone from `workshop list --global`.
- No orphan LXD containers or profiles remain in `workshop.$USER` / `workshop-snapshots.$USER`.
- Other workshops on the system are unaffected (the user did not nuke the snap).
</success_criteria>

<source_docs>
- `how-to/fix-workshops/purge.md` ("Before removing a workshop" and "Copy files out of a broken workshop", 0.9.10)
- `security.md` (an agent with `sudo` can break the workshop; copy files out before `workshop remove`)
- `explanation/workshops/projects.md` (project tracking; orphaned workshops)
- `how-to/fix-workshops/fix-installation.md` (LXC exploration)
- `reference/cli/workshop.md` (remove, restore, list sections)
</source_docs>
