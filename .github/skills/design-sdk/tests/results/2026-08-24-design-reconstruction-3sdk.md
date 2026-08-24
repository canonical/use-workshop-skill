<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# One-off Sonnet 5 SDK-reconstruction round — 2026-08-24

The calibration round that gated the design-sdk skill before its permanent
suite was pinned: given only a needs-phrased brief (no mechanisms — "the
server must be reachable from host tools", never "add a tunnel slot"), the
skill designs a publishable SDK from scratch in an empty sandbox, and the
output is scored against the corresponding reference SDK repo. Candidate
`claude-sonnet-5` on the subscription lane (claude CLI 2.1.241,
`apiKeySource=none`), local claude judge, `-j 1`. This (candidate, judge)
pair is deliberately different from the pinned gate pair and is **never
re-run as a baseline** — see `../BASELINE.md`.

## Result: 3/3, zero errors, zero calibration iterations

Fail-fast order — uv alone first, then ollama + claude-code:

| SDK | Ground truth (HEAD, `main`) | Scorecard | Rubric | Duration |
|-----|------------------------------|-----------|--------|----------|
| uv-sdk | `ee15e953` | pass, 0 failures | pass | ~6 min |
| ollama-sdk | `696c361b` | pass, 0 failures | pass | ~8 min |
| claude-code-sdk | `89865d8f` | pass, 0 failures | pass | ~8 min |

Every `expectations/<sdk>.json` held exactly as authored (each was
pre-calibrated so the reference repo passes its own scorecard; a negative
control — an empty directory — fails with 6 findings).

## What the skill got right, per SDK

- **uv** — interface layout *identical* to the reference: a mount `cache`
  plug and a mount `venv` slot at the reference paths; `rust` plugin part;
  `adopt-info` + `VERSION` wiring; `github-releases` datasource; all four
  CI workflows; spread tests. The generated SDK also added a `check-health`
  hook the reference lacks — scored as an addition, not a miss.
- **ollama** — the north-star service pattern in full: a `services` dump
  part installing `services/ollama.service` as a systemd user unit from
  `setup-project`, a tunnel slot at endpoint `11434`, a `gpu` plug, a mount
  plug for the models directory, and `check-health` polling with
  `set-health waiting`. Interface overlap with the reference: zero
  reference-only, zero generated-only.
- **claude-code** — checksum-verified download with fail-closed logic
  (a `sha256sum` mismatch blocks the install), binary on PATH for
  amd64+arm64 via `profile.d`, `npm` datasource, spread tests present.

## Notes

- Token spend: $0 API (subscription lane; the CLI's `total_cost_usd` is
  nominal). ~35k completion tokens per SDK.
- Raw promptfoo outputs are quarantined under `results/raw/` (gitignored);
  the committed record is the two slim summaries beside this file plus the
  BASELINE row.
- The ground-truth clones are local checkouts, not SHA-pinned specs; the
  SHAs above are the reproducibility record. If this round is ever re-run,
  migrate `DESIGN_SDK_ROOT` staging to `owner/repo@sha` first.
- Findings for the permanent suite: none forced a content fix — the round
  passed on the skill as authored. The service pattern, checksum
  discipline, and adopt-info/VERSION wiring assertions in
  `scenarios/generate.yaml` and `scenarios/honesty-bestpractice.yaml`
  match what the round actually produced.
