<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Run commands inside an existing workshop, refresh after definition edits, restart after a stop. The "what do I do today" workflow.
</objective>

<required_reading>
1. `references/command-cheatsheet.md` — `exec`, `run`, `shell`, `refresh`, `start`, `stop`
2. `references/states-and-transitions.md` — what each command needs as a precondition
3. `references/async-and-recovery.md` — how to verify a refresh actually applied
</required_reading>

<process>

**Step 1. Establish current status.**
```
workshop list           # for a quick view
workshop info           # for full detail of a single workshop
```

If status is...
- **Ready** → proceed.
- **Stopped** → `workshop start`, then proceed.
- **Off** → user needs `bootstrap-project.md` first.
- **Error** / **Waiting** → route to `troubleshoot.md`.

**Step 2. Pick the right invocation.**

| User wants to... | Use |
|------------------|-----|
| Run a one-off shell command | `workshop exec [<workshop>] -- <command>` |
| Run a named action from `actions:` | `workshop run [<workshop>] -- <action> [args]` |
| Open an interactive shell | `workshop shell [<workshop>]` |
| List available actions | `workshop actions [<workshop>]` |

Prefer `workshop run` over a verbatim `workshop exec` repetition — actions are reusable and edits don't require refresh.

**Examples (substitute `<workshop>` only if the project has multiple):**
```
workshop exec -- <your-build-command>
workshop run -- <action-name>
workshop run -- test "$@"     # forwards args to the action's "$@"
workshop shell                # interactive
```

**Step 3. Pass through env vars and working directory.**
```
workshop exec --cwd /project/<subdir> --env <KEY>=<VALUE> -- <cmd>
workshop run --env <KEY>=<VALUE> -- <action>
```
- `--cwd` is a path INSIDE the workshop. The project is at `/project/`.
- `--env KEY=VAL` is repeatable. `--env KEY` (no value) inherits from the calling shell.

**Step 4. Apply changes to the definition.**
- **Edited `actions:`** → no refresh needed. Just `workshop run -- <action>`.
- **Edited `base`, `sdks`, `connections`, plugs/slots** → refresh:
  ```
  workshop refresh
  ```
  For inspectable failures, `workshop refresh --wait-on-error <name>` (single workshop only).

**Step 5. Stop / start / verify.**
```
workshop stop          # release container resources but keep state
workshop start         # bring it back
workshop info          # confirm Ready
```

</process>

<verification>
After a `refresh`:
```
workshop changes
workshop tasks <ID>
workshop info
```
After an `exec` or `run`: confirm exit code = 0 and inspect output. The user is responsible for what their command does; you are responsible for confirming the workshop accepted it.
</verification>

<anti_patterns>
- Running `exec`/`run`/`shell` against a `Stopped` workshop. Start it first.
- Running `workshop refresh` after editing only `actions:` — wasteful.
- Using `--wait-on-error` with multiple workshop names in one invocation — rejected.
- Hard-coding the workshop name when the project has only one. Omit it.
</anti_patterns>

<success_criteria>
- The command ran and returned the expected exit code.
- If state changed, the verification loop ran and reported `Ready` (or surfaced the failure).
- The user knows whether they need to `refresh` or not.
</success_criteria>

<source_docs>
- `tutorial/part-1-get-started.md`
- `how-to/customize-workshops/add-actions.md`
- `reference/cli/workshop-exec.md`, `reference/cli/workshop-run.md`, `reference/cli/workshop-shell.md`, `reference/cli/workshop-refresh.md`, `reference/cli/workshop-start.md`, `reference/cli/workshop-stop.md`, `reference/cli/workshop-actions.md`
</source_docs>
