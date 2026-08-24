<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Write the SDK's README from `templates/README-template.md`: concise,
consumer-facing, with the connection story stated exactly — and nothing
else. The acceptance rule is a hard check: no unnecessary verbosity on
interface connections, implementation details, or internals.
</objective>

<required_reading>
1. `templates/README-template.md` — the skeleton; keep its section order
2. The SDK's own `sdkcraft.yaml` — the README documents what IS, not the
   proposal
</required_reading>

<process>

**Step 1. Overview.** One short paragraph, synchronized with the
definition's `summary`/`description` fields — same claims, no drift.

**Step 2. Usage snippet.** A minimal workshop definition consuming the SDK
by its Store name (channel quoted), plus — only if the connection story
requires it — the exact `connections:` block or `workshop connect` command
a consumer must run. Copy the shape from the template; keep it to the one
snippet.

**Step 3. Plugs and slots.** One line per endpoint: name, interface,
purpose, and auto / `connections:` / `workshop connect`. Purpose only — no
implementation detail (no part names, no hook narration, no mount
internals).

**Step 4. Persistence and updates.** What survives a workshop update
(mount-backed paths, tracked state) in consumer language.

**Step 5. Prune.** Delete anything the template does not ask for: no
"Installed components", no "Platforms, channels, versions" tables, no
hook-by-hook explanations, no build instructions (the repo's CI is the
build documentation). If a sentence explains HOW the SDK works rather than
how to USE it, cut it.
</process>

<verification>
- [ ] Section order matches the template; nothing extra.
- [ ] Overview agrees with `summary`/`description` in sdkcraft.yaml.
- [ ] Every plug/slot line carries its connection mode.
- [ ] The usage snippet is copyable as-is (quoted channel, real names).
- [ ] The prune pass ran — the README says how to use, not how it's built.
</verification>

<anti_patterns>
- Narrating hooks or parts in the README.
- Listing every platform/channel/version combination.
- A connection story that says "connect as needed" instead of naming the
  command or block.
- Restating the docs site — link by concept, don't duplicate.
</anti_patterns>

<success_criteria>
- A README a consumer can act on in under a minute: what it is, how to add
  it, what to connect, what persists — template-shaped, nothing more.
</success_criteria>

<source_docs>
- `how-to/develop-sdks/publish-an-sdk.md`
- `explanation/sdks/best-practices.md`
</source_docs>
