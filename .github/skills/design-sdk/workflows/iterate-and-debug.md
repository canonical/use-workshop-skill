<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Drive the try-refresh loop until the SDK builds, installs, and reports
healthy in a real workshop — then graduate the manual checks into spread
tests. This is the fail-fast core of the skill: every generated or edited
SDK passes through here before it is called done.
</objective>

<required_reading>
1. `references/runtime-hooks.md` — which hook runs when, as whom
2. `../use-workshop/references/command-cheatsheet.md` — verbatim `workshop`
   signatures
3. `../use-workshop/references/async-and-recovery.md` — change/task model,
   recovery flags
4. `references/spread-tests.md` — for the graduation step
</required_reading>

<process>

**Step 0. Toolchain preflight, once per session.** `workshop --version`
(the flag — `workshop version` is not a subcommand) and
`snap list workshop sdkcraft`. Trust the snap table over `sdkcraft
--version`, which on an edge build reports a dev string
(`0.0.post1.dev1+g<sha>`) rather than the release number. The two snaps are
independent — separate channels and publishers — and `sdkcraft` commonly
trails `workshop` by a point release; that skew is normal, not a fault.
Every `(0.9.x+)` note in this skill's references is a floor: below it, name
the version the behavior needs and drop the feature instead of inventing a
workaround. Never `snap refresh` or `snap remove` these on the user's
behalf — Workshop is not forward compatible (after a snap update a workshop
refuses `restore` and `--continue` until one `workshop refresh`), downgrades
are unsupported, and removing the snap deletes every workshop and SDK on the
machine. Report the mismatch and let the user decide.

**Step 1. Build into the try area.** `sdkcraft clean && sdkcraft try` — the
deterministic default; `clean` may be skipped only when nothing but hook
bodies changed since the last try. Useful flags: `--verbose`;
`--platform <p>` / `--build-for <arch>` to target one platform;
`--destructive-mode` for speed on a disposable host; `--debug` to shell
into the build environment on failure; `--shell-after` to inspect a
successful build. Confirm from the output that the artifact landed in the
try area.

**Step 2. Consume as a try SDK.** Test workshop from
`templates/test-workshop.yaml`: `base` matching a packed platform, the SDK
listed as `- name: try-<NAME>`. Tunnel plugs graft onto the system SDK in
the test definition when the SDK exposes a service (shape in the template's
comments). The `try-` prefix lives in that `sdks:` entry only: a
`connections:` entry names the SDK bare (`slot: <NAME>:<slot>`), and
`try-<NAME>:<slot>` fails the launch as a reserved SDK name.

**Step 3. First run, fail fast.**
`workshop launch --verbose --wait-on-error` (single-workshop constraint —
one `--wait-on-error` workshop at a time). Subsequent iterations:
`workshop refresh` (add `--wait-on-error` while diagnosing).

**Step 4. Verify.** The triplet — `workshop changes` →
`workshop tasks <ID>` → `workshop info` — after every launch/refresh;
`workshop info` must report `status: ready`, the roll-up of every SDK's
`check-health` (there is no per-SDK health line, and `okay` — the value
the hook passes to `workshopctl set-health` — never appears in that
output). Then hook-specific checks via `workshop exec`:
- `setup-base`: the installed packages/files exist; `/etc/profile.d/<NAME>.sh`
  says what it should.
- `setup-project`: user-context config exists;
  `systemctl --user status <NAME>` active for daemon SDKs.
- `check-health`: exercise the same probe by hand and compare.
- state hooks: mutate → `workshop refresh` → confirm the state survived.

**Step 5. On failure, classify, then investigate in place.** The workshop
parks in `Waiting`: `workshop shell` in, run the failing hook body by hand —
as the right user (`setup-project` runs as `workshop`; root hooks may need
`sudo -u workshop --login` for user-context probes). Quote the failing
`workshop tasks` output in the report — never summarize from memory. Put
the failure in exactly one class below before touching the source; each
class has its own fix budget, counted across the whole session — and fixes
the user already tried and reports to you count against it. A user who
says the same error came back after their fixes has spent that budget:
answer with the Blocked report below (your best hypothesis and the check
that would confirm it go inside it), not with another fix-and-refresh
recipe.

| Class | Evidence | Fix route | Cap |
|---|---|---|---|
| pack/lint | `sdkcraft try` fails before the artifact lands: ShellCheck error, `$SDK` mount source missing from prime, interface linter, reserved name (anti-patterns 6, 8, 16) | Edit `sdkcraft.yaml` or the hook, Step 1 | 3 |
| try staging | Artifact not in the try area, or the test workshop lists the wrong `try-` name | Fix the test definition or rerun `sdkcraft try`, Step 1–2 | 2 |
| hook failure | Change parks in `Waiting` on `setup-base`/`setup-project`/a state hook | Reproduce by hand, fix the hook in the source, `--abort`, Step 1 (Step 6 for `setup-base`) | 3 |
| health never ready | `check-health` ends in Error: ten `waiting` results, or a probe over 5 s | Fix the probe or the service unit, Step 1 | 2 |
| connection/interface | A plug stays unconnected, a tunnel endpoint is wrong, a mount source is missing at connect time | Fix the plug/slot or the test `connections:`, Step 1 | 2 |

