<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Common mistakes when an agent operates the workshop CLI. Each entry is a thing TO AVOID, with the right alternative.
</overview>

<anti_patterns>

<anti_pattern name="Reaching for remove + launch on a failed refresh from Ready">
**Wrong:** `workshop remove && workshop launch` to "fix" a `workshop refresh` that errored from a previously `Ready` workshop.
**Why it's bad:** discards the workshop's previous good state and forces a full rebuild. Loses any non-default mounts and connections set via `remount`/`connect` — which an ordinary `refresh` would have preserved (0.9.5+ refresh keeps manual connect/disconnect wiring and remount sources; remove+launch drops all of it).
**Right:** rerun with `workshop refresh --wait-on-error`, then either `--continue` (after fixing the cause inside `workshop shell`) or `--abort`. Workshop reverts cleanly without losing prior state.
**Exception:** if the workshop is already in `Error` (no recoverable previous state), remove + launch IS the correct path — see the next anti-pattern.
</anti_pattern>

<anti_pattern name="Downgrading the Workshop snap, or resuming an old workshop right after a snap update">
**Wrong:** `sudo snap refresh --channel=<older> workshop` to roll back; or running `workshop restore` / `workshop launch --continue` / `workshop refresh --continue` on a workshop that hasn't been refreshed since the snap updated.
**Why it's bad:** Workshop is not forward compatible (0.9.5+ documented policy). After a snap update those three operations are *refused* on an old-format workshop, because the new daemon can't reproduce the previous version's exact behavior. And a snap downgrade isn't supported at all — the only way down is `snap remove` + reinstall, **which deletes every workshop and SDK on the machine**.
**Right:** after a snap update, run `workshop refresh` on each workshop first — that migrates it and everything works again. Never prescribe a snap downgrade as a troubleshooting step. Source: `reference/workshops.md` (backward-compatibility policy).
</anti_pattern>

<anti_pattern name="Ignoring workshop status">
**Wrong:** running `workshop exec` or `workshop run` against a workshop that turns out to be `Stopped`, `Error`, or `Waiting`.
**Why it's bad:** the command will be rejected with a confusing error. `exec`/`run`/`shell` need `Ready` (or `Waiting` in the limited debug case).
**Right:** check status first with `workshop list` or `workshop info`, then dispatch by state:
- `Stopped` → `workshop start`.
- `Error` → `workshop remove` then `workshop launch`. This is the one case where remove+launch is correct: an `Error` workshop has no recoverable previous state, so there is nothing to lose by rebuilding.
- `Waiting` → finish the in-progress recovery flow first (`workshop refresh --continue` or `--abort`); do NOT remove.
</anti_pattern>

<anti_pattern name="Forgetting that actions edit without refresh">
**Wrong:** suggesting `workshop refresh` after editing the `actions:` block in a workshop definition.
**Why it's bad:** wastes time. Action bodies are parsed at every `workshop run`, so changes take effect immediately.
**Right:** edit `actions:` and run the action. Refresh only for `base`, `sdks`, `connections`, plug/slot definitions.
</anti_pattern>

<anti_pattern name="Hard-coding the workshop name when the project has one">
**Wrong:** insisting on `workshop exec my-workshop -- cmd` when the project defines a single workshop.
**Why it's bad:** noisier than necessary; if the user renames the workshop, your snippets stop working.
**Right:** omit the name in single-workshop projects (`workshop exec -- cmd`, `workshop run -- action`, `workshop info`). Only add the name when the project has multiple workshops or when the user named one explicitly.
</anti_pattern>

<anti_pattern name="Mixing workshop.yaml and .workshop/">
**Wrong:** suggesting both a root-level `workshop.yaml` and per-workshop files in `.workshop/` in the same project.
**Why it's bad:** Workshop refuses this and reports an error.
**Right:** pick one layout. Single workshop → `workshop.yaml` at the root. Multiple workshops → only `.workshop/<name>.yaml` files.
</anti_pattern>

