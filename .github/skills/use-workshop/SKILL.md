---
name: use-workshop
description: Operate the Workshop CLI fluently — launch and refresh workshops, run commands inside them, manage interfaces, debug failed changes, and orchestrate parallel environments via git worktrees. Use when the user mentions workshop, .workshop.yaml, an LXD-backed dev environment, or wants to plan/edit a workshop definition.
---

<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<essential_principles>
Five rules that always apply to operating Workshop. These come first; every workflow assumes them.

1. **The workshop is an isolation boundary.** Processes running inside a workshop cannot reach host resources except through declared interface connections. State this when relevant; do not assume any specific workload runs inside.

2. **State changes are async.** Every mutating command produces a numbered `change` composed of `tasks`. To diagnose what happened, use `workshop changes` then `workshop tasks <ID>` — never guess.

3. **Refresh is non-destructive; prefer it to remove+launch.** If `workshop refresh` errors, rerun with `--wait-on-error` to pause in `Waiting`, investigate via `workshop shell`, then `--continue` (after fixing) or `--abort` (to revert). Constraint: `--wait-on-error` is single-workshop only.

4. **Auto-connect vs manual-connect differs by interface.** Mount and GPU auto-connect. Camera, desktop, ssh-agent, custom-device, and most tunnel cases require an explicit `workshop connect <plug-ref> [<slot-ref>]` after launch/refresh. If the user wants those, schedule the `connect` step.

5. **The project directory is mounted at `/project/`.** Any path that needs to be visible to the workshop must be reachable under `/project/`. Working directories passed via `workshop exec --cwd` or `workshop run --cwd` use workshop paths.
</essential_principles>

<docs>
Authoritative readable docs:
- Base URL: `https://ubuntu.com/workshop/docs/`
  Per-file `<source_docs>` blocks list paths RELATIVE to this base, with `.md` suffixes (e.g. `reference/cli/workshop.md`). Fetch by concatenating `<base>` + relative path → `https://ubuntu.com/workshop/docs/reference/cli/workshop.md`. The CLI reference is four combined pages — `workshop.md`, `sdk.md`, `sdkcraft.md`, `workshopctl.md` — each holding every subcommand of that tool as a section; there are no per-subcommand pages.
- Whole-tree fallback: `<base>/llms.txt` — `https://ubuntu.com/workshop/docs/llms.txt`. Load this when a specific relative page isn't enough (e.g., the user asks something the skill doesn't directly cover and you want to scan the full docs tree).

The base URL may change. It is recorded HERE only — every other file lists relative paths so a single edit re-points the whole skill. Do not embed local `docs/` paths in any file under this skill; the docs site is the source of truth.
</docs>

<intake>
Pick the matching workflow based on what the user wants to do:

1. Bootstrap a new project / scaffold a definition (`workshop init`) / launch a workshop for the first time
2. Day-to-day ops (run a command, refresh, restart)
3. Customize the workshop (add or edit `actions:`)
4. Author an in-project SDK with hooks (`.workshop/<name>/`)
5. Wire interfaces (mount, GPU, tunnel, ssh-agent, etc.)
6. Run parallel environments (git worktrees per task)
7. Connect an IDE or remote tool via SSH/tunnel
8. Manage multiple workshops in one project
9. Troubleshoot a failed change
10. Purge or recover a stuck/orphaned workshop

Then read the matching workflow under `workflows/` and follow it.
</intake>

