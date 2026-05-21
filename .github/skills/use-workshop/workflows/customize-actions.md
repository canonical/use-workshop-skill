<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Add or change customizations to an existing workshop's `actions:` block — reusable shell commands invoked via `workshop run`. For authoring an in-project SDK with hooks, see `author-in-project-sdk.md`.
</objective>

<required_reading>
1. `references/definition-file.md` — `actions:` syntax
2. `references/command-cheatsheet.md` — `workshop actions`, `workshop run`, `workshop refresh`
</required_reading>

<process>

**Step 1. Decide which mechanism fits.**

| Goal | Mechanism |
|------|-----------|
| A reusable shell command for the workshop (build, test, lint) | `actions:` block in the definition (this workflow) |
| A custom, project-specific SDK shared by team / multiple workshops | In-project SDK — see `author-in-project-sdk.md` |
| A new published dependency | Store SDK — list under `sdks:` and `workshop refresh` (see `bootstrap-project.md`) |

**Step 2. Add or edit an action.**

Edit the workshop definition's `actions:` block:

```yaml
actions:
  <action-name>: |
    <shell command>
  test: <test-runner> "$@"
```
- Quote `"$@"` to forward arguments correctly.
- `errexit` and `pipefail` are set automatically.

Run it:

```
workshop run -- <action-name>
workshop run -- test -k <substring>
```

NO `workshop refresh` needed — actions are parsed at run time.

List defined actions: `workshop actions`.

**Step 3. Verify.**

- `workshop actions` lists the new/edited action.
- `workshop run -- <name>` exits 0 (or surfaces the script's own non-zero exit cleanly).

</process>

<verification>
For action edits, no `workshop refresh` is required; just confirm the action runs:

```
workshop actions
workshop run -- <action-name>
```

If the user also touched anything outside `actions:` (`base`, `sdks`, `connections`, plug/slot definitions), follow the standard mutating verification loop:

```
workshop changes
workshop tasks <ID>
workshop info
```
</verification>

<anti_patterns>
- Suggesting `workshop refresh` after editing only `actions:`. It's a no-op.
- Forgetting to quote `"$@"` in an action body — argument forwarding silently breaks for filenames with spaces.
- Defining an action that duplicates a well-known CLI command (`bash`, `pwd`) and overrides what the user expects from the shell.
</anti_patterns>

<success_criteria>
- The new action is listed by `workshop actions`.
- `workshop run -- <name>` invokes it with the expected arguments and exit status.
- The workshop's status is unchanged (action edits don't move state).
</success_criteria>

<source_docs>
- `how-to/customize-workshops/add-actions.md`
- `reference/cli/workshop-actions.md`, `reference/cli/workshop-run.md`
</source_docs>