Fixed an **external** cause instead (a transient Store or network hiccup
that has since cleared)? Resume with `workshop refresh --continue` (or
`workshop launch --continue`) rather than spending a try cycle; a source
fix always goes through `--abort` and back to Step 1, because the
definition can't change while a change is paused.

**Stop — do not patch — and write the Blocked report when:**
- a class reaches its cap, or the loop reaches 8 `sdkcraft try` cycles in
  total;
- the same error text comes back after that class's fix (the fix was a
  guess — a second guess is not a plan);
- the failure fits no class above;
- the host toolchain is the problem — snapd, LXD, the Store, or the
  network is unreachable, or a `workshop`/`sdkcraft` command fails before
  any SDK code runs. Stop on the first occurrence and change no SDK file;
  never `snap refresh`/`remove` (Step 0).

Release any parked workshop with `--abort` first, then report:

```
## Blocked: <class>
Attempts: <n> of <cap> for this class (<total> try cycles)
Last failure (`workshop tasks <ID>`, verbatim):
  <quoted output>
Hypothesis: <one line — what you think is wrong and why>
Tried: <one line per fix attempt>
Next for the user: <the check or decision you can't make>
```

When the user brings the repeats to you, the answer IS this report. Say
"my third fix for `setup-project` still fails with `npm: command not
found`, should I try another?":
- Wrong: another hook edit plus `workshop refresh`, or a `workshop remove`
  + `launch` to "start clean", or a diagnosis essay with no report.
- Right: `workshop refresh --abort` to release the parked change, then
  `## Blocked: hook failure`, `Attempts: 3 of 3`, the `workshop tasks <ID>`
  output (ask the user to paste it if you don't have it), the hypothesis
  (e.g. `setup-project` runs without the `/etc/profile.d` PATH that
  `setup-base` wrote), `Tried:` their three fixes, and the check that
  would confirm the hypothesis under `Next for the user`.

**Step 6. Respect setup-base semantics.** An applied refresh does NOT
re-run `setup-base` — it reuses the post-setup-base snapshot. After editing
`setup-base`, recreate: `workshop remove` then `launch` (the one legitimate
remove+launch case). A change to an SDK also invalidates the snapshot of
every SDK listed BELOW it in the definition — expect those to re-run.

**Step 7. Graduate.** When the manual checks pass twice in a row, encode
each as a spread job — hand off to `write-spread-tests.md`. A pass that
lives only in the transcript is not a regression net.

`workshop sketch-sdk` is the interactive (human-only, `$EDITOR`) way to
prototype an SDK in place; the agent-drivable equivalent is prototyping a
command via `workshop exec` before baking it into a hook, then this loop.
</process>

<verification>
- [ ] Every `sdkcraft try` was confirmed from output, not assumed.
- [ ] Every launch/refresh was followed by the triplet, and the SDK's
      health state was reported.
- [ ] Failures were diagnosed from `workshop tasks` output quoted in the
      report.
- [ ] setup-base edits went through remove+launch, not refresh.
- [ ] Every failure was put in one class, and no class exceeded its cap.
- [ ] The loop ended in either a healthy SDK or a `## Blocked:` report in
      the Step 5 shape.
</verification>

<anti_patterns>
- Iterating on `setup-base` via refresh and concluding the edit "didn't
  take".
- Editing files inside the workshop to make it healthy — the SDK source is
  the artifact; a fix that lives only in the container evaporates on the
  next launch.
- Guessing why a change failed instead of reading `workshop tasks <ID>`.
- Retrying past a class cap, or patching the SDK for a host LXD/snapd/Store
  failure.
- Leaving a `--wait-on-error` workshop parked and starting another.
- Calling the SDK done after a green build with no launch, or a launch with
  no health check.
- Walking the user through a `sketch-sdk` editor session step by step.
</anti_patterns>

<success_criteria>
- The SDK packs, launches as `try-<NAME>`, and reports healthy; every
  advertised capability was exercised at least once; the checks that proved
  it are queued for spread.
</success_criteria>

<source_docs>
- `how-to/develop-sdks/build-an-sdk.md` (the iterate loop)
- `explanation/sdks/concepts.md` (the try area, `try-` naming)
- `explanation/sdks/lifecycle.md` (sketch → in-project → build → publish)
- `explanation/sdks/runtime-hooks.md` (snapshot and ordering semantics)
- `reference/cli/sdkcraft.md`
- `reference/cli/workshop.md`
</source_docs>
