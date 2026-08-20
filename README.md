<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# use-workshop skill family

Agentic skills for [Workshop](https://ubuntu.com/workshop/docs/):

- **`use-workshop`** — operate the Workshop CLI: launching workshops,
  refreshing them, running commands inside, wiring interfaces, debugging
  failed changes, and orchestrating parallel environments via git worktrees.
- **`onboard-workshop`** — onboard an arbitrary repository: analyze its
  build/test/debug toolchain (Makefiles, package scripts, CI workflows, dev
  servers), deliver an honest feasibility verdict against Workshop's actual
  capability envelope, then propose, generate, launch, and verify a tailored
  workshop definition. If onboarding is only partial or impossible, the
  skill says so instead of shipping a subpar workshop.

`onboard-workshop` borrows the sibling's references and templates by
relative path (`../use-workshop/…`), so the two skills ship and vendor
together.

## Install

### Claude Code (plugin)

Add the marketplace, then install the plugin:

```
/plugin marketplace add canonical/use-workshop-skill
/plugin install use-workshop@canonical
```

Then run `/reload-plugins` (or restart Claude Code) to activate.

Claude Code discovers skills under a top-level `skills/` directory, so
this repo ships a `skills` → `.github/skills` symlink alongside the
`.claude-plugin/` manifests (`plugin.json` + `marketplace.json`). The
skill files themselves stay at `.github/skills/use-workshop/` (single
source of truth, shared with Copilot and any other consumer).

To install from a local clone instead of the marketplace, point Claude
Code at the checkout directly:

```
git clone https://github.com/canonical/use-workshop-skill
claude --plugin-dir ./use-workshop-skill
```

#### Updating

Updates from the marketplace are manual by default:

```
/plugin marketplace update canonical
/plugin update use-workshop
/reload-plugins
```

To have Claude Code pick up new commits automatically at startup,
enable auto-update for the `canonical` marketplace via the
**Marketplaces** tab in `/plugin`. Updates are tracked by commit SHA,
so any new commit to this repo registers as an update — the
`plugin.json` `version` field does not need to be bumped for skill
content edits to flow through.

### Copy into a single repo

If you'd rather vendor the skills into one project (Claude Code or
Copilot), copy BOTH directories — `onboard-workshop` reads
`use-workshop`'s references and templates by sibling-relative path:

- Claude Code: `.github/skills/{use-workshop,onboard-workshop}/` → `.claude/skills/`
- Copilot:     `.github/skills/{use-workshop,onboard-workshop}/` → `.github/skills/`

If you truly need `onboard-workshop` standalone, its `<sibling_skill>`
block in `SKILL.md` documents the docs-URL fallback it uses when the
sibling files are absent.

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

**YAML is schema-traceable.** Every YAML shape and every upstream doc
path the skill shows must be traceable to an upstream schema or doc —
not invented from memory. Two failures this rule exists to prevent
have both happened: an in-project `sdk.yaml` was shown with a `hooks:`
key that strict validation actually rejects, and CLI-explanation pages
were cited after upstream merged them away. Both are now caught
mechanically by free, offline CI checks: `check-yaml-keys` lints every
fenced YAML snippet and every `templates/*.yaml` against key allowlists
generated from the upstream JSON schemas, and `check-source-docs`
validates every cited doc path against `tests/docs-manifest.txt`. Both
allowlist and manifest are regenerated from a Workshop checkout with
`make update-docs-manifest` (`WORKSHOP_REPO=<path>`), so a version bump
refreshes the ground truth in one step.

**Changes are eval-gated.** The bundled `tests/` directories are
[promptfoo](https://promptfoo.dev) regression suites (routing + agentic
E2E + reconstruction) with baselines pinned per (candidate, judge) pair in
each `BASELINE.md`. Three lanes ([`TESTING.md`](TESTING.md)): free static
checks in CI on every push/PR; the ~$1.41 GLM-5.2 routing gate
(`make eval-routing`, also CI `workflow_dispatch`; the repo's only paid
eval and only secret); and a $0 subscription lane — the `claude` CLI on a
local login — for the Sonnet confirmation runs, the onboard routing gate,
the agentic suites, and the reconstruction harness. A skill change that
drops a pinned baseline must not merge. The eval surface is what keeps the
rest of these principles from drifting back into informality.

## Testing

[`TESTING.md`](TESTING.md) is the doctrine: the three lanes, what runs
when, costs, and the judge-comparability rule. Shared harness code lives in
`.github/skills/_testlib/`. When vendoring the skills into another repo,
the `tests/` directories may be omitted — the suites run from this repo
only.

See
[`.github/skills/use-workshop/tests/README.md`](.github/skills/use-workshop/tests/README.md)
for the routing and agentic E2E suites: prerequisites, `make` targets,
filter patterns, and baseline pinning.

For `onboard-workshop`, see
[`.github/skills/onboard-workshop/tests/README.md`](.github/skills/onboard-workshop/tests/README.md)
— its suite adds a guinea-pig *reconstruction eval*: real repos are
sandbox-copied with their workshop definitions hidden, the skill onboards
them from toolchain evidence alone, and the generated definitions are
scored against the originals (deterministic thresholds + a
functional-equivalence rubric).
