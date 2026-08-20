<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Run multiple isolated workloads over the same codebase in parallel: side-by-side test runs, A/B comparisons across base images or SDK versions, multi-branch experiments, agent-driven concurrent tasks, and similar. Combines `git worktree` with one workshop per worktree (or a single shared workshop, per the user's preference).
</objective>

<required_reading>
1. `references/concepts.md` — project, workshop, lock file
2. `references/command-cheatsheet.md` — `launch`, `remove`, `list --global`, `exec`, `run`
3. `references/states-and-transitions.md` — what each worktree's workshop must look like
</required_reading>

<process>

**Step 1. Pick a model.**

| Pattern | When |
|---------|------|
| **One workshop per worktree** | Each worktree may need a different workshop definition (different base image, different SDK channels). Strongest isolation. |
| **One shared workshop, multiple worktrees** | All worktrees use the same toolchain; you just want isolated working trees. Cheaper resources; faster startup. |

**Step 2. Set up worktrees. The layout you choose depends on the pattern.**

For **one workshop per worktree** (Step 3a), put worktrees as siblings:
```
git worktree add ../<branch-or-purpose>
```
Each sibling is its own project directory; each gets its own `.workshop.lock` and container.

For **shared workshop** (Step 3b), put worktrees as **subdirectories of the project root**:
```
git worktree add <subdir-name>
git worktree add <other-subdir>
git worktree list
```
This is the supported "shared sandbox" pattern — documented upstream in the AI-agents how-to (`use-workshops-with-ai-agents.md`), not in the general Git guide. The single workshop is launched at the project root; every worktree is reachable inside the workshop at `/project/<subdir-name>/` because the whole project directory is mounted.

Caveat for projects that COMMIT their definition: every subdirectory worktree checkout then carries its own copy of `workshop.yaml`/`.workshop.yaml`, and per-worktree definitions and lock files interfere with each other. The upstream pattern resolves this by gitignoring the definition **and** the lock (`.workshop.yaml` + `.workshop.lock`, or `.workshop/` + `*.lock` for multi-workshop projects) so only the project root's copy exists. If the user wants the definition committed (this skill's default stance), prefer the sibling-worktree layout instead.

**Step 3a. One-workshop-per-worktree path (sibling worktrees).**
For each worktree:
```
cd ../<worktree>
workshop launch
```
The worktree gets its own `.workshop.lock` and a fresh container. Variants between worktrees come from per-worktree definition edits — change `base:` or `channel:` and re-launch.

`workshop list --global` will show one row per worktree's workshop, all sharing the same `name:` but with different project paths. Renaming or relocating a worktree with `git worktree move` is safe — the workshop follows the directory, and `workshop list --global` shows the new path.

**Step 3b. Shared-workshop path (worktrees as subdirectories).**
Launch ONE workshop at the project root:
```
cd <project-root>
workshop launch
```
Then run each parallel task inside that single workshop, scoping its working directory to the relevant subdirectory worktree:
```
workshop run --cwd /project/<subdir-name> -- <action>          # or: workshop exec --cwd /project/<subdir-name> -- <command>
workshop run --cwd /project/<other-subdir> -- <action>          # in a separate terminal, in parallel
```
Two tasks run concurrently inside one container, isolated by which worktree they touch. This is the cheapest layout; upstream documents it in the AI-agents how-to (the general Git guide's canonical pattern is one workshop per sibling worktree — Step 3a).

**Step 4. Run the parallel tasks.**
- Each terminal/tab/agent works in one worktree.
- For non-interactive runs, `workshop exec` or `workshop run` inherits stdout/stderr; capture as needed.
- For interactive runs, `workshop shell` opens a login shell.
- Use `workshop run --env <KEY>=<VALUE> -- <action>` to pass per-run configuration without editing the definition.

**Step 5. Compare/merge results.**
Outputs land in the project directory of each worktree (visible from the host). Use normal Git operations to compare branches and merge.

**Step 6. Tear down.**
For each worktree:
```
workshop remove --project <worktree-path>
git worktree remove <worktree-path>
```
Order matters: `workshop remove` BEFORE `git worktree remove`. Removing the directory first orphans the workshop (route to `purge-and-recover.md`).

</process>

<verification>
```
git worktree list                  # each worktree visible
workshop list --global             # one row per worktree's workshop (or one shared)
workshop info --project <path>     # status Ready in each
```
At cleanup:
```
workshop list --global             # the removed workshop should be gone
git worktree list                  # the removed worktree should be gone
```
</verification>

<anti_patterns>
- Running `git worktree remove` before `workshop remove` — orphans LXD resources.
- Sharing a workshop AND letting different worktrees mutate the same `.workshop.lock` — pick one model and stick to it.
- Letting two parallel tasks modify the SAME files in the SAME worktree concurrently. Workshops give container isolation; they do not solve filesystem write contention within a single project directory.
- Forgetting that worktrees share Git history but have independent working trees — definition file edits in one worktree don't show up in another until a commit + checkout.
</anti_patterns>

<success_criteria>
- The user can run their parallel work without cross-talk between branches.
- Cleanup leaves no entries in `workshop list --global` or `git worktree list`.
- The workflow doesn't depend on which specific tool (test runner, AI agent, build system) the user is parallelizing — it works for any.
</success_criteria>

<source_docs>
- `how-to/develop-with-workshops/use-git.md` (canonical source for SIBLING worktrees — one workshop per worktree — and `git worktree move`)
- `how-to/develop-with-workshops/use-workshops-with-ai-agents.md` (canonical source for the SHARED-workshop subdirectory pattern, incl. the gitignore-the-definition requirement)
- `how-to/customize-workshops/move-projects.md` (move/copy semantics)
- `reference/cli/workshop.md` (launch, remove, list, exec, run sections)
</source_docs>
