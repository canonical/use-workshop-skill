<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Eval suite for `use-workshop`

(See `TESTING.md` at the repo root for the lane doctrine — what runs
when and what each lane costs; shared harness code lives in
`../../_testlib/`. This file covers suite specifics.)

Two complementary [promptfoo](https://promptfoo.dev) suites that validate
the `use-workshop` skill:

- **Routing eval** (`scenarios/`, `promptfooconfig-subscription.yaml`) — does the model
  pick the right `workshop` / `sdk` command and avoid the documented
  anti-patterns when the skill is loaded? Single-turn against a bundled
  system prompt. No LXD or workshop install required to run.
- **Agentic E2E eval** (`agentic/`) — does an agent loaded with the
  skill actually finish a workshop task? Spawns `claude -p` in an
  isolated sandbox, drives a real workshop with LXD, asserts on the
  transcript and captured state. See `agentic/README.md` for details.

The pinned pass rates are in [`BASELINE.md`](BASELINE.md). Routing and
agentic runs are local (they need a CLI login), so regressions surface by
diffing a run's summary against its baseline row before merging.

## Prerequisites

- `promptfoo` 0.121.17 (or a compatible later version) on PATH.
- For the routing gate (`make eval-routing`) and the agentic suite: the
  `claude` CLI logged in on a subscription (`claude login`). No API key —
  the drivers unset `ANTHROPIC_API_KEY`/`ANTHROPIC_API_TOKEN` so nothing can
  bill (`EVAL_AUTH=api` + `ANTHROPIC_API_KEY` is the opt-in escape hatch).
- For the Copilot run (`make eval-routing-copilot`): the Copilot CLI logged
  in (`copilot login`) and the SDK installed once per checkout with
  `make eval-deps` (repo-root `package.json`). It draws on the account's
  monthly premium allowance; the preflight prints what is left.
- For the suspended GLM lane only (`make eval-routing-glm`):
  `OPENROUTER_API_KEY`, which covers both the GLM-5.2 candidate and the
  `gpt-5.5` judge pinned in `promptfooconfig.yaml`.
- For the agentic suite only: a working `workshop`, `lxc`, `claude`,
  and `node` on PATH; the user must be in the `lxd` group.

## Run

```sh
make help                       # list all targets
make check                      # all free offline static checks (CI entry point)
make check-source-docs          # assert every cited upstream doc path exists in docs-manifest.txt (offline)
make check-yaml-keys            # lint skill YAML snippets/templates against the upstream schema key allowlists (offline)
make update-docs-manifest       # regenerate docs-manifest.txt + allowed-keys.json (needs WORKSHOP_REPO; maintainer-only)
make eval-routing               # routing gate: Sonnet 4.6 via the claude CLI subscription lane ($0)
make eval-routing-copilot       # cross-vendor run: gpt-6.1-sol via the Copilot login (premium allowance)
make eval-routing-glm           # SUSPENDED former gate: GLM-5.2 via OpenRouter
make eval-agentic               # agentic E2E suite (slow, real LXD)
make eval-deps                  # install the Copilot SDK (once per checkout)
make eval-bundle                # regenerate skill-bundle.md from current sources
make eval-clean                 # drop generated bundle and raw outputs
```

Or invoke the underlying scripts directly:

```sh
bash scripts/run-routing.sh                   # full routing run (Sonnet, subscription lane)
bash scripts/run-routing.sh --copilot         # full routing run (Copilot lane)
bash scripts/run-routing.sh --filter-pattern bootstrap   # one scenario

bash scripts/run-agentic.sh                   # full agentic suite
bash scripts/run-agentic.sh --filter-pattern troubleshoot   # one task
```

Inspect results interactively:

```sh
promptfoo view
```

## Lanes and models

Both live routing lanes read `promptfooconfig-subscription.yaml`, which
declares two candidates; `run-routing.sh` filters to one per run. Both are
tool-less and single-turn, both receive the same text (the bundle plus the
harness note from `_testlib/routing-prompt.js`), and both are graded by the
local claude judge, so their rows differ by candidate model only.

- **Gate — `make eval-routing`.** Sonnet 4.6 through the `claude` CLI on
  the local subscription login, $0. The model family the skill is written
  for. One CLI spawn per case (~25–45 min).
- **Cross-vendor — `make eval-routing-copilot`.** `gpt-6.1-sol` through the
  Copilot SDK on the local Copilot login. The skills ship to Copilot users
  too; this run shows how a GPT model routes through them. The bundle
  *replaces* Copilot's own system prompt and every tool is disabled.
  Copilot silently remaps model ids it doesn't serve (`gpt-5.5` came back as
  `gpt-5.6-sol`), so the preflight checks the account lists the model and the
  provider errors on any served-model mismatch. Each case opens a fresh
  session, but `gpt-6.1-sol` serves the bundle prefix from cache across
  sessions: the first full run (2026-10-19) cost 105 premium requests and
  ~108 AI credits, where a `gpt-5.6-sol` smoke run got no cache hits and
  cost ~25 AI credits per case (see `BASELINE.md` for measured runs). The summary's
  `meta.copilot` block records the real spend; `cost_usd` stays 0.
