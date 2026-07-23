<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Materialize the approved proposal as committable files: `.workshop/<name>.yaml`
(default name `dev`), any in-project SDK directories, and the `.gitignore`
entry. YAML shapes come from templates, never from memory.
</objective>

<required_reading>
1. `../use-workshop/references/definition-file.md` — full definition anatomy
2. `../use-workshop/references/in-project-sdk.md` — sdk.yaml schema, hook
   taxonomy (when the proposal includes an in-project SDK)
3. Templates: `templates/` here + `../use-workshop/templates/`
</required_reading>

<process>

**Step 1. Pick the generation path.**
- *Path A — `workshop init`* when the proposal is base + Store SDKs only:
  `workshop init <name> --sdks <sdk1>,<sdk2>/<channel> --base <base>`,
  then edit the generated `.workshop/<name>.yaml` to add `actions:`.
  (`init` scaffolds base+SDKs only; it refuses if a root `workshop.yaml` /
  `.workshop.yaml` or same-named definition exists.) The init skeleton is
  NOT a completed generation — generation is done only when every element
  of the approved proposal (actions, channels, grafts, in-project SDKs) is
  in the files.
- *Path B — copy a template* when the proposal needs plug/slot grafts,
  `connections:`, or in-project SDKs: `templates/workshop-dev-server.yaml`
  here, or the sibling `workshop-minimal/multi-sdk/with-actions/
  with-connections` templates. Save as `.workshop/<name>.yaml`; replace every
  placeholder.

**Step 2. Fill actions from the proposal** — each body wraps the repo's real
entry point per `<action_conventions>` in `references/toolchain-signals.md`.

**Step 3. Scaffold in-project SDKs (if proposed).**
Copy `templates/in-project-sdk/` to `.workshop/<sdk-name>/`; set `name:`;
fill `hooks/setup-base` with the apt list from the recorded CI evidence;
keep/adapt `hooks/check-health` to probe the tool the SDK sets up; delete
unused hook stubs; `chmod +x .workshop/<sdk-name>/hooks/*`. Add
`- name: project-<sdk-name>` to the definition's `sdks:` list. For richer
hook logic follow `../use-workshop/workflows/author-in-project-sdk.md`.

**Step 4. Housekeeping.**
- Ensure `.gitignore` contains `.workshop.lock`.
- Validate: `name:` matches the file basename and the name regex; `base:` is a
  supported value; no root `workshop.yaml`/`.workshop.yaml` coexists with
  `.workshop/*.yaml`.

**Step 5. List every created/modified file to the user**, marking each as
committable (definitions, SDK dirs, .gitignore) — then hand off to
`launch-and-verify.md`.
</process>

<verification>
Checklist — every box, before handing off or stopping:
- [ ] Every action from the approved proposal is in `actions:` (a definition
      without actions is complete only if the proposal had none).
- [ ] Every channel is pinned as proposed (detected versions, not defaults).
- [ ] Every proposed in-project SDK directory exists with its hooks.
- [ ] Every proposed tunnel/graft/connection is in the files.
- [ ] `.gitignore` covers `.workshop.lock`.
- [ ] Definition parses and uses only real keys (name, base, sdks,
      connections, actions; grafted plugs/slots).
- [ ] Hook scripts are executable; `sdk.yaml` contains no `hooks:` key.
- [ ] Every placeholder from the template was replaced.
</verification>

<anti_patterns>
- Stopping at the `workshop init` skeleton and moving the proposal's
  actions, hooks, or wiring into prose recommendations — the definition
  must encode them.
- A `hooks:` key inside ANY generated YAML — in-project SDK hooks are
  executable FILES at `.workshop/<name>/hooks/<hook>`; only sketch SDKs
  inline hooks. A `.workshop/<name>.yaml` file carrying `hooks:` is doubly
  wrong (that path is reserved for workshop definitions). Also mind the
  hook contract: `setup-base` runs as root (apt-get belongs there);
  `setup-project` runs as the workshop user (no apt-get).
- Emitting channels the proposal did not verify or tag.
- Leaving a root `workshop.yaml` alongside `.workshop/<name>.yaml`.
- Forgetting the executable bit on hooks — the launch fails late and
  confusingly.
- Synthesizing YAML from memory instead of a template.
</anti_patterns>

<success_criteria>
- `.workshop/<name>.yaml` (+ SDK dirs) exist and match the approved proposal
  exactly — no silent additions or omissions.
- `.gitignore` covers `.workshop.lock`.
- The user knows every path that was written.
</success_criteria>

<source_docs>
- `reference/cli/workshop.md` (init section)
- `reference/definition-files/workshop-definition.md`
- `reference/definition-files/sdk-definition.md`
- `how-to/customize-workshops/add-actions.md`
- `how-to/develop-sdks/write-runtime-hooks.md`
- `how-to/develop-with-workshops/use-git.md`
</source_docs>
