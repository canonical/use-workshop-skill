<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# Guinea-pig reconstruction eval

Answers the question the routing eval can't: **given a real repo with its
workshop definition hidden, does the skill re-derive something functionally
equivalent to what the maintainers actually wrote?**

## Guinea pigs

`GUINEA_REPOS` is a space-separated list; each entry is either a **local
checkout path** or a **pinned remote** `owner/repo@<sha>` (a full
`https://github.com/owner/repo@<sha>` URL also works). Remote repos are cloned
once into `.cache/` and reused across runs. Default:
`~/Documents/workshop-akcano ~/Documents/vscode-workshop`.

Local pair (fast, maintainer machines):

- `workshop-akcano` — Go CLI; ground truth wraps `docs/Makefile`,
  golangci-lint, shellcheck, and `go test` into actions; sphinx preview via a
  tunnel pair on 8000; in-project `tools` SDK with hooks.
- `vscode-workshop` — TypeScript VS Code extension; ground truth pins
  node@24, ships a `test-deps` in-project SDK (X libraries + xvfb via
  `setup-base`, desktop plug), actions wrap npm/vsce with an `xvfb-run`
  headless variant.

Pinned upstream set (harder, no local checkout needed):

```
canonical/mir@5ce58e5f285d635439baed882fc77f1e3f3c50fe
canonical/subiquity@2ef6b41ec8ad07a96cd4a2c581f4ae412e2be71d
locnnil/formally-verify-rust-neetcode-with-creusot@4a36c4c1ae9e918b5b3c14ff84be4a10cc62ebc5
canonical/store-workshop@f29dee3a66bdac4ed430375f8974060002410f74
```

Each needs an `expectations/<repo-basename>.json`; without one the scorecard
returns `overall_pass: null` and the promptfoo assert fails.

## How a run works

`make eval-reconstruction` (offline tier) / `make eval-reconstruction-full`:

1. `run-reconstruction.sh` stages each repo into `.work/<run>/<dir>/repo` from
   a **detached worktree checkout** (not `git archive` — archive honours
   `export-ignore`, and repos that ship release tarballs use it to drop
   `debian/`, `.github/` and `.gitignore`, i.e. exactly the build evidence the
   agent must reason from). `.git` is not copied, so the commit history that
   added the definition never reaches the sandbox either.
2. The ground truth is parked at `.work/<run>/<dir>/ground-truth/`: root
   definitions, `.workshop/*.yaml`, and every `.workshop/<sdk>/` that carries
   an `sdk.yaml`. Files under `.workshop/` that are *not* definition artifacts
   (helper scripts some repos keep there) are relocated to `scripts/` with
   their call sites rewritten — they are project tooling and deleting them
   would remove legitimate evidence.
3. CI workflows that drive the workshop CLI are parked; `scrub-repo.py` then
   redacts **every remaining file that mentions Workshop**, collapsing whole
   lines so their arguments (workshop names, SDK names, ports) cannot leak.
   Originals go to `ground-truth/redacted-originals/`, and every action is
   logged in `ground-truth/scrub-report.txt`.
4. Both skills are installed into the sandbox's `.claude/skills/`.
5. `provider-onboard-cli.js` runs `claude -p` with the onboarding task
   (offline tier: generate-and-stop, no LXD; full tier: launch + action
   proof), then appends the generated files, the ground truth, and the
   `compare-definition.py` scorecard to the output.
6. Asserts gate on `"overall_pass": true` (deterministic thresholds from
   `expectations/<repo>.json`) plus a functional-equivalence + honesty
   llm-rubric. Record outcomes in `../BASELINE.md`.

## Auth and judge

| Env | Values | Effect |
|-----|--------|--------|
| `RECON_AUTH` | `api` (default) / `subscription` | `api` runs `claude --bare` on `ANTHROPIC_API_KEY`. `subscription` runs on the local CLI login — `--bare` cannot (its auth is *strictly* the API key; OAuth and keychain are never read), so it is dropped and the isolation it gave is replaced with `--setting-sources project --strict-mcp-config --mcp-config '{"mcpServers":{}}'` plus a sandbox `.claude/settings.json`. `--safe-mode` is not an option: it disables skills. |
| `RECON_JUDGE` | `openai` (default) / `local` | `openai` uses the pinned gpt-5.5 rubric judge (`OPENAI_API_KEY`). `local` uses the shared `../../../_testlib/provider-judge-cli.js`, the same local CLI, graded tool-less from a scratch cwd. |
| `RECON_CONCURRENCY` | int | promptfoo `--max-concurrency`; defaults to 1 under `subscription` (one account, one rate limit) and 4 otherwise. |
| `RECON_MODEL_OVERRIDE` | model id | Model for the agent under test; also tags the raw results filename so model passes stay separable. |

Verify subscription mode took effect: the transcript's `[SYSTEM init]` line
reports `apiKeySource=none`.

## Honest limitations

- **Scrubbing is approximate.** Redaction removes every line that mentions
  Workshop and parks workshop-driving CI, but an agent can still infer "this
  repo could use a container dev environment". What it cannot see is the
  actual definition — which is what the metrics compare against. A repo whose
  own *name* says workshop also gets a neutralised sandbox directory name,
  since the sandbox path is the agent's cwd.
- **Expectations are curated, and encode what the scrubbed tree can support** —
  not a verbatim match. Where the maintainers' own definition omits something
  (subiquity ships no actions; store-workshop's service ports exist only in
  the hidden file), the threshold is relaxed or made advisory so that an exact
  reproduction of the human answer passes. Surplus over the ground truth is
  recorded as a metric and judged by the rubric, not gated here.
- **Not everything is reconstructable, on purpose.** `store-workshop`
  orchestrates 17 microservices cloned on demand from Launchpad and gitignored;
  its 16 tunnel ports appear nowhere in the tree. It is scored derivable-only,
  and what is actually under test there is whether the skill *names* the gap
  instead of inventing ports.
- **Offline tier doesn't prove actions run** — that's what the full tier and
  the agentic suite are for.

## Cost

Offline: ~$1–2 per repo on `RECON_AUTH=api` (Sonnet 4.6 + judge), or
subscription usage with no API spend on `RECON_AUTH=subscription`. Full:
10–30 min per repo, real LXD, Store SDK downloads, ~$2–5 per repo.
Local-only; no CI job.
