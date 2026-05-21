<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Eval baseline for `use-workshop`

This file pins the **expected** pass rates per (model × eval mode). PRs
that drop a cell below its locked rate fail CI (for routing) or surface
in the agentic summary diff (manual). Update this file when you've
investigated and confirmed the change is intentional and not a
regression.

## Routing eval

55 cases across 12 scenario files (49 — pre-PR — minus 4 sketch-only
cases dropped from `customize-actions-sketches.yaml` plus 5 new
in-project-SDK authoring cases plus 1 additional sketch-out-of-scope
case plus 1 author-routing case in the renamed `customize-actions.yaml`).
Every case is single-turn against the bundled skill (`SKILL.md` +
9 references + 10 workflows concatenated). Run with: `make
eval-routing` (Sonnet 4.6) or `make eval-routing-all-models`.

| Model              | Pass rate | Locked-in failures |
|--------------------|-----------|--------------------|
| `claude-sonnet-4-6` | **TBD** (was 53/53 (100%) on the prior 53-case suite) | TBD — fill from green run |
| `claude-haiku-4-5`  | **TBD** (was 51/53 (96.23%) — 2 documented model-side variance) | TBD — fill from green run |
| `claude-opus-4-7`   | **TBD** (was 53/53 (100%)) | TBD — fill from green run |

> The numbers above are intentionally placeholders. After re-running
> `make eval-routing-all-models` against the updated bundle, fill in
> the per-model pass rates from the run, classify any new failures as
> skill gap vs. model-side variance, and replace these TBDs.

### Locked-in failure notes (Haiku 4.5)

These are documented as **acceptable model-side variance**, not skill
gaps. The skill content is clear; Haiku's verbosity-and-listing tendency
trips strict rubrics in two places. If a future Haiku release closes
the gap, update this table.

1. **`User wants to attach a remote IDE over SSH (vendor-agnostic)`**
   The vendor-neutral rubric requires not naming specific commercial
   IDE products when the user did not ask. Haiku 4.5 tends to enumerate
   ("you could use VS Code Remote SSH, JetBrains Gateway, Vim/Neovim
   over SSH, ...") and offer per-product config hints even on
   vendor-agnostic prompts. Sonnet 4.6 and Opus 4.7 stay generic.

2. **`User omits workshop name in a multi-workshop project`**
   The rubric requires conveying that the workshop name is required on
   *every* command in a multi-workshop project. Haiku 4.5 sometimes
   demonstrates with one or two named-command examples but elsewhere
   in the same response shows commands without the name; Sonnet and
   Opus hold the invariant consistently across the response.

## Agentic E2E eval

8 tasks across 8 of 10 skill workflows (the `customize-actions-sketches`
task is renamed to `customize-actions`; the new `author-in-project-sdk`
task drives `.workshop/<name>/` authoring end-to-end). Each task spawns
`claude -p` in an isolated sandbox, drives a real workshop with LXD,
and asserts on the transcript + captured state. Run with:
`make eval-agentic`.

| Model              | Pass rate | Notes |
|--------------------|-----------|-------|
| `claude-sonnet-4-6` | **TBD** (was 7/7 (100%) on the prior 7-task suite) | re-baseline after rerun; expect ~16–18 min wall, ~$4 with the new task |

### Per-task baseline (Sonnet 4.6)

| Task                              | Pass | Wall  | Cost   |
|-----------------------------------|------|-------|--------|
| bootstrap-project                 | ✓    | 103 s | $0.28  |
| daily-ops                         | ✓    |  95 s | $0.09  |
| customize-actions                 | ✓    |  37 s | $0.08  |
| author-in-project-sdk             | ✓    |  71 s | $0.09  |
| manage-interfaces (HTTP tunnel)   | ✓    | 645 s | $1.42  |
| ide-integration (sshd + tunnel)   | ✓    | 573 s | $1.35  |
| multi-workshop-projects           | ✓    |  71 s | $0.12  |
| troubleshoot (broken-SDK recovery)| ✓    |  76 s | $0.15  |

> `author-in-project-sdk` numbers are TBD pending the first green
> agentic rerun against the updated skill. The renamed
> `customize-actions` task is unchanged from `customize-actions-sketches`
> in body — its baseline numbers carry over.

Tunnel-setup tasks (`manage-interfaces` and `ide-integration`) dominate
runtime and cost — the agent does extra refresh + verification work
around plug/slot wiring. The other five tasks complete in 1–2 minutes
each thanks to LXD's image cache being warm after the first launch.

Coverage gaps (workflows not yet wired into the agentic suite, only
the routing eval covers them):

- `parallel-environments` — needs git-worktree fixture setup; deferred
  to a follow-up.
- `purge-and-recover` — needs a pre-orphaned LXD container in the
  fixture, which is awkward to express as a simple file-copy fixture;
  deferred to a follow-up.

## Updating this file

When a real run materially changes a cell:

1. Investigate the changed cases. Use `promptfoo view` (routing) or read
   the latest `results/raw/<date>-*.full.json` (agentic) to see the
   model output and assertion details.
2. If a regression: fix the skill or the test, don't update this file
   without good reason.
3. If an intentional improvement (skill is clearer, more models pass
   more cases, etc.): update the locked-in pass rates here in the same
   PR that locks in the improvement.
4. If a model upgrade improves a cell: update and note the model
   version in the notes section if relevant.

Each routing run writes `results/<date>-routing-<model>.json` with the
exact per-case pass/fail breakdown — that's the source of truth, this
file is the human-readable summary.
