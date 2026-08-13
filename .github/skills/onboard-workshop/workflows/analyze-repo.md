<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Read-only analysis of a repository's existing build/test/debug machinery,
ending in an evidence-linked Repo Facts block. No files are written, no
workshop commands are run. This is stage A of onboarding; the Facts block is
the sole input to `propose-plan.md`.
</objective>

<required_reading>
1. `references/toolchain-signals.md` — the detection pass and Facts format
</required_reading>

<process>

**Step 1. Check for an existing definition FIRST.**
`ls -A` for `workshop.yaml`, `.workshop.yaml`, or a `.workshop/` directory.
If any exists, STOP — this repo is already onboarded. Route to the
`use-workshop` skill (`workflows/bootstrap-project.md` there) for launching or
evolving an existing definition. Onboarding never overwrites one.

**Step 2. Run the detection pass.**
Work through `<detection_pass>` in `references/toolchain-signals.md` in order:
census → manifests → orchestrators → CI workflows → lint configs → dev
servers → IDE artifacts → hardware needs. Record every fact WITH its evidence
file. CI workflows outrank READMEs when they disagree — CI is executed,
prose is not.

**Step 3. Note what you did NOT find.**
Missing test suite, no lint config, no CI — absence is a finding (it shrinks
the action set; it is not a gap to invent tooling for).

**Step 4. Emit the Repo Facts block** in the exact `<repo_facts_format>`
shape, then hand off to `propose-plan.md` (or stop here if the user asked
analyze-only).
</process>

<verification>
- Every line in Repo Facts carries an evidence path or "none found".
- No file in the repo was created or modified; no `workshop`/`sdk` command ran.
</verification>

<anti_patterns>
- Guessing a toolchain from the repo name or README badges instead of
  manifests and CI.
- Skipping subdirectory Makefiles (docs/, test/) — they carry the domain
  actions.
- Treating packaging pipelines (snapcraft, release workflows) as the dev loop.
- Proceeding to proposal with an existing `.workshop/` present.
- **Writing command output you did not get.** Never show an `ls -A`, a file
  listing, or a manifest excerpt that you did not actually read — a fabricated
  detection pass produces a definition built on invented evidence, which is
  the exact failure the honesty gate exists to stop. If you cannot read the
  repo, say so, name the specific files or command outputs you need, and state
  what each one decides. Asking for evidence is analysis; inventing it is not.
</anti_patterns>

<success_criteria>
- Repo Facts block emitted in the exact format, every fact evidence-linked.
- Existing-definition check performed before anything else.
</success_criteria>

<source_docs>
- `reference/definition-files/workshop-definition.md`
- `explanation/workshops/projects.md`
- `how-to/develop-with-workshops/run-workshops-in-github-actions.md`
</source_docs>