<anti_pattern name="Committing the .lock file">
**Wrong:** leaving `.workshop.lock` tracked by Git.
**Why it's bad:** the lock file binds the project to a launched container; sharing it across machines or worktrees creates cross-talk and confusing errors.
**Right:** add `.workshop.lock` to `.gitignore` — a single file at the project root, in both single- and multi-workshop layouts (verified against the runtime: `workshop list` creates `<project>/.workshop.lock` regardless of whether the definition is `<project>/workshop.yaml` or `<project>/.workshop/<name>.yaml` files). The definition files (`workshop.yaml`, `.workshop/*.yaml`, in-project SDKs) are MEANT to be committed.
</anti_pattern>

<anti_pattern name="Deleting a project directory before removing the workshop">
**Wrong:** `rm -rf <project-dir>` while the workshop is still launched.
**Why it's bad:** orphans the workshop — `workshop list --global` shows it as `Error` with a `missing-project` note, and pathname-based commands stop working.
**Right:** `workshop remove --project <dir>` first, then delete the directory. Already orphaned? Recreate the directory at the same absolute path (`mkdir -p`; it may stay empty) and `workshop remove --project` works again — or restore the project's content there to keep the workshop. Manual `lxc delete` is the fallback, not the first move. See the `purge-and-recover` workflow.
</anti_pattern>

<anti_pattern name="Reaching for snap remove --purge as a debugging step">
**Wrong:** suggesting `sudo snap remove workshop --purge` as soon as something seems broken.
**Why it's bad:** destroys all workshops for all users on the system. Last-resort tool, not a diagnostic.
**Right:** start with `workshop changes`, `workshop tasks <ID>`, `workshop refresh --wait-on-error`. For orphans, try the recreate-directory recovery first, then escalate to `lxc list/delete`. Use `snap remove --purge` only after these don't help.
</anti_pattern>

<anti_pattern name="Suggesting an apt-style update inside the workshop to upgrade an SDK">
**Wrong:** "run `apt update && apt upgrade` inside the workshop" to update a tool installed by an SDK.
**Why it's bad:** SDKs are mounted read-only; the update will either fail or affect only the base, not the SDK-provided files.
**Right:** change the SDK's `channel:` in the definition (or wait for the channel to roll forward), then `workshop refresh`.
</anti_pattern>

<anti_pattern name="Connecting a plug across workshops">
**Wrong:** `workshop connect a/foo:plug b/bar:slot` (different workshops on either side).
**Why it's bad:** rejected. Connections only exist within a single workshop.
**Right:** for cross-workshop networking, use the tunnel interface on both sides, bridging through the host. See `multi-workshop-projects.md`.
</anti_pattern>

<anti_pattern name="Using --wait-on-error with multiple workshops">
**Wrong:** `workshop refresh --wait-on-error a b c`.
**Why it's bad:** the flag is single-workshop only. If a multi-workshop launch/refresh errors, all are aborted.
**Right:** narrow to one workshop first: `workshop refresh --wait-on-error <name>`.
</anti_pattern>

<anti_pattern name="Restarting the daemon (or recreating the workshop) for an ordinary failed change">
**Wrong:** `snap restart workshop` — or remove + launch — as the response to a failed `launch`/`refresh`, a hook error, or a workshop in `Error`.
**Why it's bad:** an ordinary failure is already handled: the change reaches `Error` and either auto-reverts or pauses with `--wait-on-error`. A daemon restart teaches you nothing and skips the diagnosis.
**Right:** `workshop changes` → `workshop tasks <ID>` → the `--wait-on-error` flow.
**Exception:** a change stuck in `Doing` with EVERY command failing on `other changes in progress` is a daemon-level stall the CLI cannot clear — there, `snap restart workshop` followed by recreating the workshop IS the correct path. See `workflows/troubleshoot.md` Step 7 and `references/async-and-recovery.md`.
</anti_pattern>

<anti_pattern name="Assuming the channel is fresh">
**Wrong:** assuming `latest/stable` means "current and reliable".
**Why it's bad:** what `latest/stable` resolves to is the publisher's choice. It may be old or unsuitable.
**Right:** use `sdk info <name>` to inspect available channels, build dates, and bases. Pin a specific track if reliability matters.
</anti_pattern>

</anti_patterns>

<source_docs>
- `how-to/fix-workshops/debug-issues.md`, `how-to/fix-workshops/purge.md`, `how-to/fix-workshops/fix-installation.md`
- `how-to/customize-workshops/move-projects.md`
- `explanation/workshops/concepts.md`
- `reference/cli/workshop.md` (launch, refresh sections)
</source_docs>
