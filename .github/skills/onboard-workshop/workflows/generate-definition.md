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
  placeholder. An accepted minimal-workshop fallback (low-confidence verdict)
  copies the sibling `workshop-minimal.yaml` and stops there — no actions, no
  toolchain claims.

**Step 2. Fill actions from the proposal** — each body wraps the repo's real
entry point per `<action_conventions>` in `references/toolchain-signals.md`.

**Step 3. Scaffold in-project SDKs (if proposed).**
Copy `templates/in-project-sdk/` to `.workshop/<sdk-name>/`; set `name:`;
fill `hooks/setup-base` with the apt list from the recorded CI evidence;
keep/adapt `hooks/check-health` to probe the tool the SDK sets up; delete
unused hook stubs; `chmod +x .workshop/<sdk-name>/hooks/*` (house style —
Workshop runs hooks with bash either way). Add `- name: project-<sdk-name>`
to the definition's `sdks:` list. For richer hook logic follow
`../use-workshop/workflows/author-in-project-sdk.md`.

Every install line in a hook traces to repo evidence. Where the proposal
recorded a need with no install route, write the candidate and tag it in
place — `# UNVERIFIED: <what> — no install evidence in the repo` — so the
guess is legible in the file a reviewer reads, not only in the transcript.

**Step 4. Write the `.gitignore` line.**
This is a generation step, not a review item: append `.workshop.lock` to
`.gitignore` (creating the file if the repo has none) immediately after the
definition is written. It is the only file outside `.workshop/**` an
onboarding may touch, and it is the step most often lost when the rest of the
run is large.

**Step 5. Validate.**
`name:` matches the file basename and the name regex; `base:` is a supported
value; no root `workshop.yaml`/`.workshop.yaml` coexists with
`.workshop/*.yaml`; with several definitions, each basename matches its own
`name:`.

**Step 6. List every created/modified file to the user**, marking each as
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
- [ ] `.gitignore` covers `.workshop.lock` (Step 4 — check the file, don't
      recall having done it).
- [ ] Every install line in a hook is either repo-evidenced or carries an
      inline `# UNVERIFIED:` tag and an `Unverified:` entry in the verdict.
- [ ] Definition parses and uses only real keys (name, base, sdks,
      connections, actions; grafted plugs/slots).
- [ ] `sdk.yaml` contains no `hooks:` key; hook files are present under
      `hooks/` (executable by convention).
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
- Editing an existing repo file (Makefile, package.json, CI workflow, test
  config) to make an action fit — wrap the entry point as it is, or record a
  GAP. Onboarding writes only `.workshop/**` and the `.gitignore` line.
- Emitting channels the proposal did not verify or tag.
- Leaving a root `workshop.yaml` alongside `.workshop/<name>.yaml`.
- Writing an install command the repo does not evidence as though it were a
  fact — `snap install <tool>` for a snap nobody confirmed exists, an apt
  package guessed from the tool's name. It reads as correct and fails at
  launch. Tag it `# UNVERIFIED:` and surface it, or record a GAP.
- Writing a hook for an interpreter other than bash and trusting the shebang
  to select it — Workshop runs hooks with bash whatever the shebang says.
  (Missing `+x` is NOT this failure: an in-project hook at 0644 still runs.)
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
