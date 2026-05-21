<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# use-workshop skill

Agentic skill for operating the
[Workshop](https://ubuntu.com/workshop/docs/) CLI —
launching workshops, refreshing them, running commands inside, wiring
interfaces, debugging failed changes, and orchestrating parallel
environments via git worktrees.

## Quickstart

Copy `.github/skills/use-workshop/` into the target repo:

- Claude Code: `.claude/skills/use-workshop/`
- Copilot:     `.github/skills/use-workshop/`

And so on.

For the Workshop CLI itself, see the
[Workshop docs](https://ubuntu.com/workshop/docs/).

## Design principles

A few opinions about what keeps a CLI-operating skill useful as the
agent's context fills up and as the underlying CLI evolves.

**Router, not a playbook.** `SKILL.md` does not try to teach Workshop
end-to-end. It dispatches: an `<intake>` enumeration, a `<routing>`
table mapping user paraphrases to workflow files, and a
`<reference_index>` mapping topics to reference files. A typical agent
turn loads `SKILL.md` plus one workflow plus one or two references —
not the whole skill. This keeps context budgets reasonable and makes
adding a new workflow a constant-cost change.

**Pure-XML body, prose-light.** Every file under `references/` and
`workflows/` uses semantic tags (`<overview>`, `<process>`,
`<anti_patterns>`, `<success_criteria>`, `<source_docs>`). Inside
tags it is tables, command blocks, and short directive sentences.
The audience is a model that benefits from structural cues to land on
the right action, not a human reader who can interpolate from prose.

**External docs are the source of truth.** A single `<docs>` block in
`SKILL.md` declares the canonical Workshop docs base URL. Per-file
`<source_docs>` blocks list paths *relative* to that base, with `.md`
suffixes. The skill is portable — installable into any repo, with the
URLs still resolving — and the doc site is responsible for staying
current; the skill is responsible for routing the agent to the right
page.

**Scope is fenced explicitly.** An `<out_of_scope>` block in
`SKILL.md` enumerates what the skill will NOT drive: publishing-grade
`sdkcraft`, standalone `workshopctl`, interactive sketch sessions
that require `$EDITOR`. Out-of-scope cases redirect to docs URLs with
stop-do-not-improvise language. Defensive fencing matters because the
surrounding ecosystem has overlapping CLIs whose error messages do not
always make the boundary obvious.

**Failure modes are first-class.** Dedicated documents
(`troubleshoot.md`, `purge-and-recover.md`, `anti-patterns.md`,
`async-and-recovery.md`) cover the most common errors and the
diagnostic flow. `SKILL.md` mandates a verification loop —
`workshop changes` → `workshop tasks <ID>` → `workshop info` — after
every mutating action, with a "report back as" template. The skill
assumes things will go wrong and pre-routes the recovery path.

**Templates, not memory.** YAML stubs under `templates/` are the
canonical source for `workshop.yaml` shapes. The style guide
instructs the agent to copy from a template rather than synthesize
from memory, because schema details (`base:` syntax, plug/slot
structure, action format) are easy to get plausibly-but-wrongly right.

**Changes are eval-gated.** The bundled `tests/` directory is a
[promptfoo](https://promptfoo.dev) regression suite (routing +
agentic E2E) with per-model baselines pinned in `BASELINE.md`. A
skill change that drops a baseline fails CI. The eval surface is
what keeps the rest of these principles from drifting back into
informality.

## Testing

See
[`.github/skills/use-workshop/tests/README.md`](.github/skills/use-workshop/tests/README.md)
for the routing and agentic E2E suites: prerequisites, `make` targets,
filter patterns, and baseline pinning.
