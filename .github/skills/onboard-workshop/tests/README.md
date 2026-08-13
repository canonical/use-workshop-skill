<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Eval suite for `onboard-workshop`

Four layers, mirroring the sibling suite's philosophy (free static gates in
CI; paid evals manual with pinned baselines):

1. **Static checks** (`make check`, free, CI-gated): source-doc paths against
   the SHARED `../use-workshop/tests/docs-manifest.txt`; YAML snippet keys
   against the SHARED `allowed-keys.json` (templates globbed recursively;
   `sdk.yaml` templates classified under the sdk allowlist); shellcheck;
   bundle regen; sdk-catalog markers/stamp; template hook executable bits.
   One `make update-docs-manifest` run in the sibling's tests dir refreshes
   both skills' ground truth.
2. **Routing eval** (`make eval-routing`, paid): 53 promptfoo cases. The
   bundle appends the borrowed sibling references (see
   `scripts/bundle-extras.txt`) so the eval simulates required reading being
   satisfied. `scenarios/skill-selection.yaml` overrides `vars.skill` with
   `skill-selection-context.md` (both skills' frontmatter only) — the
   automated guard on the two skills' description boundary.
3. **Reconstruction eval** (`make eval-reconstruction[-full]`, paid,
   local-only): the guinea-pig harness — see `reconstruction/README.md`.
4. **Agentic E2E** (`make eval-agentic`, paid, real LXD): full onboarding of
   a fixture repo + the honesty gate (an out-of-envelope repo must produce a
   verdict and NO files).

Baselines: `BASELINE.md`. Raw outputs land in `results/raw/` (gitignored);
commit only slim summaries under `results/` (routing runs do this via
`scripts/run-routing.sh`, unchanged from the sibling).
