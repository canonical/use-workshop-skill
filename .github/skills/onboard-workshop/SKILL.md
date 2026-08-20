---
name: onboard-workshop
description: Analyze an arbitrary repository and bootstrap a tailored Workshop definition from its existing build, test, and debug toolchain — feasibility verdict first, then propose, generate, launch, and verify. Use when a repo has no workshop definition yet and the user wants one derived from how the repo already builds and tests — "set up a workshop for this repo", "workshop-ify this project", "can this repo run in Workshop?".
---

<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<essential_principles>
Five rules that always apply to onboarding. Every workflow assumes them.

1. **Honesty gate.** The feasibility verdict (FULL / PARTIAL / INFEASIBLE)
   is delivered BEFORE any file is generated. Never silently drop a detected
   need to make the proposal look complete; every gap is named with a reason
   and workaround (or "none"). PARTIAL requires explicit user acknowledgment;
   INFEASIBLE ends the run with a report and docs pointers — a subpar
   workshop is worse than no workshop.

2. **Stay inside the envelope, and don't state guesses as facts.** Every
   proposed construct must map to a real definition key, interface, or SDK
   source per `references/capability-envelope.md`. No git-URL SDKs, no
   workshop-level env/services keys, no invented SDK names or channels — an
   SDK name is CHECKABLE (`sdk find`/`sdk info`), so a guess never goes into
   `sdks:` at all; fall back to an in-project SDK or a GAP. Inside a hook the
   situation differs: an install command has no registry to check against,
   and the hook must install *something*. There, write the best candidate and
   mark it — inline `# UNVERIFIED:` plus an `Unverified:` entry in the verdict
   — never as settled fact. Knowing a tool is needed is not knowing how it is
   installed; the tag is what keeps that distinction visible to the reader.

3. **Every question carries a recommendation.** Never ask an open question.
   Format: "Options: A / B — Recommendation: A, because <evidence>." Batch
   all questions into one message.

4. **Copy, don't synthesize, YAML.** Shapes come from `templates/` here and
   `../use-workshop/templates/` — never from memory.

5. **Encode, then prove.** The definition must ENCODE the toolchain mapping
   — actions for every build/test/lint/serve entry point, tunnels for dev
   servers, hooks for setup — prose advice ("you could run npm test with
   xvfb") is not a substitute for putting it in the files. A generated
   action is then done when `workshop run <action>` succeeded inside the
   workshop — or it is reported UNVERIFIED with a reason. Wrap the repo's
   existing entry points (Makefiles, scripts, CI commands); never
   re-implement them, and never MODIFY them: an onboarding writes only
   `.workshop/**` and the `.gitignore` line — the repo's existing Makefiles,
   build scripts, tests, and configurations stay untouched.
</essential_principles>

<docs>
Authoritative readable docs:
- Base URL: `https://ubuntu.com/workshop/docs/`
  Per-file `<source_docs>` blocks list paths RELATIVE to this base, with `.md` suffixes (e.g. `reference/cli/workshop.md`). Fetch by concatenating `<base>` + relative path → `https://ubuntu.com/workshop/docs/reference/cli/workshop.md`. The CLI reference is four combined pages — `workshop.md`, `sdk.md`, `sdkcraft.md`, `workshopctl.md` — each holding every subcommand of that tool as a section; there are no per-subcommand pages.
- Whole-tree fallback: `<base>/llms.txt` (index) and `<base>/llms-full.txt` (the full docs tree concatenated). Load one when a specific relative page isn't enough (e.g., the user asks something the skill doesn't directly cover and you want to scan the full docs tree). The docs are also served through the Context7 MCP server for agents that have it.

The base URL may change. It is recorded HERE only — every other file lists relative paths so a single edit re-points the whole skill. Do not embed local `docs/` paths in any file under this skill; the docs site is the source of truth.
</docs>

<sibling_skill>
This skill depends on its sibling `use-workshop` (shipped in the same
plugin): `<required_reading>` blocks cite `../use-workshop/references/*` and
`../use-workshop/templates/*` by relative path, and operating questions route
there. If the sibling is not installed (single-skill vendoring), fetch the
equivalent docs pages via `<docs>` instead — e.g.
`reference/definition-files/workshop-definition.md` for definition anatomy,
`reference/cli/workshop.md` for command signatures — and tell the user the
plugin is meant to be installed whole.
</sibling_skill>

<intake>
Pick the matching path:

1. Onboard a repo end-to-end ("set up a workshop for this repo") — all four
   workflows in order
2. Analyze only / feasibility check ("can this run in Workshop?") — stop
   after the verdict and proposal
3. Refine an earlier proposal ("use a different base/SDK") — re-propose, then
   regenerate
4. Verify a freshly generated definition ("prove it works") — launch and
   verify only
5. Operate, troubleshoot, or evolve an EXISTING workshop — not this skill;
   use `use-workshop`
</intake>

