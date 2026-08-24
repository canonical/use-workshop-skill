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
| `claude-sonnet-5` (claude CLI, subscription) | local claude judge | **3/3 (100%)** | 2026-08-24 | fail-fast order uv → ollama+claude-code, 0 errors, 0 calibration iterations (every expectations file held as authored); ~6 min/SDK at `-j 1`, `apiKeySource=none`, claude CLI 2.1.241. uv: mount plug+slot identical to the reference, rust plugin, adopt-info+VERSION, github-releases datasource. ollama: the full service pattern — `services/ollama.service` + tunnel slot `11434` + gpu plug + mount models plug + `check-health` polling; zero reference-only or generated-only interfaces. claude-code: fail-closed checksum verification, npm datasource, multi-arch platforms, spread tests. Rubric pass-at-4 on all three. Ground truth: uv-sdk `ee15e953`, ollama-sdk `696c361b`, claude-code-sdk `89865d8f` (local clones, `main`). Committed summaries: `results/2026-08-24-design-reconstruction-{uv,ollama-claude-code}.json`; write-up: `results/2026-08-24-design-reconstruction-3sdk.md` |