- **Suspended — `make eval-routing-glm`.** The former gate: GLM-5.2 plus the
  `gpt-5.5` judge via OpenRouter (`promptfooconfig.yaml`, ~$1.41/run). The
  OpenRouter budget ran out in October 2026. The config, the diagnostic tiers
  and `eval-routing-sweep` stay in place so the lane can resume; its last pin
  is in `BASELINE.md`.

Rules of the road for the HTTP lane, when it runs again:

- **Declared-only.** A `--provider` id must be declared in
  `promptfooconfig.yaml`; an unknown id is a hard error (it would
  otherwise silently match zero providers and overwrite a baseline with
  an empty summary).
- **Determinism preserved.** Selection is by `--filter-providers`, which
  keeps the provider's `temperature: 0` config block. The gate row pins
  OpenRouter's *backend* routing (`allow_fallbacks: false`,
  `quantizations: [fp8]`). Diagnostic tiers are deliberately left unpinned.
- **No cost signal in the summary.** OpenRouter slugs aren't in promptfoo's
  cost table, so `cost_usd` reads 0; real spend is on the OpenRouter
  dashboard.

## What the suites test

### Routing (105 cases across 15 scenario files)

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

### Agentic E2E (9 tasks across 8 of 10 skill workflows)

Each task spawns `claude -p` in a fresh tmp sandbox where the
`use-workshop` skill is the only one installed, and asserts on the
flattened transcript (`[BASH] ...`, `[TOOL_RESULT] ...`,
`[FINAL TEXT] ...`) plus a state appendix the harness captures
independently after the agent stops (`workshop info`,
`workshop list --global`, `lxc list --all-projects`).

`agentic/README.md` documents the harness, permission posture, fixture
layout, and how to author new tasks. `provide-secret` (0.9.8) needs an
unlocked desktop keyring on the machine running the suite: its `setup_cmd`
stores a throwaway item and its `teardown_cmd` clears it, and the task fails
if that value ever appears in the transcript.

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
│   ├── update-docs-manifest.sh  # regenerate the two generated files (maintainer-only)
│   ├── run-routing.sh
│   └── run-agentic.sh
│   # check-source-docs.sh, check-yaml-keys.py, and _summarize.py live in the
│   # shared ../../_testlib/ (see its README)
├── scenarios/                   # routing test cases (one file per topic)
├── agentic/                     # agentic E2E suite (see its README)
└── results/
    ├── *.json                   # slim per-run summaries (committed)
    └── raw/*.json               # full promptfoo output (gitignored)
```

## Updating the suite

When you change SKILL.md or a workflow file, re-run the affected
suite(s) to confirm nothing regressed:

0. `make check` — instant, no API. The free offline gate CI runs: the
   cited-doc-path guard (`check-source-docs`, every backticked
   `<area>/….md|.json` path must be in `docs-manifest.txt` — since the
   manifest carries only the 4 combined CLI pages, this also subsumes the
   retired `check-doc-paths`), bundle regeneration, scenario/template
   YAML parse, the YAML key lint (`check-yaml-keys`, every snippet's
   top-level keys must be in the upstream schema allowlists), and
   shellcheck. Run this before any eval.
1. `make eval-routing` — the canonical regression gate (Sonnet, $0). If
   the pass rate drops below the BASELINE.md row for the
   `claude-sonnet-4-6` + local-judge pair, investigate before merging.
2. (Release rounds and substantial content changes) `make
   eval-routing-copilot` — the cross-vendor run. It spends Copilot premium
   allowance (one premium request per case, ~108 AI credits per full run), so iterate on single cases
   with `--filter-pattern` and run it whole once the gate is green.
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