<routing>
| User intent (paraphrases) | Workflow |
|---------------------------|----------|
| "set up", "first time", "bootstrap", "init", "scaffold a definition", "create a workshop definition", "workshop init", "I just cloned", "what do I do" | `workflows/bootstrap-project.md` |
| "run a command", "execute", "shell in", "build inside", "lint", "test" | `workflows/daily-ops.md` |
| "add an action", "reusable script", "actions: block" | `workflows/customize-actions.md` |
| "in-project SDK", "add a hook", "iterate on a hook", "iterate on the SDK", "setup-project", "setup-sdk", "setup-base", "check-health", "save-state", "restore-state", "package-specific SDK", "tool wrapper", "install ruff in the workshop" | `workflows/author-in-project-sdk.md` |
| "connect", "disconnect", "remount", "expose port", "forward port", "GPU", "ssh-agent", "tunnel", "mount", "serial device", "USB device", "/dev/", "custom-device" | `workflows/manage-interfaces.md` |
| "two parallel runs", "compare side by side", "worktrees", "isolated copies", "agents in parallel" | `workflows/parallel-environments.md` |
| "VS Code", "JetBrains", "remote IDE", "browser-accessible", "expose to my browser" | `workflows/ide-integration.md` |
| "multiple workshops", "frontend and backend", "two environments in one project", "cross-workshop" | `workflows/multi-workshop-projects.md` |
| "failed", "error", "broken", "won't refresh", "stuck", "what went wrong", "no space left on device", "disk full", "out of space", "storage pool full", "resize storage", "storage quota", "quota", "other changes in progress", "stuck in Doing", "daemon" | `workflows/troubleshoot.md` |
| "remove all", "purge", "orphaned", "project deleted", "clean up", "lxc" | `workflows/purge-and-recover.md` |
</routing>

<reference_index>
Domain knowledge files in `references/`. Each workflow declares which to load via `<required_reading>`.

| File | Use for |
|------|---------|
| `command-cheatsheet.md` | Verbatim signatures and key flags for every `workshop`/`sdk` subcommand |
| `concepts.md` | Vocabulary: workshop, project, SDK, plug/slot, change/task, action, hook |
| `states-and-transitions.md` | Status diagram (Off, Ready, Stopped, Pending, Waiting, Error) and which commands work in each |
| `definition-file.md` | Workshop YAML anatomy: keys, SDK entries, plug/slot definitions, action format |
| `interfaces.md` | Seven interface types, auto-connect vs manual table, wiring decision tree |
| `sdk-types.md` | System / Store / in-project / sketch / try SDKs and when to reach for each |
| `in-project-sdk.md` | `sdk.yaml` schema, hook taxonomy, filesystem layout, execution context for in-project SDKs |
| `async-and-recovery.md` | Change/task model, `--wait-on-error`/`--continue`/`--abort` recovery, `--no-wait` |
| `anti-patterns.md` | Common operating mistakes to avoid (and the right alternative) |
</reference_index>

<workflows_index>
| Workflow | Purpose |
|----------|---------|
| `bootstrap-project.md` | First-time setup: scaffold a definition (via `workshop init` or a template) + launch + verify |
| `daily-ops.md` | Run commands, edit, refresh, start/stop |
| `customize-actions.md` | Add reusable shell commands via `actions:` |
| `author-in-project-sdk.md` | Write or update an in-project SDK at `.workshop/<name>/` with hooks |
| `manage-interfaces.md` | `connect`/`disconnect`/`remount`, plug binding, port forwarding |
| `parallel-environments.md` | Git worktrees + per-worktree workshops for any parallel workload |
| `ide-integration.md` | Remote IDE access patterns + browser-accessible services via tunnels |
| `multi-workshop-projects.md` | `.workshop/` layout, in-project SDKs, cross-workshop tunnels |
| `troubleshoot.md` | Diagnose with `changes`/`tasks`; recover via `--wait-on-error` |
| `purge-and-recover.md` | `remove`/`restore`; manual LXD cleanup for orphans |
</workflows_index>

<verification_loop>
After ANY mutating action, follow this triplet and report the result:

```
workshop changes              # find latest change ID
workshop tasks <ID>           # confirm Status: Done (or surface the failed task)
workshop info [<workshop>]    # confirm final status (Ready / Stopped / Waiting / Error)
```

Do NOT skip this loop. The user reads CLI output less carefully than a CLI tool does; you are responsible for confirming the state actually changed and reporting it back.

Report back as: **"Change <ID>: <status>. Workshop status: <Ready|...>. Notes: <...>."**
</verification_loop>

