---
name: design-sdk
description: Design, build, and publish Workshop SDKs with sdkcraft — interview and research the software, generate sdkcraft.yaml with hooks and spread smoke tests, iterate via sdkcraft try plus workshop refresh, write the README, then onboard the SDK repo with version branches, CI workflows, and renovate. Use when creating or maintaining a publisher-side (Store) SDK from its own repository — "design an SDK for X", "create an sdkcraft.yaml", "set up renovate and CI for my SDK repo".
argument-hint: "[new|design|generate|iterate|test|readme|onboard|publish] [software or SDK repo]"
---

<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<essential_principles>
Five rules that always apply to designing SDKs. Every workflow assumes them.

1. **Interview first; design from named patterns.** Before writing any file,
   settle: what software, how upstream distributes it, what must persist,
   whether it serves a network service, hardware needs, bases and
   architectures, version scheme, renovate datasource, track count. Every
   proposed construct maps to a pattern in
   `references/reference-sdk-patterns.md` or
   `references/design-best-practices.md` — never an invented field or flag.
   Every question carries a recommendation ("Options: A / B —
   Recommendation: A, because <evidence>"), batched into one message.

2. **Copy, don't synthesize, YAML.** Shapes come from `templates/` here, the
   reference SDKs, and `../use-workshop/templates/` — never from memory.
   Schema facts come from `references/sdkcraft-definition.md`; if a key is
   not there, it does not exist. `stage-packages`/`stage-snaps` are
   hard-rejected — apt work belongs in `setup-base`. There is no `apps:` or
   `services:` key — daemons ship as a dump part plus a systemd user unit.

3. **Nothing ships untried.** Every generated or edited SDK goes through the
   try loop — `sdkcraft clean && sdkcraft try`, consume as `try-<NAME>` in a
   test workshop, `workshop launch --verbose --wait-on-error` or
   `workshop refresh` — and lands with spread smoke tests that prove real
   functionality, before it is called done.

4. **The hook contract is fixed.** Exactly five hooks; `setup-project` runs
   as the `workshop` user, all others as root. Per hook kind, SDKs run
   system → user-listed in definition order → sketch, with no dependency
   resolution — list order IS the dependency mechanism. A refresh reuses the
   post-`setup-base` snapshot; state crosses a refresh only via
   `$SDK_STATE_DIR` or a mount. `check-health` must test real functionality
   and report via `workshopctl set-health` within 5 seconds per attempt.

5. **Interfaces follow policy, and the README says so.** Choose by the
   heuristic: mount = persistence/sharing, gpu = acceleration, tunnel =
   network service, ssh-agent = remote auth. Know which connections happen
   automatically (gpu; mount to the system slot; qualifying tunnels) and
   which need `connections:` or `workshop connect`. When several slots are
   eligible for one plug, order is not guaranteed — write `connections:`.
   The README is concise, follows the template, and states exactly the
   manual wiring a consumer must do.
</essential_principles>

<docs>
Authoritative readable docs:
- Base URL: `https://ubuntu.com/workshop/docs/`
  Per-file `<source_docs>` blocks list paths RELATIVE to this base, with `.md` suffixes (e.g. `reference/cli/workshop.md`). Fetch by concatenating `<base>` + relative path → `https://ubuntu.com/workshop/docs/reference/cli/workshop.md`. The CLI reference is four combined pages — `workshop.md`, `sdk.md`, `sdkcraft.md`, `workshopctl.md` — each holding every subcommand of that tool as a section; there are no per-subcommand pages.
- Whole-tree fallback: `<base>/llms.txt` (index) and `<base>/llms-full.txt` (the full docs tree concatenated). Load one when a specific relative page isn't enough (e.g., the user asks something the skill doesn't directly cover and you want to scan the full docs tree). The docs are also served through the Context7 MCP server for agents that have it.

The base URL may change. It is recorded HERE only — every other file lists relative paths so a single edit re-points the whole skill. Do not embed local `docs/` paths in any file under this skill; the docs site is the source of truth.
</docs>

<sibling_skill>
This skill depends on its sibling `use-workshop` (shipped in the same
plugin): `<required_reading>` blocks cite `../use-workshop/references/*` by
relative path, and consumer-side operating questions (running, refreshing,
debugging a workshop someone uses) route there. The other sibling,
`onboard-workshop`, owns deriving a workshop definition FOR an application
repo — "set up a workshop for this repo" is its territory, not an SDK
design. If the siblings are not installed (single-skill vendoring), fetch
the equivalent docs pages via `<docs>` instead — e.g.
`explanation/interfaces/plugs-and-slots.md` for connection policy,
`reference/cli/workshop.md` for command signatures — and tell the user the
plugin is meant to be installed whole.
</sibling_skill>

<intake>
Pick the matching path (subcommand — what the user wants):

