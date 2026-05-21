<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Remove a workshop cleanly when standard `workshop remove` works, and recover from orphaned/stuck workshops by interacting directly with LXD when it doesn't. Last-resort: a full snap purge.
</objective>

<required_reading>
1. `references/command-cheatsheet.md` — `remove`, `restore`, `list`, `info`
2. `references/states-and-transitions.md` — `Error` is the only state from which only `remove` works
3. `references/anti-patterns.md` — when not to escalate
</required_reading>

<process>

**Step 1. Try the standard removal first.**
```
workshop remove <workshop>           # or: workshop remove (single-workshop project)
workshop list                         # confirm gone
workshop list --global                # confirm gone everywhere
```
This stops the container if running, deletes the LXD container, removes data and cache, and cleans up LXD profiles.

If it succeeds, you're done. Note: non-default mount sources set via `workshop remount` are NOT removed by `workshop remove` — clean those up separately if you need to.

**Step 2. If `workshop remove` fails or the workshop still appears.**

Common reasons:
- Workshop is in `Error` and still has a stuck container.
- Project directory was deleted before `workshop remove` was run.
- Container is in an unrecoverable state in LXD.

Identify the LXD project (always `workshop.<USERNAME>` for your user):
```
sudo lxc list --all-projects | grep workshop.$USER
```
Each container is named `<workshop-name>-<short-id>`.

**Step 3. Manually delete the orphan.**
```
sudo lxc delete --project workshop.$USER <CONTAINER> --force
```
Also check the snapshots project (Workshop keeps backup snapshots there):
```
sudo lxc list --all-projects | grep workshop-snapshots.$USER
sudo lxc delete --project workshop-snapshots.$USER <CONTAINER> --force
```

**Step 4. Clean up orphaned LXD profiles.**
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

**Step 5. If the container fails to start during recovery.**
```
sudo lxc info --show-log --project workshop.$USER <CONTAINER>
```
Increase LXD verbosity if needed:
```
sudo snap set lxd daemon.debug=true
sudo snap restart lxd.daemon
```
Then retry the delete.

**Step 6. Last-resort: purge the snap.**
```
sudo snap remove workshop --purge
```
This removes EVERY workshop for EVERY user on the system, plus all profiles, storage pools, etc. The snap's `remove` hook handles the cleanup. After this, reinstall:
```
sudo snap install workshop --classic
```
Use only when steps 1–5 have not resolved the problem.

**Step 7. Restore vs purge: a word on `workshop restore`.**
If the workshop is `Ready` but in a bad state and you just want to undo recent changes (`remount`, `connect`, runtime mutations) without losing the underlying container, prefer:
```
workshop restore <workshop>
```
This reverts the container filesystem to the last `launch`/`refresh` state and resets connections+mounts to defaults. Workshop must be `Ready` for this. Cheaper than remove+launch.

</process>

<verification>
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
- Running `lxc delete` without `--force` on a container that's in error — it may refuse and leave you in a worse state.
- Deleting LXD profiles without checking USED BY — kills profiles for valid workshops.
- Confusing `workshop remove` (deletes the container, keeps the YAML) with `workshop restore` (reverts the container's filesystem to a known good point and keeps it running).
- Forgetting `workshop remove --project <path>` for orphan workshops whose project directory still exists somewhere.
</anti_patterns>

<success_criteria>
- The target workshop is gone from `workshop list --global`.
- No orphan LXD containers or profiles remain in `workshop.$USER` / `workshop-snapshots.$USER`.
- Other workshops on the system are unaffected (the user did not nuke the snap).
</success_criteria>

<source_docs>
- `how-to/fix-workshops/purge.md`
- `how-to/fix-workshops/fix-installation.md` (LXC exploration)
- `reference/cli/workshop-remove.md`, `reference/cli/workshop-restore.md`, `reference/cli/workshop-list.md`
</source_docs>