<success_criteria>
A run of this skill is complete when:
- [ ] The request was routed to exactly one workflow (or stopped at `<out_of_scope>` with a docs pointer).
- [ ] That workflow's `<required_reading>` references were loaded before acting.
- [ ] Every mutating action was followed by the verification triplet (`changes` → `tasks <ID>` → `info`).
- [ ] The outcome was surfaced to the user in the report-back format above.
</success_criteria>

<out_of_scope>
This skill DOES cover authoring in-project SDKs (under `.workshop/<name>/sdk.yaml` plus `hooks/` scripts). For that, use `workflows/author-in-project-sdk.md` together with `references/in-project-sdk.md`.

It does NOT cover:
- `sdkcraft *` (build-time packaging/publishing of Store SDKs).
- `workshopctl` as a standalone CLI — driving it from outside a hook is out of scope. Emitting `workshopctl set-health <Ready|Pending|Error> [--reason …]` *inside* a `check-health` hook script you are authoring IS in scope and is covered by `references/in-project-sdk.md` and `workflows/author-in-project-sdk.md`.
- Interactive `workshop sketch-sdk` / `workshop sketches` flows. They require an `$EDITOR` session and cannot be driven by an agent. If a user asks for a sketch walkthrough, do NOT enumerate `workshop sketch-sdk` invocations or describe the editor-save-refresh loop step by step. Acknowledge the command as vocabulary, name the constraint (interactive `$EDITOR`), and route them to `workflows/author-in-project-sdk.md` (write `.workshop/<name>/` directly — that's the agent-drivable path to ship a custom SDK).

For these, point the user at the docs (resolve via `<base>` from `<docs>` above):
- `<base>/explanation/sdks/concepts.md` for the SDK-publisher mental model
- `<base>/reference/cli/sdkcraft.md` for the `sdkcraft` CLI surface
- `<base>/reference/cli/workshopctl.md` for the standalone `workshopctl` CLI
- `<base>/tutorial/part-3-sketch-sdks.md` and `<base>/tutorial/part-4-craft-sdks.md` for hands-on SDK development
- `<base>/reference/cli/workshop.md` (the `workshop sketch-sdk` section) — for the user's own reading, NOT to be summarized step-by-step in the skill's response

Then stop. Do not improvise standalone `sdkcraft` / `workshopctl` invocations or step-by-step sketch sessions.
</out_of_scope>

<self_healing>
After completing a run, check whether any issue you hit came from a gap in this skill's instructions, references, or workflows.

What qualifies for a skill update:
- Tooling drift (a `workshop`/`sdk` subcommand or flag changed, was added, or was removed)
- Structural problems (a referenced file is missing, a routing row points at the wrong workflow, a dangling cross-reference)
- A missing edge case or failure mode that caused a wrong or incomplete recovery
- An incorrect assumption about the environment (snap layout, LXD behavior, docs URLs)

Off-limits for self-edits: `<essential_principles>`, the semantics of the `<routing>` table, `<out_of_scope>` fencing, and anything under `tests/` — skill changes are eval-gated and belong in a reviewed PR.

How to update:
1. Report the gap: which file, what is wrong, and the proposed change quoted in full.
2. If running from a writable checkout of the skill repo, apply the change with Edit/Write after the user confirms. Otherwise (normal case — the skill is installed read-only via the plugin marketplace and also consumed by GitHub Copilot), propose the change as a PR against `canonical/use-workshop-skill`.
3. Preserve conventions: section order, XML tagging, the `<UPPERCASE-NAME>` placeholder style, and relative docs paths resolved via `<docs>`.
</self_healing>

<style>
- Always check workshop status before acting on something the user didn't just create. Use `workshop list` or `workshop info`.
- Prefer omitting workshop names when the project has only one workshop.
- When emitting YAML, copy from a template under `templates/` — do not synthesize from memory.
- Surface `workshop warnings` if the user is about to operate on a workshop that has unacknowledged warnings.
- Ground every command in the cheatsheet — if a flag isn't listed there, it doesn't exist.
</style>
