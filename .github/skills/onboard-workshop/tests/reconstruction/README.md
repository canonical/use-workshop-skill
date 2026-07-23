<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Guinea-pig reconstruction eval

Answers the question the routing eval can't: **given a real repo with its
workshop definition hidden, does the skill re-derive something functionally
equivalent to what the maintainers actually wrote?**

## Guinea pigs

Two real repos whose definitions we treat as ground truth:

- `workshop-akcano` — Go CLI; ground truth wraps `docs/Makefile`,
  golangci-lint, shellcheck, and `go test` into actions; sphinx preview via a
  tunnel pair on 8000; in-project `tools` SDK with hooks.
- `vscode-workshop` — TypeScript VS Code extension; ground truth pins
  node@24, ships a `test-deps` in-project SDK (X libraries + xvfb via
  `setup-base`, desktop plug), actions wrap npm/vsce with an `xvfb-run`
  headless variant.

Checkout locations come from `GUINEA_REPOS` (space-separated paths; default
`~/Documents/workshop-akcano ~/Documents/vscode-workshop`).

## How a run works

`make eval-reconstruction` (offline tier) / `make eval-reconstruction-full`:

1. `run-reconstruction.sh` stages each repo into `.work/<name>/repo` via
   `git archive` (clean tree), parks `.workshop/` + root definitions +
   workshop-driving CI workflows at `.work/<name>/ground-truth/`, and redacts
   workshop-CLI traces from README/.gitignore/.vscode metadata.
2. Both skills are installed into the sandbox's `.claude/skills/`.
3. `provider-onboard-cli.js` runs `claude -p` with the onboarding task
   (offline tier: generate-and-stop, no LXD; full tier: launch + action
   proof), then appends the generated files, the ground truth, and the
   `compare-definition.py` scorecard to the output.
4. Asserts gate on `"overall_pass": true` (deterministic thresholds from
   `expectations/<repo>.json`) plus a functional-equivalence + honesty
   llm-rubric. Record outcomes in `../BASELINE.md`.

## Honest limitations

- **Scrubbing is approximate.** Both repos reference Workshop in prose and
  metadata; the redaction removes CLI usage traces from README/.vscode/
  .gitignore and parks workshop-driving CI, but an agent can still infer
  "this repo used Workshop". What it cannot see is the actual definition —
  which is what the metrics compare against.
- **Expectations are curated.** `expectations/<repo>.json` encodes what a
  functionally equivalent reconstruction must contain (base, pinned SDKs,
  tunnel pairs, action token groups). Update them when the guinea pigs'
  ground truth changes.
- **Offline tier doesn't prove actions run** — that's what the full tier and
  the agentic suite are for.

## Cost

Offline: ~$1–2 per repo (Sonnet 4.6 + judge). Full: 10–30 min per repo,
real LXD, Store SDK downloads, ~$2–5 per repo. Local-only; no CI job.
