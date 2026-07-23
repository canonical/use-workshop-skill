<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Launch the generated workshop and PROVE the toolchain mapping: every generated
action runs (or is honestly reported UNVERIFIED), every tunnel answers. Ends
with the final onboarding report.
</objective>

<required_reading>
1. `../use-workshop/references/async-and-recovery.md` — change/task model,
   `--wait-on-error` recovery
2. `../use-workshop/references/command-cheatsheet.md` — launch/run/connect
   flags
</required_reading>

<process>

**Step 1. Launch:** `workshop launch --wait-on-error <name>`.

**Step 2. Verification triplet:**
```
workshop changes              # newest change ID
workshop tasks <ID>           # every task Done
workshop info <name>          # Status: Ready
```
`Error`/`Waiting` → investigate via `workshop shell`, fix (typically
setup-base package list or a bad channel), `--continue`/`--abort`; deeper
issues → `../use-workshop/workflows/troubleshoot.md`.

A launch failure involving a proposed plug/slot/SDK is NOT a license to
remove it: investigate via `changes`/`tasks`; if the conflict is
environmental (stale daemon state, an occupied host resource) and cannot be
resolved within the fix budget, the construct STAYS in the definition — it
may work on the user's real host — and its row in the proof table reads
UNVERIFIED with the reason. Removing a proposed construct is a proposal
amendment that needs the user's explicit approval, never a silent fix.

**Step 3. Action proof loop.** For EVERY generated action:
- One-shot actions: `workshop run <action>` (add `-- "$@"`-style args only if
  the action forwards them).
- Long-running servers: start THE ACTION ITSELF (`workshop run <action>`,
  backgrounded or in a second terminal step — probing the underlying command
  via `workshop exec` does not prove the action), `workshop connect` the
  tunnel if the pair needs a manual connect, probe from the HOST
  (`curl -sf localhost:<port>` or equivalent), then stop it. Do not leave
  servers running.
- On failure: diagnose and fix — missing OS package → add to the in-project
  SDK's `setup-base`, then RECREATE the workshop (`workshop remove` +
  `workshop launch`): an applied refresh re-runs `setup-project`, NOT
  `setup-base`. Project-level dependency (npm/pip install) → `setup-project`
  + `workshop refresh`. Wrong directory → `--cwd` or a `cd` in the action;
  wrong channel → correct + refresh. Maximum 3 fix iterations per action,
  then mark it UNVERIFIED with the reason and downgrade the verdict
  accordingly (an unproven mapping is a gap, not a success).

**Step 4. Final report** — always emit:
```
## Onboarding report

Verdict: <FULL|PARTIAL> (<changes from proposal, if any>)
Files created: <paths>
Action proof:
| action | result | note |
|--------|--------|------|
| build  | PASS   |      |
| ...    | FAIL/UNVERIFIED | <reason> |
Tunnels: <name: host port → PASS/FAIL>
Gaps: <carried over + any added during verification> | none
Next steps: commit the definition and .workshop/ SDK dirs (keep
.workshop.lock gitignored); `workshop shell` to start working;
IDE attach → use-workshop's ide-integration workflow.
```
</process>

<verification>
- Triplet run after launch AND after every refresh performed while fixing.
- Every action appears in the proof table; no silent deletions from the
  definition to make the table green.
</verification>

<anti_patterns>
- Reporting success from YAML validity alone — only `workshop run` proves an
  action.
- Turning the final report into a day-to-day operations tutorial
  (exec/refresh/start/stop walkthroughs) — that is the `use-workshop`
  skill's job; give at most a couple of pointer commands and hand off.
- Deleting a failing action instead of fixing or reporting it UNVERIFIED.
- Stripping a proposed plug/slot/SDK because launch hit a conflict
  ("headed debugging is IDE-level anyway…") — the construct stays,
  UNVERIFIED, unless the user approves removing it.
- Leaving a dev server running after probing it.
- Endless fix loops — after 3 attempts per action, report honestly.
- Skipping the host-side probe for tunnels (in-workshop curl proves nothing
  about the tunnel).
</anti_patterns>

<success_criteria>
- `workshop info` reports Ready.
- Proof table covers every generated action and tunnel.
- Final report emitted with verdict, files, gaps, next steps.
</success_criteria>

<source_docs>
- `reference/cli/workshop.md` (launch, run, connect sections)
- `explanation/workshops/changes-tasks.md`
- `reference/workshop-status.md`
- `how-to/fix-workshops/debug-issues.md`
</source_docs>