<routing>
| User intent (paraphrases) | Path |
|---------------------------|------|
| "onboard", "set up a workshop for this repo", "workshop-ify", "make this project run in Workshop", "bootstrap from my toolchain", "derive a workshop from this codebase" | `workflows/analyze-repo.md` → `workflows/propose-plan.md` → `workflows/generate-definition.md` → `workflows/launch-and-verify.md` |
| "can this repo run in Workshop", "is this feasible", "what would a workshop for this look like", "analyze first", "don't create anything yet" | `workflows/analyze-repo.md` → `workflows/propose-plan.md`, STOP at the proposal |
| "generate what we agreed", "apply the proposal", "write the definition" | `workflows/generate-definition.md` → `workflows/launch-and-verify.md` |
| "verify it", "prove the actions work", "launch what you generated" | `workflows/launch-and-verify.md` |
| "tweak the proposal", "different base", "swap the SDK", "drop the docs actions" | `workflows/propose-plan.md` → `workflows/generate-definition.md` → `workflows/launch-and-verify.md` |
| Existing workshop: run/refresh/connect/debug/parallel envs | `use-workshop` skill — do not improvise operations here |
</routing>

<reference_index>
Own references (in `references/`):

| File | Use for |
|------|---------|
| `toolchain-signals.md` | Detection pass; signal→construct table; action conventions; Repo Facts format |
| `capability-envelope.md` | What Workshop can/can't express; feasibility rubric; verdict format |
| `sdk-catalog.md` | Fallback SDK catalog when live `sdk find` is unavailable |
| `reference-patterns.md` | Proven wiring patterns; optional live enrichment |

Borrowed from the sibling (load by relative path):

| File | Use for |
|------|---------|
| `../use-workshop/references/definition-file.md` | Full workshop.yaml anatomy |
| `../use-workshop/references/sdk-types.md` | SDK kinds; store-first decision tree |
| `../use-workshop/references/in-project-sdk.md` | sdk.yaml schema; hook taxonomy |
| `../use-workshop/references/interfaces.md` | Interface semantics; auto vs manual connect |
| `../use-workshop/references/command-cheatsheet.md` | Verbatim command signatures |
| `../use-workshop/references/async-and-recovery.md` | Change/task model; recovery flags |
</reference_index>

<workflows_index>
| Workflow | Stage |
|----------|-------|
| `analyze-repo.md` | A: read-only toolchain analysis → Repo Facts |
| `propose-plan.md` | B/C: capability map → verdict → interview → approved proposal |
| `generate-definition.md` | D: write `.workshop/<name>.yaml` + in-project SDKs |
| `launch-and-verify.md` | E/F: launch, verify, action proof loop, final report |
</workflows_index>

<verification_loop>
After ANY mutating workshop command, run the triplet and report it:

```
workshop changes              # find latest change ID
workshop tasks <ID>           # confirm Status: Done (or surface the failure)
workshop info <name>          # confirm final status
```

Onboarding adds the **action proof loop** on top: after launch, every
generated action is exercised via `workshop run <action>` and every tunnel is
probed from the host; results go in the final report's proof table
(PASS / FAIL / UNVERIFIED + reason). See `workflows/launch-and-verify.md`.
</verification_loop>

<success_criteria>
A run of this skill is complete when:
- [ ] The feasibility verdict was delivered before any file was generated.
- [ ] Every question asked carried an explicit recommendation.
- [ ] INFEASIBLE runs generated nothing; PARTIAL gaps were acknowledged.
- [ ] Generated files were listed with paths; `.workshop.lock` is gitignored.
- [ ] The action proof table covers every generated action and tunnel.
- [ ] The final onboarding report was emitted.
</success_criteria>

<out_of_scope>
- Operating, troubleshooting, or evolving an existing workshop (refresh,
  interfaces, parallel worktrees, purge) → the `use-workshop` skill. This
  includes AFTER a successful onboarding: do not append an operations
  tutorial to the final report — one or two pointer commands
  (`workshop shell`, `workshop run <action>`) at most, then hand off.
- Repos that already contain a definition → `use-workshop`
  (`workflows/bootstrap-project.md` there); onboarding never overwrites one.
- `sdkcraft *` (building/publishing Store SDKs) and standalone `workshopctl` →
  point at `<base>/reference/cli/sdkcraft.md`,
  `<base>/reference/cli/workshopctl.md`,
  `<base>/tutorial/part-4-craft-sdks.md`, then stop.
- Interactive `workshop sketch-sdk` flows (require `$EDITOR`) — write
  in-project SDKs directly instead.
</out_of_scope>

<self_healing>
After a run, check whether an issue came from a gap in this skill's files.

What qualifies: tooling drift (command/flag changes), structural problems
(missing file, wrong routing row, dangling cross-reference), a missed
toolchain signal that caused a wrong proposal, an incorrect environment
assumption.

Off-limits for self-edits: `<essential_principles>` (the honesty gate above
all), the verdict semantics in `references/capability-envelope.md`,
`<routing>` semantics, `<out_of_scope>` fencing, and anything under `tests/`
— those changes are eval-gated and belong in a reviewed PR.

How to update: report the gap (file, wrong content, proposed change quoted in
full); apply only in a writable checkout after user confirmation; otherwise
propose a PR against `canonical/use-workshop-skill`. Preserve conventions:
section order, XML tagging, placeholder style, relative docs paths via
`<docs>`.
</self_healing>

<style>
- Lead with evidence: every proposal line cites the repo file it came from.
- Prefer the repo's own vocabulary for action names (their Makefile target
  names, their script names).
- When emitting YAML, copy from a template — do not synthesize from memory.
- Keep the analysis read-only; the first write happens in
  `generate-definition.md` after approval.
- Ground every command in the sibling cheatsheet — if a flag isn't listed
  there, it doesn't exist.
</style>
