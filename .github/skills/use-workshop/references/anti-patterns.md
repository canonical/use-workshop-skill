<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Common mistakes when an agent operates the workshop CLI. Each entry is a thing TO AVOID, with the right alternative.
</overview>

<anti_patterns>

<anti_pattern name="Reaching for remove + launch on a failed refresh from Ready">
**Wrong:** `workshop remove && workshop launch` to "fix" a `workshop refresh` that errored from a previously `Ready` workshop.
**Why it's bad:** discards the workshop's previous good state and forces a full rebuild. Loses any non-default mounts and connections set via `remount`/`connect`.
**Right:** rerun with `workshop refresh --wait-on-error`, then either `--continue` (after fixing the cause inside `workshop shell`) or `--abort`. Workshop reverts cleanly without losing prior state.
**Exception:** if the workshop is already in `Error` (no recoverable previous state), remove + launch IS the correct path — see the next anti-pattern.
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
**Why it's bad:** orphans the LXD container and profiles. `workshop list --global` will still show the workshop; recovery requires manual `lxc delete`.
**Right:** `workshop remove --project <dir>` first, then delete the directory.
</anti_pattern>

<anti_pattern name="Reaching for snap remove --purge as a debugging step">
**Wrong:** suggesting `sudo snap remove workshop --purge` as soon as something seems broken.
**Why it's bad:** destroys all workshops for all users on the system. Last-resort tool, not a diagnostic.
**Right:** start with `workshop changes`, `workshop tasks <ID>`, `workshop refresh --wait-on-error`. Escalate to `lxc list/delete` for orphaned containers. Use `snap remove --purge` only after these don't help.
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
- `reference/cli/workshop-launch.md`, `reference/cli/workshop-refresh.md`
</source_docs>
