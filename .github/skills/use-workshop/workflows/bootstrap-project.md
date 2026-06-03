<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Set up a project to use Workshop for the first time, or launch an existing definition that the user just received (e.g., from a clone or a colleague). End state: a `Ready` workshop with the project mounted at `/project/`.
</objective>

<required_reading>
Read these references before acting:
1. `references/concepts.md` — vocabulary
2. `references/definition-file.md` — workshop.yaml anatomy
3. `references/states-and-transitions.md` — what states exist
4. `references/command-cheatsheet.md` — `workshop init`/`launch`/`info`/`list`/`shell` flags
5. `references/sdk-types.md` — picking the right kind of SDK
</required_reading>

<process>

**Step 1. Determine the starting point.**
- Run `ls -A` to see if the project already has a `workshop.yaml`, `.workshop.yaml`, or `.workshop/` directory.
- If it does, the user has an existing definition — skip to Step 4.
- If not, you'll write one in Steps 2–3.

**Step 2. Identify the user's needs.**
Ask the user (only what isn't obvious):
- What base OS? (`ubuntu@22.04`, `24.04`, `26.04` — default to `24.04` if no preference.)
- What tools/runtimes do they need inside?

For each tool, find a published SDK:
```
sdk find <keyword>     # or `workshop.sdk find <keyword>` if `sdk` isn't on PATH
sdk info <name>        # confirms channels and supported bases
```

(See `references/command-cheatsheet.md` `<sdk_cli_invocation>` for the full `sdk` vs `workshop.sdk` resolution rule.)

If the tool isn't in the Store, or the user wants a project-specific install recipe, defer to `author-in-project-sdk.md` (write `.workshop/<name>/sdk.yaml` with hooks).

**Step 3. Create the definition.**
Two first-class paths — pick by what the definition needs:

*Path A — `workshop init` (base + SDKs only).* Scaffold a named definition straight from the command line:
```
workshop init <name> --sdks <sdk1>,<sdk2>/<channel> --base <base>
```
This writes `.workshop/<name>.yaml` (and fails if a workshop with that name already exists). Each `--sdks` entry may pin a channel via `<NAME>/<CHANNEL>` (e.g. `ollama/cpu/stable`). Fast when the workshop is just a base plus Store SDKs. It does NOT scaffold `actions:`, `connections:`, plug/slot grafts, or in-project SDKs — add those by editing the generated file, or use Path B.

*Path B — copy a template (when you need more).* Copy `templates/workshop-minimal.yaml` (single SDK) or `templates/workshop-multi-sdk.yaml` (more); reach for `templates/workshop-with-actions.yaml` or `templates/workshop-with-connections.yaml` when the definition needs those. Save it as a root `workshop.yaml` (single-file layout) or `.workshop/<name>.yaml` (named layout), then replace placeholders.

Either way, keep:
- `name:` — lowercase letters, digits, hyphens; in the named (`.workshop/<name>.yaml`) layout the file basename must match `name:`.
- `base:` — confirmed Store-supported base.
- `sdks:` — entries in install order (system SDK is implicit and first; don't list it unless you need to graft plugs/slots).

Add `.workshop.lock` to `.gitignore`. The lock file is always at the project root, in both single- and multi-workshop layouts.

**Step 4. Launch.**
For an interactive launch:
```
workshop launch
```
For a long launch where the user wants to keep working:
```
workshop launch --no-wait      # prints the change ID
```
For a launch the user wants to inspect on failure:
```
workshop launch --wait-on-error <name>
```

**Step 5. Verify (the verification loop).**
```
workshop changes               # newest change should be Done; copy its ID
workshop tasks <ID>            # ID from the line above; confirm every task is Done
workshop info                  # status: Ready
```
If status is `Error` or `Waiting`, route to `troubleshoot.md`.

**Step 6. Confirm the user can do real work.**
Run a tiny one-liner to prove the project is mounted and tools resolve:
```
workshop exec -- ls /project
workshop shell                 # if the user wants an interactive prompt
```

</process>

<verification>
Report to the user:
- "Workshop `<name>` launched. Status: Ready. Project mounted at /project/. Try: `workshop shell` for an interactive session or `workshop exec -- <command>` for one-offs."
- If the user wrote a new definition, remind them to commit it (and to keep the `.lock` file gitignored).
</verification>

<anti_patterns>
- Writing a `workshop.yaml` and `.workshop/<name>.yaml` in the same project — Workshop rejects this. `workshop init` always writes the `.workshop/<name>.yaml` form, so don't also keep a root `workshop.yaml` for the same project.
- Suggesting `latest/stable` as universally safe. Verify channels with `sdk info`.
- Forgetting `.workshop.lock` in `.gitignore` — committing it causes cross-machine grief.
- Running `workshop start` before `workshop launch`. Initial creation is `launch`; `start`/`stop` cycle a launched workshop.
</anti_patterns>

<success_criteria>
- `workshop info` reports `Ready`.
- The user can `workshop exec -- <cmd>` and see project files.
- `.gitignore` contains `.workshop.lock`.
- The definition file is committable and reviewable.
</success_criteria>

<source_docs>
- `tutorial/part-1-get-started.md`
- `how-to/develop-with-workshops/use-git.md`
- `reference/cli/workshop.md` (init, launch, info, list, shell sections)
- `reference/definition-files/workshop-definition.md`
</source_docs>
