<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Eval baselines for `design-sdk`

Same contract as the sibling suites: PRs that change skill content must not
merge below a pinned cell without investigation. Baselines are per
**(candidate, judge) pair** — never compare rates across pairs; a judge
change means seeding a new row, not editing an old one.

## Routing eval (`make eval-routing`)

**60 cases across 8 scenario files** (incl. 9 cross-skill selection cases
against the 3-way selection context). This suite's gate is the
**subscription lane** from day one: Sonnet via the local claude CLI login as
candidate, the local claude judge for llm-rubric grading — $0, no API keys,
the same pair as the sibling gates.

| Candidate | Judge | Pass rate | Date | Notes |
|-----------|-------|-----------|------|-------|
| `claude-sonnet-4-6` (claude CLI, subscription) | local claude judge | _pending first full run_ | — | seeds the pinned gate pair |

## Agentic eval (`make eval-agentic`)

| Candidate | Judge | Pass rate | Date | Notes |
|-----------|-------|-----------|------|-------|
| `claude-sonnet-4-6` (claude CLI, subscription) | local claude judge | _pending first full run_ | — | 3 tasks; run order = fail-fast order (onboard-sdk-repo → design-pack-mini → try-verify) |

## One-off Sonnet 5 SDK-reconstruction round (`make eval-reconstruction`)

Candidate `claude-sonnet-5` (claude CLI, subscription), local claude judge —
a **different pair from the pinned gate, deliberately**: a one-off
calibration round against local reference-SDK clones (uv-sdk, ollama-sdk,
claude-code-sdk), recorded here and in `results/`, **never re-run as a
baseline and not comparable with the rows above**. See
`reconstruction/README.md`.

| Candidate | Judge | Result | Date | Notes |
|-----------|-------|--------|------|-------|
| `claude-sonnet-5` (claude CLI, subscription) | local claude judge | _pending the one-off round_ | — | ground-truth clone HEAD SHAs recorded in the run summary |
