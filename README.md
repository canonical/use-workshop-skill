<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# use-workshop skill family

Agent skills for [Workshop](https://ubuntu.com/workshop/docs/), in the
standard `SKILL.md` format:

- **`use-workshop`**: operates the Workshop CLI. It launches and refreshes
  workshops, runs commands in them, connects interfaces, debugs failed
  changes, and runs parallel workshops in git worktrees.
- **`onboard-workshop`**: creates a workshop definition for an existing
  repository. It reads the repository's build, test and debug toolchain,
  reports whether Workshop can support it, then generates, launches and
  verifies the definition.
- **`design-sdk`**: designs, builds and publishes Store SDKs with
  `sdkcraft`. It writes `sdkcraft.yaml`, hooks, spread smoke tests and the
  README, and sets up the SDK repository (version branches, CI, renovate).

`onboard-workshop` and `design-sdk` read files from `../use-workshop/`.
Always install the three skills together, in the same directory.

## Install

The skills are in `.github/skills/` in this repository. The `tests/`
subdirectories and `.github/skills/_testlib/` are only used to evaluate the
skills here, so you can leave them out.

Most agents read skills from `~/.agents/skills/` (all projects) and
`.agents/skills/` (one project). Claude Code is the exception: it reads
`~/.claude/skills/` and `.claude/skills/` instead.

| Agent | All projects | One project |
|---|---|---|
| opencode | `~/.agents/skills/` | `.agents/skills/` |
| omp | `~/.agents/skills/` | `.agents/skills/` |
| Codex CLI | `~/.agents/skills/` | `.agents/skills/` |
| GitHub Copilot CLI | `~/.agents/skills/` | `.agents/skills/` or `.github/skills/` |
| Claude Code | `~/.claude/skills/` | `.claude/skills/` |

Tested with opencode 2.4.1, omp 19.1.1, Codex CLI 0.172.0, GitHub Copilot
CLI 1.0.114 and Claude Code 2.1.332.

### For all projects

Clone the repository and link the skills into `~/.agents/skills/`:

```sh
git clone https://github.com/canonical/use-workshop-skill ~/.local/share/use-workshop-skill
mkdir -p ~/.agents/skills
for s in use-workshop onboard-workshop design-sdk; do
  ln -s ~/.local/share/use-workshop-skill/.github/skills/$s ~/.agents/skills/$s
done
```

For Claude Code, also link them into `~/.claude/skills/`:

```sh
mkdir -p ~/.claude/skills
for s in use-workshop onboard-workshop design-sdk; do
  ln -s ~/.agents/skills/$s ~/.claude/skills/$s
done
```

To update, pull the clone:

```sh
git -C ~/.local/share/use-workshop-skill pull
```

### For one project

Run this from the project root to copy the skills into `.agents/skills/`:

```sh
src=$(mktemp -d)
git clone --depth 1 https://github.com/canonical/use-workshop-skill "$src"
mkdir -p .agents/skills
for s in use-workshop onboard-workshop design-sdk; do
  cp -r "$src/.github/skills/$s" .agents/skills/
done
rm -rf "$src"
```

For Claude Code, use `.claude/skills` instead of `.agents/skills`. To update,
run the commands again.

### As a plugin

Codex CLI, GitHub Copilot CLI and Claude Code can install the skills as a
plugin from this repository's marketplace (`.claude-plugin/`). Plugins update
through the agent's own commands, not through `git pull`.

Codex CLI:

```sh
codex plugin marketplace add canonical/use-workshop-skill
codex plugin add use-workshop@canonical
```

To update, upgrade the marketplace and add the plugin again:

```sh
codex plugin marketplace upgrade canonical
codex plugin add use-workshop@canonical
```

GitHub Copilot CLI:

```sh
copilot plugin marketplace add canonical/use-workshop-skill
copilot plugin install use-workshop@canonical
```

To update:

```sh
copilot plugin update use-workshop@canonical
```

Claude Code:

```sh
claude plugin marketplace add canonical/use-workshop-skill
claude plugin install use-workshop@canonical
```

To update:

```sh
claude plugin marketplace update canonical
claude plugin update use-workshop@canonical
```

Restart the agent after you install or update a plugin.

## Design principles

**Router, not a playbook.** `SKILL.md` routes requests and does not teach
all of Workshop. It contains an `<intake>` list, a `<routing>` table that maps
requests to workflow files, and a `<reference_index>` that maps topics to
reference files. A typical turn loads `SKILL.md`, one workflow and one or two
references. This keeps context use low, and adding a new workflow does not
make existing turns load more.

**XML structure, little prose.** Files in `references/` and `workflows/` use
semantic tags such as `<overview>`, `<process>`, `<anti_patterns>`,
`<success_criteria>` and `<source_docs>`. Their content is tables, command
blocks and short instructions. The reader is a model, not a person.

**External docs are the source of truth.** A `<docs>` block in `SKILL.md` sets
the base URL of the Workshop docs. Each file's `<source_docs>` block lists doc
paths relative to that base. The docs site keeps the content current; the
skill sends the agent to the right page.

**Explicit scope.** An `<out_of_scope>` block in `SKILL.md` lists what the
skill does not do: publishing with `sdkcraft`, standalone `workshopctl`, and
interactive sketch sessions that need `$EDITOR`. For these cases the skill
points to the docs and tells the agent to stop. Related CLIs overlap, and
their error messages don't always show the boundary.

**Failure handling.** `troubleshoot.md`, `purge-and-recover.md`,
`anti-patterns.md` and `async-and-recovery.md` cover common errors and the
diagnostic flow. After each change, `SKILL.md` requires a verification loop
(`workshop changes`, then `workshop tasks <ID>`, then `workshop info`) and a
fixed report format.

**Templates, not memory.** The YAML files in `templates/` are the reference
for `workshop.yaml`. The agent copies from a template instead of writing YAML
from memory, because details such as `base:` syntax, plug and slot structure
and action format are easy to get subtly wrong.

**Checked YAML and doc paths.** Every YAML key and doc path in the skills
must come from an upstream schema or doc. Two offline CI checks enforce this:
`check-yaml-keys` lints fenced YAML snippets and `templates/*.yaml` against
key allowlists generated from the upstream JSON schemas, and
`check-source-docs` checks each cited doc path against
`tests/docs-manifest.txt`. To regenerate both from a Workshop checkout, run
`make -C .github/skills/use-workshop/tests update-docs-manifest WORKSHOP_REPO=<path>`.

**Eval-gated changes.** Each skill has a [promptfoo](https://promptfoo.dev)
regression suite in `tests/`, with baselines pinned in `BASELINE.md`. A change
that drops a pinned baseline does not merge.

## Testing

[`TESTING.md`](TESTING.md) describes the evaluation lanes, when each runs,
and what each costs. Shared harness code is in `.github/skills/_testlib/`.

Suite documentation:

- [`use-workshop`](.github/skills/use-workshop/tests/README.md): routing and
  agentic end-to-end suites.
- [`onboard-workshop`](.github/skills/onboard-workshop/tests/README.md): adds
  a reconstruction eval. The skill onboards real repositories with their
  workshop definitions hidden, and the results are scored against the
  originals.
- [`design-sdk`](.github/skills/design-sdk/tests/README.md): adds an SDK
  reconstruction harness. The skill designs an SDK from a short brief, and
  the result is scored against the reference SDK repository.
