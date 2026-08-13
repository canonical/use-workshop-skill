<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Turn the Repo Facts block into a feasibility verdict and a concrete, approved
onboarding proposal. The verdict comes BEFORE any generation; every question
put to the user carries an explicit recommendation.
</objective>

<required_reading>
1. `references/capability-envelope.md` — envelope, rubric, verdict format
2. `references/sdk-catalog.md` — SDK fallback catalog + usage rules
3. `references/reference-patterns.md` — proven wiring patterns
4. `../use-workshop/references/sdk-types.md` — SDK kinds and the store-first
   decision tree
5. `../use-workshop/references/interfaces.md` — interface semantics,
   auto-connect vs manual
</required_reading>

<process>

**Step 1. Map every Repo Fact to a construct.**
For each toolchain need, walk the SDK decision tree:
1. Live Store lookup: `sdk find <keyword>` then `sdk info <name>` (channels,
   supported bases). Pin the channel from repo evidence.
2. If the CLI is unavailable or finds nothing, consult
   `references/sdk-catalog.md`; anything proposed from it is tagged
   "(catalog, unverified — confirm with `sdk info` before launch)".
3. No Store fit but an apt-installable recipe exists (from CI evidence) →
   in-project SDK (`project-<name>`).
4. No Store fit and the repo never says how the tool is installed → still an
   in-project SDK, but the install line is a GUESS and is labelled one:
   inline `# UNVERIFIED:` in the hook, an `Unverified:` entry in the verdict,
   and a GAP naming what would settle it. The need being obvious does not
   make the route known.
5. Nothing fits → GAP entry. Never invent an SDK name or a git source.

For each dev server: tunnel pair per `<pattern name="Dev server exposed to
the host">`. For hardware/host needs: the matching interface, or a GAP.

**Step 2. (Optional) enrich from reference workshops.**
Follow `<live_enrichment>` in `references/reference-patterns.md` — silent
continue on any failure.

**Step 3. Emit the verdict block** (`<verdict_format>`) — FULL, PARTIAL, or
INFEASIBLE.
- INFEASIBLE → deliver verdict + reasons + docs pointers and STOP. Nothing is
  generated, no matter how helpful a partial file might feel.
- PARTIAL → enumerate every GAP and get explicit user acknowledgment before
  continuing.
- PARTIAL where the MAJORITY of the primary loop is GAPs (low confidence) →
  offer the minimal workshop fallback (base + project mount, no toolchain
  claims) as an explicit choice with a recommendation, per the
  low-confidence clause in `references/capability-envelope.md`; declined →
  stop as for INFEASIBLE.

**Step 4. Interview — only what is genuinely ambiguous, in ONE batch.**
Every DECISION question states its recommendation and the reason. (Requests
for repo evidence — a file's contents, a command's output — are analysis,
not interview questions, and need no recommendation; but never ask the user
for what you can read yourself.) Canonical set (skip any the evidence
already answers):
- Base: recommend `ubuntu@24.04` unless CI pins another supported base.
- Series coverage (only when the repo builds for more than one): recommend
  one definition per series (`.workshop/<series>.yaml`, shared in-project SDK)
  when CI runs a series matrix; name the single-definition alternative and
  which series it would pick.
- Definition name: recommend `dev` (layout is `.workshop/<name>.yaml`).
- Action set: recommend the inner loop (build, test, lint, dev server);
  docs/packaging targets included only when the user works on them.
- Channels: recommend pinning to the detected version over `latest/stable`.
- Optional heavy toolchains (docs stack, GPU variant): recommend in/out based
  on evidence of active use.

**Step 5. Present the full proposal for approval:**
files to be created (paths), `sdks:` list with channels and source tags,
actions with their wrapped commands, tunnel pairs, connections, and anything
UNVERIFIED. Proceed to `generate-definition.md` only on approval.
</process>

<verification>
- Verdict block emitted before any generation talk; format matches
  `<verdict_format>` exactly.
- Every SDK in the proposal is live-verified or explicitly tagged unverified.
- Every question asked carried a recommendation.
</verification>

<anti_patterns>
- Generating a definition despite an INFEASIBLE verdict "to give the user
  something".
- Softening PARTIAL to FULL by dropping a detected need from the report.
- Open-ended questions ("what base do you want?") without a recommendation.
- Proposing `latest/stable` when the repo pins a version.
- Skipping `sdk find` because the catalog has a plausible row.
</anti_patterns>

<success_criteria>
- Verdict delivered first; PARTIAL acknowledged by the user before generation.
- Proposal enumerates every file, SDK, action, and tunnel with evidence.
- User approved the proposal (or the run stopped at the verdict).
</success_criteria>

<source_docs>
- `reference/cli/sdk.md`
- `explanation/sdks/concepts.md`
- `reference/definition-files/workshop-definition.md`
- `how-to/customize-workshops/forward-ports.md`
</source_docs>