1. `new` — Design and build an SDK end-to-end ("design an SDK for X")
2. `design` — Design only; stop at the proposal, write no files
3. `generate` — Materialize an approved design as files
4. `iterate` — Run or debug the try-refresh loop on an existing SDK source
5. `test` — Add or run spread smoke tests (`sdkcraft test`)
6. `readme` — Write the SDK README from the template
7. `onboard` — Set up the SDK repo: version branches, CI workflows, renovate
8. `publish` — SDK Store: register, upload, release, credentials
9. Consumer-side workshop work (run/refresh/debug, workshop.yaml, in-project
   SDKs) — not this skill; use `use-workshop` or `onboard-workshop`

**If invoked with $ARGUMENTS, route directly without asking.** Arguments
whose first token is not a recognized subcommand route to the `new` chain
with the whole argument string as the software description.
</intake>

<routing>
| Subcommand | User intent (paraphrases) | Path |
|------------|---------------------------|------|
| `new` | "design an SDK for X", "create an SDK for X", "package X as a Workshop SDK", "make X installable in workshops" | `workflows/design-sdk.md` → `workflows/generate-sdk.md` → `workflows/iterate-and-debug.md` → `workflows/write-spread-tests.md` → `workflows/write-readme.md` |
| `design` | "what would an SDK for X look like", "just the design", "don't write files yet", "propose the SDK structure" | `workflows/design-sdk.md`, STOP at the Design Proposal |
| `generate` | "write the files we agreed", "generate the sdkcraft.yaml", "apply the design" | `workflows/generate-sdk.md` → `workflows/iterate-and-debug.md` |
| `iterate` | "sdkcraft try fails", "the hook errors on refresh", "iterate on my SDK", "pack fails", "the SDK doesn't come up healthy" | `workflows/iterate-and-debug.md` |
| `test` | "add spread tests", "smoke tests for the SDK", "sdkcraft test", "prove the SDK works in CI" | `workflows/write-spread-tests.md` |
| `readme` | "write the SDK README", "document the SDK" | `workflows/write-readme.md` |
| `onboard` | "onboard my SDK repo", "set up renovate", "version branches", "automate SDK releases", "CI for my SDK repo" | `workflows/onboard-repo.md` |
| `publish` | "publish to the SDK Store", "register the name", "upload a revision", "release to stable", "store credentials", "flip to production" | `workflows/publish-store.md` |
| — | Consumer side: run/refresh/connect/debug a workshop, edit workshop.yaml, author an in-project SDK | `use-workshop` skill — do not improvise operations here |
| — | "set up a workshop for this repo", "workshop-ify this project" (an app repo, not an SDK) | `onboard-workshop` skill |

The `new` chain stops after `write-readme.md` unless the user asked for repo
automation — then continue into `workflows/onboard-repo.md`. Any chain can
be cut short with "stop after <stage>".
</routing>

<reference_index>
Own references (in `references/`):

| File | Use for |
|------|---------|
| `sdkcraft-definition.md` | sdkcraft.yaml anatomy: fields, platform layouts, parts, the interface union, reserved names, pack-time linters |
| `design-best-practices.md` | Parts-vs-hooks doctrine, setup-base vs setup-project, env vars, the systemd service pattern, health checks, SDK dependencies |
| `runtime-hooks.md` | Five-hook contract: execution context, per-operation order, cross-SDK ordering, snapshot semantics, set-health, per-hook patterns |
| `reference-sdk-patterns.md` | Exemplar catalog mined from the reference SDKs — named shapes to copy |
| `spread-tests.md` | `sdkcraft test` mechanics, tests/ layout, the smoke-test menu |
| `onboarding-ci.md` | Branching model, sdkcraft-actions workflows, renovate.json anatomy, the onboarding git sequence |
| `store-publishing.md` | login/register/upload/release, channels and tracks, credentials |
| `anti-patterns.md` | Design and generation traps (and the right alternative) |

Borrowed from the sibling (load by relative path):

| File | Use for |
|------|---------|
| `../use-workshop/references/interfaces.md` | Interface semantics; auto vs manual connect; wiring decision tree |
| `../use-workshop/references/command-cheatsheet.md` | Verbatim `workshop`/`sdk` command signatures for the try loop |
| `../use-workshop/references/async-and-recovery.md` | Change/task model; `--wait-on-error`/`--continue`/`--abort` |
| `../use-workshop/references/definition-file.md` | workshop.yaml anatomy for authoring test workshops |
| `../use-workshop/references/sdk-types.md` | SDK kinds; where try SDKs fit |
</reference_index>

<workflows_index>
| Workflow | Subcommand | Purpose |
|----------|------------|---------|
| `design-sdk.md` | `design` | Interview → verify upstream facts → match patterns → Design Proposal, STOP for approval |
| `generate-sdk.md` | `generate` | Materialize the proposal: sdkcraft.yaml, hooks, services, tests scaffold, VERSION |
| `iterate-and-debug.md` | `iterate` | The try-refresh loop until the SDK comes up healthy |
| `write-spread-tests.md` | `test` | Encode manual verifications as spread jobs; run `sdkcraft test` |
| `write-readme.md` | `readme` | Concise README from the template, connection story included |
| `onboard-repo.md` | `onboard` | VERSION, renovate.json, CI workflows, the version-branch git sequence |
| `publish-store.md` | `publish` | Store registration, upload, release, credentials, staging→prod flip |
</workflows_index>

