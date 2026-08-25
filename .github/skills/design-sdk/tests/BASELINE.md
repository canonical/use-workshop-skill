<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Eval baselines for `design-sdk`

Same contract as the sibling suites: PRs that change skill content must not
merge below a pinned cell without investigation. Baselines are per
**(candidate, judge) pair** — never compare rates across pairs; a judge
change means seeding a new row, not editing an old one.

## Routing eval (`make eval-routing`)

**64 cases across 8 scenario files** (incl. 9 cross-skill selection cases
against the 3-way selection context). This suite's gate is the
**subscription lane** from day one: Sonnet via the local claude CLI login as
candidate, the local claude judge for llm-rubric grading — $0, no API keys,
the same pair as the sibling gates.

| Candidate | Judge | Pass rate | Date | Notes |
|-----------|-------|-----------|------|-------|
| `claude-sonnet-4-6` (claude CLI, subscription) | **local claude judge** | **60/60 (100%)** | 2026-08-24 | **the pinned gate pair**, seeded over four full runs while the suite and two fencing rules converged. First run 52/60: two content gaps fixed (the closed 25-plugin list replacing a vague "full craft-parts set" line; direct file requests with bounded knobs proceed with recommended defaults), interview preamble now states brief-pinned constructs before questions, one case gained the daemon facts it claimed but omitted, rest were rubric artifacts. The sibling-verb leak took three escalations to fence (explicit sibling-verb list in the intake exception; the routing hand-off row now pre-empts "the cheatsheet is loaded"; rubric calibrated to the sibling one-or-two-pointer standard) and its mirror-image emerged — the fencing over-rotated onto the skill's OWN iterate territory — fixed with the try-SDK carve-out in the same intake rule. Final full run 59/60, 0 errors, ~18 min; the single miss was this suite's rubric conflating the waiting retry interval (1 s, ×10) with the 5 s per-attempt reporting budget — the candidate was right, the rubric fixed, case re-run 2/2 (`results/raw/` 151950 partial). Committed summary: `results/2026-08-24-routing-claude-cli-claude-sonnet-4-6.json` |
| `claude-sonnet-4-6` (claude CLI, subscription) | **local claude judge** | **64/64 (100%)** | 2026-08-25 | **re-pinned** on the Python-doctrine + forward-port round (canonical/template-sdk #6/#3/#7/#9 folded in; 60 → 64 cases). First full run 62/64, 0 errors, ~20 min: one content gap (the "evolving mechanism" caveat lived only in the hermes catalog entry, so the honesty case saw the uv shape asserted as settled convention — the caveat now rides with essential principle 1, anti-pattern #15, the parts-or-hooks bullet and design Step 5) and one rubric artifact (the forward-port case demanded the literal "sdkcraft-actions" and a HEAD~1 discussion the candidate had no reason to volunteer — loosened to the substance). Both re-run green in isolation (`results/raw/` 114739 + 114936 partials); the driver had quarantined the first run's summary as errored. Full suite re-run 64/64, 0 errors, 20m42s. Committed summary: `results/2026-08-25-routing-claude-cli-claude-sonnet-4-6.json` |

## Agentic eval (`make eval-agentic`)

| Candidate | Judge | Pass rate | Date | Notes |
|-----------|-------|-----------|------|-------|
| `claude-sonnet-4-6` (claude CLI, subscription) | **local claude judge** | **3/3 tasks (100%)** | 2026-08-24 | first full run 9/11 graded cases, 0 errors, ~20 min on real LXD; both misses were assertion-authoring artifacts re-run green 1/1 each (`results/raw/` 150842 + 151324 partials): a transcript-wide `not-contains stage-packages` firing on the skill bundle's own prohibition text (mention vs prescription — rescoped to the captured-files dump, colon-matched), and `contains "[BASH] sdkcraft try"` missing the loop's canonical compound form `sdkcraft clean && sdkcraft try` (now a regex on the line, not a prefix). try-verify proved the full loop: mount-prime defect diagnosed from the linter error, `override-prime` fix, pack → try → `design-try` Ready → in-workshop verification. Committed summary: `results/2026-08-24-agentic-claude-sonnet-4-6.json` |

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
