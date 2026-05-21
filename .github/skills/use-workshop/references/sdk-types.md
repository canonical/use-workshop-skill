<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Five kinds of SDKs are referenced in workshop definitions and on the CLI. They differ in origin, lifetime, and how they're named in YAML. Pick the right kind for the user's intent.
</overview>

<sdk_types>

<type name="System SDK">
**Origin:** built into Workshop itself.
**YAML name:** `system`. Implicit — automatically present in every workshop; can also be declared explicitly to graft additional plugs/slots onto it.
**Lifetime:** auto-installed first, auto-removed last.
**Purpose:** uniform host-system integration. Provides default slots `system:camera`, `system:desktop`, `system:gpu`, `system:mount`, `system:ssh-agent`. Only SDK that can have host-source mount slots.
**When to use:** any time the workshop needs a host resource (file mount, GPU, camera, display, SSH agent, host network port).
</type>

<type name="Regular Store SDK">
**Origin:** SDK Store, fetched at launch/refresh.
**YAML name:** the SDK's own name (e.g., `<sdk-name>`).
**Versioning:** `channel:` field, snap-like format `<TRACK>/<RISK>/<BRANCH>`. Default `latest/stable`. Risks: `stable`, `candidate`, `beta`, `edge`.
**Lifetime:** versioned and refreshed via `workshop refresh`. Read-only inside the workshop — updates ONLY happen via `refresh`.
**When to use:** the workshop needs a published SDK (a language, framework, tool). Discover available SDKs with `sdk find <query>` and `sdk info <name>`.
</type>

<type name="In-project SDK">
**Origin:** defined inside the project directory.
**YAML name:** `project-<NAME>` (mandatory prefix).
**File layout:** `.workshop/<NAME>/sdk.yaml` plus `.workshop/<NAME>/hooks/`.
**Lifetime:** version-controlled with the project; installed at launch.
**When to use:** project-specific tooling that doesn't belong in the public Store. Multiple workshops in the same `.workshop/` directory can share one in-project SDK by listing it under `sdks:`.
**Authoring:** see `references/in-project-sdk.md` for the `sdk.yaml` schema and hook taxonomy, and `workflows/author-in-project-sdk.md` for the end-to-end procedure.
</type>

<type name="Sketch SDK">
**Origin:** generated locally via `workshop sketch-sdk`.
**YAML name:** does NOT appear in the workshop definition. Lives under `$XDG_DATA_HOME/workshop/`.
**Constraint:** at most one sketch SDK per workshop at a time.
**Lifetime:** transient; auto-applied by the workshop on save. Can be `--stash`ed and `--restore`d.
**Eject path:** `workshop sketch-sdk --eject --name <NAME>` promotes it to an in-project SDK at `.workshop/<NAME>/`. After ejection it's a regular in-project SDK and can be committed.
**When to use:** rapid prototyping. The user wants to add custom packages, run-once setup, env vars, etc., without committing anything yet. List sketches with `workshop sketches`.
**Authoring scope:** this skill does not drive the interactive sketch flow (it requires an `$EDITOR` session). See `<out_of_scope>` in SKILL.md. To ship a custom SDK, write an in-project SDK directly per `workflows/author-in-project-sdk.md`.
</type>

<type name="Try SDK">
**Origin:** locally available, produced by the SDK-authoring toolchain (out of scope for this skill).
**YAML name:** `try-<NAME>`. No `channel`.
**Lifetime:** local only; not in the Store.
**When to encounter:** if the user already has a try SDK on disk and wants to consume it from a workshop. Reference it as `try-<NAME>` in the `sdks:` list.
</type>

</sdk_types>

<decision_tree>
**User wants to add a tool/language/framework to the workshop:**
- First try a Store SDK: `sdk find <keyword>`, then `sdk info <name>` to confirm channels and bases.
- Add it to `workshop.yaml`: `- name: <name>` under `sdks:`. Optionally pin a `channel:`.
- `workshop refresh` to apply.

**User wants project-specific tooling (one or more workshops, hooks of their own):**
- Author an in-project SDK at `.workshop/<NAME>/sdk.yaml` plus `.workshop/<NAME>/hooks/<HOOK>` scripts.
- Reference it as `project-<NAME>` in each workshop definition.
- Full schema, hook taxonomy, and end-to-end procedure: see `references/in-project-sdk.md` and `workflows/author-in-project-sdk.md`.

**User reports an SDK was "installed" but its tool isn't behaving as expected:**
- SDKs are mounted read-only inside the workshop. `apt update`-style commands cannot update SDK-provided files.
- To upgrade: change `channel:` (or wait for the channel to roll forward), then `workshop refresh`.
</decision_tree>

<source_docs>
- `explanation/sdks/concepts.md`
- `explanation/workshops/concepts.md` (Origins and locations table)
- `reference/definition-files/workshop-definition.md` (System SDK, Try, In-project subsections)
- `reference/cli/workshop-sketch-sdk.md`, `reference/cli/workshop-sketches.md`
- `reference/cli/sdk-find.md`, `reference/cli/sdk-info.md`, `reference/cli/sdk-list.md`
</source_docs>