<verification_loop>
After ANY mutating workshop command, run the triplet and report it:

```
workshop changes              # find latest change ID
workshop tasks <ID>           # confirm Status: Done (or surface the failure)
workshop info [<workshop>]    # confirm final status (Ready / Waiting / Error)
```

Designing adds two checks on top:
- After every `sdkcraft try`, confirm from its output that the try artifact
  landed, and that the test workshop's `sdks:` list consumes `try-<NAME>`
  before launching or refreshing.
- After `sdkcraft test`, report the result per job (job name → pass/fail),
  never as a bare exit status.

Report back as: **"Change <ID>: <status>. Workshop status: <Ready|...>.
Notes: <...>."**
</verification_loop>

<success_criteria>
A run of this skill is complete when:
- [ ] The request was routed to exactly one path (or stopped at
      `<out_of_scope>` with a handoff).
- [ ] That workflow's `<required_reading>` references were loaded first.
- [ ] A Design Proposal was delivered and approved before any file was
      generated.
- [ ] Every generated or edited SDK went through the try loop and came up
      healthy (`workshop info` reports the SDK okay).
- [ ] Spread tests cover launch plus the SDK's primary functionality.
- [ ] The README matches the template with no verbosity on connections or
      implementation details.
- [ ] An onboarding left `main` as the template branch (no VERSION) and every
      version branch carrying VERSION without the renovate workflows.
- [ ] Every mutating workshop command was followed by the verification
      triplet.
</success_criteria>

<out_of_scope>
- Consumer-side operations — running, refreshing, connecting, debugging a
  workshop, editing a workshop definition someone uses, parallel worktrees →
  the `use-workshop` skill. Authoring test workshops that consume
  `try-<NAME>` during the iterate loop IS in scope here.
- Onboarding an application repo into Workshop ("set up a workshop for this
  repo") → the `onboard-workshop` skill. This skill packages software AS an
  SDK others install; it does not derive workshop definitions from app
  toolchains.
- Authoring in-project SDKs (`.workshop/<name>/sdk.yaml`) → `use-workshop`
  (`workflows/author-in-project-sdk.md` there). Promoting one to a
  publishable SDK starts with `workflows/design-sdk.md` here.
- Interactive `workshop sketch-sdk` flows. They require an `$EDITOR` session
  and cannot be driven by an agent. Acknowledge the command as vocabulary,
  name the constraint, and iterate by editing the SDK source plus the try
  loop instead (`workflows/iterate-and-debug.md`).
- `workshopctl` as a standalone CLI. Emitting
  `workshopctl set-health <okay|waiting|error> [<message>]` *inside* a
  `check-health` hook you are authoring IS in scope and is covered by
  `references/runtime-hooks.md`.
</out_of_scope>

<self_healing>
After completing a run, check whether any issue you hit came from a gap in
this skill's instructions, references, or workflows.

What qualifies for a skill update:
- Tooling drift (an `sdkcraft`/`workshop` subcommand or flag changed, was
  added, or was removed)
- Structural problems (a referenced file is missing, a routing row points at
  the wrong workflow, a dangling cross-reference)
- A missing edge case or failure mode that caused a wrong design or an
  incomplete iteration loop
- An incorrect assumption about the environment (snap layout, LXD behavior,
  docs URLs, Store behavior)

Off-limits for self-edits: `<essential_principles>`, the semantics of the
`<routing>` table, `<out_of_scope>` fencing, and anything under `tests/` —
skill changes are eval-gated and belong in a reviewed PR.

How to update:
1. Report the gap: which file, what is wrong, and the proposed change quoted
   in full.
2. If running from a writable checkout of the skill repo, apply the change
   with Edit/Write after the user confirms. Otherwise (normal case — the
   skill is installed read-only via the plugin marketplace and also consumed
   by GitHub Copilot), propose the change as a PR against
   `canonical/use-workshop-skill`.
3. Preserve conventions: section order, XML tagging, the `<UPPERCASE-NAME>`
   placeholder style, and relative docs paths resolved via `<docs>`.
</self_healing>

<style>
- When emitting YAML, copy from a template under `templates/` — do not
  synthesize from memory.
- Quote numeric-looking versions and channels (`version: "1.0"`,
  `"24/stable"`).
- Ground every `sdkcraft` invocation in `reference/cli/sdkcraft.md` (via
  `<docs>`) and every `workshop` invocation in the sibling cheatsheet — if a
  flag isn't listed, it doesn't exist.
- Prefer the reference SDKs' vocabulary for part and plug names (`cache`,
  `models`, `venv`) over invented ones.
- Hooks in a publishable SDK must be executable (`chmod +x`) and
  shellcheck-clean — both are enforced at pack time, unlike in-project SDKs.
- Keep the design phase read-only; the first write happens in
  `generate-sdk.md` after approval.
</style>
