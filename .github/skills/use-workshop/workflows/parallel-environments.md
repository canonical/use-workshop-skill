<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Run multiple isolated workloads over the same codebase in parallel: side-by-side test runs, A/B comparisons across base images or SDK versions, multi-branch experiments, agent-driven concurrent tasks, and similar. Combines `git worktree` with one workshop per worktree (or a single shared workshop, per the user's preference). Two facts hold in every layout: **Git commands for a worktree run on the host**, never inside its workshop, and a coding agent is better served by a **separate clone** than by a worktree (Step 1).
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
| **Separate clone per coding agent** | The parallel worker is an autonomous coding agent. Upstream's recommendation: a clone in its own project directory gives the agent its own files *and* its own `.git`, apart from the user's working copy — a worktree narrows the files but Git can't run inside its workshop, and starting an agent in a subdirectory narrows nothing (the whole project, `.git` included, is mounted read-write). Launch one workshop in the clone exactly as in Step 3a. |

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
The single workshop is launched at the project root; every worktree is reachable inside the workshop at `/project/<subdir-name>/` because the whole project directory is mounted. Upstream described this "shared sandbox" layout only in its AI-agents how-to, which 0.9.8 retired; the documented pattern is now one workshop per sibling worktree (Step 3a). It still works for running parallel *non-Git* tasks — tests, builds — in one container, but say that it is no longer an upstream-documented pattern, and that it isolates nothing between the tasks: each one can read and write every worktree and the root `.git`.

Caveat for projects that COMMIT their definition: every subdirectory worktree checkout then carries its own copy of `workshop.yaml`/`.workshop.yaml`, and per-worktree definitions and lock files interfere with each other. Gitignoring the definition **and** the lock (`.workshop.yaml` + `.workshop.lock`, or `.workshop/` + `*.lock` for multi-workshop projects) leaves only the project root's copy. If the user wants the definition committed (this skill's default stance), prefer the sibling-worktree layout instead.

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
Two tasks run concurrently inside one container, separated only by convention — which worktree each one touches. This is the cheapest layout, not an upstream-documented one (the canonical pattern is one workshop per sibling worktree — Step 3a).

**Step 4. Run the parallel tasks.**
- Each terminal/tab/agent works in one worktree.
- **Run Git on the host.** A worktree's `.git` is a file pointing into the main repository's `.git` directory, which isn't mounted in the worktree's workshop, so `workshop exec <name> -- git status` fails with `fatal: not a git repository: <main-repo>/.git/worktrees/<name>`. Commit, diff and merge from the host. Don't work around it by mounting the main repository's `.git` into a workshop where untrusted tools such as coding agents run — Git executes hooks and configured commands from that directory **on the host**.
- Before an autonomous agent starts, disconnect the interfaces it doesn't need (ssh-agent, secrets, writable mounts, tunnels) — inside the workshop everything runs as one user, so a connected interface is reachable by the agent too.
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
- Running Git inside a worktree's workshop, or mounting the main `.git` into it to make that work. Git for worktrees runs on the host.
- Treating a subdirectory or a worktree as a boundary for a coding agent. The agent can change anything in the project mount; give it a separate clone.
</anti_patterns>

<success_criteria>
- The user can run their parallel work without cross-talk between branches.
- Cleanup leaves no entries in `workshop list --global` or `git worktree list`.
- The workflow doesn't depend on which specific tool (test runner, AI agent, build system) the user is parallelizing — it works for any.
</success_criteria>

<source_docs>
- `how-to/develop-with-workshops/use-git.md` (canonical source for SIBLING worktrees — one workshop per worktree — `git worktree move`, and the 0.9.8 warning that Git fails inside a worktree's workshop)
- `explanation/workshops/multi-workshop-patterns.md` (one directory vs several; worktrees run Git on the host; a separate clone for coding agents)
- `security.md` (coding agents: the writable project mount, one user, connected interfaces)
- `reference/ai-agents.md` (agent SDKs; replaces the AI-agents how-to retired in 0.9.8, which was the only upstream source for the shared-workshop subdirectory layout)
- `how-to/customize-workshops/move-projects.md` (move/copy semantics)
- `reference/cli/workshop.md` (launch, remove, list, exec, run sections)
</source_docs>
