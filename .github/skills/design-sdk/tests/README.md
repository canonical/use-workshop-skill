<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Eval suite for `design-sdk`

Everything below Lane 0 here runs on the **$0 subscription lane** (local
claude CLI login + local judge, no API keys) — this suite has no HTTP lane
at all; see `TESTING.md` at the repo root for the three-lane doctrine.

1. **Static checks** (`make check`, free, CI-gated): source-doc paths
   against the SHARED `../use-workshop/tests/docs-manifest.txt`; YAML
   snippet/template keys against the SHARED `allowed-keys.json` with
   `--classify-sdkcraft-template` (sdkcraft.yaml templates and
   path-commented fenced blocks under the sdkcraft key list; GitHub Actions
   and spread files parse-only); shellcheck; bundle regen; template hook
   executable bits — a **hard** failure here, unlike the onboard suite's
   advisory check, because sdkcraft enforces `+x` at pack time.
2. **Routing eval** (`make eval-routing`, $0): 64 promptfoo cases. The
   bundle appends the borrowed sibling references (see
   `scripts/bundle-extras.txt`). `scenarios/skill-selection.yaml` overrides
   `vars.skill` with `skill-selection-context.md` (every installed skill's
   frontmatter) — the automated guard on the 3-way description boundary.
3. **Agentic E2E** (`make eval-agentic`, $0, heaviest task uses real LXD):
   see `agentic/`.
4. **SDK reconstruction** (`make eval-reconstruction`, $0, local-only, NOT
   in CI): the one-off Sonnet 5 calibration round recreating reference SDKs
   from task briefs — see `reconstruction/README.md`. Kept re-runnable, but
   its result is recorded as a one-off, not a baseline.

Baselines: `BASELINE.md`. Raw outputs land in `results/raw/` (gitignored);
commit only slim summaries under `results/` (routing runs do this via
`scripts/run-routing.sh`, unchanged from the siblings).
