<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Agentic E2E suite for `use-workshop`

A real, LXD-backed end-to-end eval. Each task spawns `claude -p` in an
isolated sandbox where the `use-workshop` skill is the only one installed,
drives a real workshop with the real `workshop` CLI, and asserts on both
the agent's transcript and the captured workshop state after the run.

This complements the routing eval at `../scenarios/`. The routing eval
asks "does the model say the right thing?"; this eval asks "does the agent
actually finish the job?".

## What it costs

- **Wall time:** 3-15 minutes per task (workshop launches, snap installs,
  agent reasoning loops). The full suite is dozens of minutes.
- **API cost:** ~$0.50-$1.50 per task on Sonnet 4.6 with caching, more on
  Opus, less on Haiku. The provider sets a `--max-budget-usd 3` ceiling
  per task as a safety rail.
- **Side effects:** every task creates one or more LXD containers under
  `workshop.<user>` and tears them down at the end. Failure to tear down
  leaks containers; the harness reports this in the result metadata.

## Permission posture

- `--permission-mode acceptEdits` so file edits inside the sandbox don't
  prompt.
- `--allowedTools` whitelist (see `provider-claude-cli.js`) covers the
  specific patterns each workflow needs (`workshop *`, `sdk *`,
  `lxc list*`, `lxc info*`, plus standard read/edit). Anything outside
  the whitelist halts the run. This is intentional — the eval stays
  unattended without granting blanket permission bypass. A task that
  legitimately needs more can extend via `vars.extra_allowed_tools`.

## Layout

```
agentic/
├── promptfooconfig.yaml        # entry point — references provider + tasks
├── provider-claude-cli.js      # custom JS provider that shells `claude -p`
├── tasks/                      # one file per skill workflow
│   └── bootstrap-project.yaml
└── README.md                   # this file
```

The `provider-claude-cli.js` does the work:

1. Creates a fresh tmp sandbox dir.
2. Copies the task's fixture (if any) into the sandbox.
3. Copies `.claude/skills/use-workshop/` into the sandbox (so `claude --bare`
   auto-loads the skill from there and ONLY that skill).
4. Spawns `claude -p` with `--bare --output-format stream-json --verbose`,
   the per-task prompt, and the permission posture above.
5. Captures the streaming transcript; flattens it to a readable form
   with `[ASSISTANT TEXT]`, `[BASH] ...`, `[TOOL_RESULT] ...`,
   `[RESULT ...]`, `[FINAL TEXT]` markers so assertions can look for
   specific commands or text.
6. Captures post-state independently of the agent: `workshop list --global`,
   `workshop info <name>`, `workshop changes`, `lxc list --all-projects`.
7. Tears down: `workshop remove --force <name>` for every name in
   `cleanup_workshops`, then `rm -rf` the sandbox.
8. Returns `{ output: "<transcript>\n--- WORKSHOP STATE AFTER ---\n..." ,
   metadata: {...} }` so promptfoo's text-based asserts (`contains`,
   `llm-rubric`) work against the transcript and `javascript` asserts
   can drill into `metadata.workshop_state`.

## Running

```sh
ANTHROPIC_API_KEY=... bash ../scripts/run-agentic.sh
```

Filter to one task:

```sh
bash ../scripts/run-agentic.sh --filter-pattern bootstrap
```

Override the model:

```sh
bash ../scripts/run-agentic.sh --model claude-haiku-4-5
```

Results land in `../results/`:

- `<date>-agentic-<model>.json` — slim summary, committed
- `raw/<date>-agentic-<model>.full.json` — full promptfoo output, gitignored

## Authoring a new task

A task YAML defines one test case with these vars:

| Var                   | Required? | Purpose |
|-----------------------|-----------|---------|
| `workshop_name`       | yes       | The workshop name the agent should create / use |
| `task`                | yes       | The natural-language prompt sent to the agent |
| `cleanup_workshops`   | no        | List of workshop names to forcibly remove on teardown (defaults to `[workshop_name]`) |
| `fixture`             | no        | Path relative to repo root, contents copied into the sandbox |
| `timeout_ms`          | no        | Per-task timeout (default 900000 = 15 min) |
| `extra_allowed_tools` | no        | Additional `--allowedTools` patterns for this task |
| `keep_sandbox`        | no        | When truthy, the sandbox dir is kept after the run for debugging |

Assertion patterns to follow:

- **`contains: "[BASH] workshop <verb>"`** — assert the agent ran a specific
  command. Match the flattened-transcript form.
- **`contains-any: ["[BASH] sdk find", "[BASH] sdk info"]`** — assert one of
  several plausible commands ran.
- **`javascript: ...`** — drill into `output.metadata.workshop_state` for
  state checks (e.g., final `Status: Ready`).
- **`llm-rubric`** — judge the agent's overall reasoning and adherence to
  the skill's recommended flow. Use this for the parts of "good behavior"
  that don't reduce to a single command pattern.

## Known coverage gaps

- `parallel-environments` and `purge-and-recover` are not yet wired in
  here. Both involve setup steps (git worktrees, pre-orphaned containers)
  that are awkward to express as a single fixture; they'll be added in a
  follow-up. The routing eval at `../scenarios/parallel-envs.yaml` and
  `../scenarios/purge.yaml` covers their decision logic.

## Companion: `test-docs`

The user-level `test-docs` skill is the right tool for validating the
*executability* of doc samples (the `templates/*.yaml`, command lines
quoted in workflow files). This agentic suite is about end-to-end
*agent behavior* against a live workshop; it isn't a substitute for
doc-sample testing.
