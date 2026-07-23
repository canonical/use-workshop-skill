<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Eval suite for `use-workshop`

Two complementary [promptfoo](https://promptfoo.dev) suites that validate
the `use-workshop` skill:

- **Routing eval** (`scenarios/`, `promptfooconfig.yaml`) — does the model
  pick the right `workshop` / `sdk` command and avoid the documented
  anti-patterns when the skill is loaded? Single-turn against a bundled
  system prompt. No LXD or workshop install required to run.
- **Agentic E2E eval** (`agentic/`) — does an agent loaded with the
  skill actually finish a workshop task? Spawns `claude -p` in an
  isolated sandbox, drives a real workshop with LXD, asserts on the
  transcript and captured state. See `agentic/README.md` for details.

The pinned pass rates are in [`BASELINE.md`](BASELINE.md). PRs that drop a
cell below baseline fail CI for routing; agentic regressions surface in
the manual run summary diff.

## Prerequisites

- `promptfoo` 0.121.9 (or a compatible later version) on PATH.
- `ANTHROPIC_API_KEY` exported (`scripts/run-routing.sh` and
  `scripts/run-agentic.sh` also accept the same value as
  `ANTHROPIC_API_TOKEN` and bridge it).
- `OPENROUTER_API_KEY` exported — only for the OpenRouter routing runs
  (`make eval-routing-openrouter[-all]`). promptfoo's OpenRouter provider
  reads it natively; no bridging.
- `OPENAI_API_KEY` exported — for the `llm-rubric` grading model, which is
  pinned in `promptfooconfig.yaml` (`defaultTest.options.provider`) so
  rubric verdicts are reproducible across machines. Every routing run needs
  it, regardless of which candidate provider is being evaluated. Note the
  judge takes one call per rubric assertion per case — on large sweeps it
  is the first thing to hit rate limits.
- For the agentic suite only: a working `workshop`, `lxc`, `claude`,
  and `node` on PATH; the user must be in the `lxd` group.

## Run

```sh
make help                       # list all targets
make check                      # all free offline static checks (CI entry point)
make check-doc-paths            # assert reference/cli/ paths map to the 4 combined pages (fast, no API)
make check-source-docs          # assert every cited upstream doc path exists in docs-manifest.txt (offline)
make check-yaml-keys            # lint skill YAML snippets/templates against the upstream schema key allowlists (offline)
make update-docs-manifest       # regenerate docs-manifest.txt + allowed-keys.json (needs WORKSHOP_REPO; maintainer-only)
make eval-routing               # routing eval, Sonnet 4.6 only
make eval-routing-all-models    # routing eval against Sonnet 4.6, Haiku 4.5, Opus 4.7
make eval-routing-openrouter        # routing eval, GLM-5.1 via OpenRouter (needs OPENROUTER_API_KEY)
make eval-routing-openrouter-all    # routing eval, GLM-4.7-flash + GLM-5.1 + GLM-5.2 via OpenRouter
make eval-agentic               # agentic E2E suite, Sonnet 4.6 only (slow, real LXD)
make eval-bundle                # regenerate skill-bundle.md from current sources
make eval-clean                 # drop generated bundle and raw outputs
```

Or invoke the underlying scripts directly:

```sh
bash scripts/run-routing.sh                   # full routing run (Sonnet 4.6)
bash scripts/run-routing.sh --filter-pattern bootstrap   # one scenario
bash scripts/run-routing.sh --model claude-haiku-4-5     # one Anthropic tier
bash scripts/run-routing.sh --provider openrouter:z-ai/glm-4.5   # any declared provider

bash scripts/run-agentic.sh                   # full agentic suite
bash scripts/run-agentic.sh --filter-pattern troubleshoot   # one task
```

Inspect results interactively:

```sh
promptfoo view
```

## Testing other models via OpenRouter

The routing eval can run against non-Anthropic models through OpenRouter
(the agentic suite cannot — it drives the `claude` CLI directly). A
curated set of open-weight GLM tiers is declared in
`promptfooconfig.yaml` and selected with `--provider`:

```sh
export OPENROUTER_API_KEY=...
make eval-routing-openrouter            # GLM-5.1 (the default tier)
make eval-routing-openrouter-all        # GLM-4.7-flash + GLM-5.1 + GLM-5.2
bash scripts/run-routing.sh --provider openrouter:z-ai/glm-5.1
```

Rules of the road:

- **Declared-only.** A `--provider` id must be declared in
  `promptfooconfig.yaml`; an unknown id is a hard error (it would
  otherwise silently match zero providers and overwrite a baseline with
  an empty summary). To try a new model, add a 3-line provider block with
  `config: {max_tokens: 1024, temperature: 0.0}` — exactly like adding an
  Anthropic tier. Confirm the slug against <https://openrouter.ai/models>.
- **Excluded from the default sweep.** OpenRouter providers never run in
  `make eval-routing` (pinned to Sonnet 4.6) or `eval-routing-all-models`
  (Anthropic tiers only). `--model` and `--provider` are mutually
  exclusive.
- **Determinism preserved.** Selection is by `--filter-providers`, which
  keeps the provider's `temperature: 0` config block.
- **Cost caveats.** OpenRouter does not get Anthropic prompt-cache
  discounts, so each 60-case run resends the full ~30K-token bundle
  uncached — pricier per run than the cached Anthropic baseline. And the
  committed summary's `cost_usd` reads **0** (OpenRouter slugs aren't in
  promptfoo's cost table) — check the OpenRouter dashboard for real spend.
- **Not a CI gate.** These runs are cross-model diagnostics; see
  `BASELINE.md` for why they are not pinned.

## What the suites test

### Routing (76 cases across 12 scenario files)

Each test case puts a real user prompt in front of the skill (loaded as
the system message) and asserts on the model's response with three
kinds of checks:

- **`contains` / `contains-any` / `contains-all`** for required command
  tokens (e.g., `workshop launch`, `--wait-on-error`).
- **`not-contains`** for forbidden patterns (e.g., suggesting
  `sudo snap remove workshop --purge` as a first response to a
  recoverable failure).
- **`llm-rubric`** for judgment calls that resist exact-match assertions
  (e.g., "the response defers SDK authoring to the docs and does not
  improvise `sdkcraft` commands").

### Agentic E2E (8 tasks across 8 of 10 skill workflows)

Each task spawns `claude -p` in a fresh tmp sandbox where the
`use-workshop` skill is the only one installed, and asserts on the
flattened transcript (`[BASH] ...`, `[TOOL_RESULT] ...`,
`[FINAL TEXT] ...`) plus a state appendix the harness captures
independently after the agent stops (`workshop info`,
`workshop list --global`, `lxc list --all-projects`).

`agentic/README.md` documents the harness, permission posture, fixture
layout, and how to author new tasks.

## Files

```
tests/
├── promptfooconfig.yaml         # routing eval config
├── prompt.json                  # routing chat template
├── skill-bundle.md              # generated by eval-bundle (gitignored)
├── BASELINE.md                  # pinned pass rates
├── docs-manifest.txt            # valid upstream doc paths (generated; committed)
├── allowed-keys.json            # upstream schema key allowlists (generated; committed)
├── Makefile                     # convenience targets
├── scripts/
│   ├── regenerate-bundle.sh
│   ├── check-doc-paths.sh       # CLI 4-page guard
│   ├── check-source-docs.sh     # cited-doc-path guard (vs docs-manifest.txt)
│   ├── check-yaml-keys.py       # YAML key lint (vs allowed-keys.json)
│   ├── update-docs-manifest.sh  # regenerate the two generated files (maintainer-only)
│   ├── run-routing.sh
│   ├── run-agentic.sh
│   └── _summarize.py            # raw -> slim summary post-processor
├── scenarios/                   # routing test cases (12 files)
├── agentic/                     # agentic E2E suite (see its README)
├── fixtures/
│   └── prompts.txt              # flat corpus of routing prompts, for review
└── results/
    ├── *.json                   # slim per-run summaries (committed)
    └── raw/*.json               # full promptfoo output (gitignored)
```

## Updating the suite

When you change SKILL.md or a workflow file, re-run the affected
suite(s) to confirm nothing regressed:

0. `make check` — instant, no API. The free offline gate CI runs: the
   `reference/cli/` four-page guard (`check-doc-paths`), the cited-doc-path
   guard (`check-source-docs`, every backticked `<area>/….md|.json` path
   must be in `docs-manifest.txt`), bundle regeneration, scenario/template
   YAML parse, the YAML key lint (`check-yaml-keys`, every snippet's
   top-level keys must be in the upstream schema allowlists), and
   shellcheck. Run this before any paid eval.
1. `make eval-routing` — fast, deterministic; the canonical regression
   gate. If pass rate drops below the BASELINE.md value for Sonnet
   4.6, investigate before merging.
2. (Optional) `make eval-routing-all-models` — Haiku and Opus give
   useful diagnostic signal: a Haiku regression where Sonnet still
   passes usually means the skill text grew ambiguous; an Opus
   regression usually means a fact is missing or wrong.
3. (Optional, slow) `make eval-agentic` — the end-to-end check that
   matters for behaviour, not text. Run before shipping changes that
   touch workflow procedures.

If a real-world prompt exposes a gap, add a new test case to the
relevant scenario file (or a new agentic task), re-run, and update
BASELINE.md if the pinned rate moves.

## Regenerating the docs manifest and key allowlists

`docs-manifest.txt` and `allowed-keys.json` are generated from the
upstream Workshop repo and committed so the `check-source-docs` and
`check-yaml-keys` guards run fully offline. Regenerate them whenever the
skill moves to a new Workshop version (or upstream renames doc pages or
changes a definition schema):

```sh
WORKSHOP_REPO=~/Documents/workshop-akcano make update-docs-manifest
```

`WORKSHOP_REPO` must point at a checkout whose `docs/` tree is the doc
source for the version the skill now targets. The script derives the
manifest from `docs/**/*.rst|*.md` (rendered `.md` paths; the four
combined CLI pages only; include-fragment dirs excluded) and the three
key allowlists from `docs/reference/definition-files/schema*.json`. It
stamps both files with the source commit — review the diff and commit it
alongside the content change that motivated it.

## Companion validation

For doc samples (e.g., the YAML stubs under `../templates/` or the
command lines quoted in `../workflows/*.md`), the user-level
`test-docs` skill is the right companion: it runs the procedures
end-to-end as a human reader would. This eval suite covers the
*routing* and *agent-behaviour* contracts; `test-docs` covers the
*executability* contract for the skill's own doc samples.
