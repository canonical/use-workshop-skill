<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Author or update an in-project SDK at `.workshop/<NAME>/` with one or more hooks, then verify it installs cleanly into the workshop. Covers writing a fresh SDK, adding a hook to an existing one, and diagnosing a hook failure.
</objective>

<required_reading>
1. `references/in-project-sdk.md` — `sdk.yaml` schema, hook taxonomy, filesystem layout, execution context
2. `references/sdk-types.md` — when an in-project SDK is the right choice vs Store / system / try
3. `references/command-cheatsheet.md` — `workshop refresh`, `workshop tasks`, `workshop info`, `workshop exec`; `sdk` vs `workshop.sdk` invocation
4. `references/async-and-recovery.md` — `--wait-on-error` recovery loop for diagnosing hook failures
</required_reading>

<process>

**Step 1. Confirm in-project is the right kind of SDK.**

If the user wants a *published* tool that already exists in the Store (e.g., `uv`, `ollama`), a Store SDK entry is shorter and correct. Run `sdk find <keyword>` first (or `workshop.sdk find` if `sdk` isn't on PATH — see `command-cheatsheet.md`). Only fall through to in-project authoring when:
- the tool isn't in the Store, OR
- the user wants a project-specific install recipe (e.g., `uv tool install <pkg>` against this project's `/project/`).

**Step 2. Pick the minimum hook set.**

Walk down the hook taxonomy from `references/in-project-sdk.md`. For a tool-wrapper SDK, `setup-project` alone is usually enough.

| Need | Hook |
|------|------|
| Install a CLI/tool against `/project/` (most common) | `setup-project` |
| Persist OS package installs into every workshop on a given base | `setup-base` |
| Wait for a service to become reachable before declaring `Ready` | `check-health` |
| Survive `workshop stop`/`start` with mutable state | `save-state` + `restore-state` |
| Per-SDK system-wide config that's not project-aware | `setup-sdk` |

**Step 3. Write `sdk.yaml`.**

```yaml
# .workshop/<NAME>/sdk.yaml
name: <NAME>
hooks:
  - <HOOK-1>
  - <HOOK-2>          # optional
# plugs: {}           # optional; only if the SDK provides plugs
# slots: {}           # optional; only if the SDK provides slots
```

**Step 4. Write each hook script under `.workshop/<NAME>/hooks/<HOOK>`.**

```bash
#!/bin/bash
set -euo pipefail
# … hook body …
```

Then make it executable:

```
chmod +x .workshop/<NAME>/hooks/<HOOK>
```

A hook without `+x` is silently ignored — surface this to the user when generating new hook files.

**Step 5. Reference the SDK from the workshop definition.**

Add to `workshop.yaml` (or each `.workshop/<workshop-name>.yaml` in multi-workshop projects):

```yaml
sdks:
  - name: project-<NAME>     # mandatory project- prefix
```

**Step 6. Apply: refresh.**

```
workshop refresh --wait-on-error
```

Use `--wait-on-error` on the FIRST install of an in-project SDK — hook bugs are common on the first iteration and pausing in `Waiting` saves a remove+launch cycle. If the workshop has not been launched yet for this project, run `workshop launch --wait-on-error` instead.

**Step 7. Verify (the verification loop).**

```
workshop changes               # newest change has Status: Done
workshop tasks <ID>            # every task Done; the SDK install task
                               # log shows hook stdout/stderr
workshop info                  # the SDK appears as project-<NAME>;
                               # status: Ready
workshop exec -- <a check>     # e.g., the tool the hook installed is on PATH
```

For an SDK with `check-health`, `workshop info` reflects whatever the hook's last `workshopctl set-health` call set.

**Step 8. Iterating on a hook (existing in-project SDK).**

Edit the hook script, then:

```
workshop refresh --wait-on-error
```

Refresh re-runs `setup-project` and `check-health`. To re-run `setup-base` or `setup-sdk`, the workshop must be recreated — `workshop remove && workshop launch`. State this when the user reports a `setup-base` change isn't taking effect.

**Step 9. Diagnose a failed hook.**

If the refresh ran without `--wait-on-error` and errored, the change auto-reverts and the workshop returns to its previous state. Inspect what happened:

```
workshop changes               # find the Errored change ID
workshop tasks <ID>            # the failing task's log tail is at the bottom;
                               # hook stdout/stderr is captured here
```

To pause inside the failed hook for live investigation, re-run with `--wait-on-error` and use `workshop shell` to enter the container; fix the cause and `workshop refresh --continue`, or give up with `workshop refresh --abort`.

</process>

<verification>
After every refresh:

```
workshop changes
workshop tasks <ID>
workshop info
```

Plus a project-specific check (the hook's promised effect: e.g., `workshop exec -- <tool> --version`, or a smoke test).

Report back as: **"Change <ID>: <status>. Workshop status: <Ready|...>. SDK project-<NAME> hooks ran: <list>. Verified: <smoke test result>."**
</verification>

<anti_patterns>
- Forgetting `chmod +x` on a hook script — the hook is silently ignored; the workshop reports `Ready` without the hook's effect.
- Naming the SDK directory and the `name:` field differently — the SDK fails to load.
- Omitting the `project-` prefix in `workshop.yaml`'s `sdks:` entry — Workshop won't find the SDK.
- Writing hook logic in `sdk.yaml` itself — there is no inline-script field; logic lives in `hooks/<HOOK-NAME>` scripts.
- Calling `workshopctl set-health` from anywhere other than a `check-health` hook — it is intended for in-hook execution context.
- Reaching for the build-time `schema-sdk.json` to validate `sdk.yaml` — that schema describes the post-`sdkcraft` form; in-project hooks aren't a YAML field there.
- Editing `setup-base` and expecting `workshop refresh` to re-run it — `setup-base` only runs on workshop creation. `remove` + `launch` is required.
</anti_patterns>

<success_criteria>
- `workshop info` lists `project-<NAME>` as installed.
- The hook's promised effect is verifiable via `workshop exec` (e.g., the installed tool resolves on `$PATH`).
- `.workshop/<NAME>/` is committable: `sdk.yaml` plus `hooks/` scripts with executable bits set.
- For a `check-health`-using SDK, the workshop status reflects the hook's `set-health` call.
</success_criteria>

<source_docs>
- `tutorial/part-3-sketch-sdks.md` (eject layout + minimal working hook)
- `explanation/sdks/concepts.md` (hook taxonomy, lifecycle, set-health)
- `reference/definition-files/sdk-definition.md`
- `reference/cli/workshop-refresh.md`, `reference/cli/workshop-tasks.md`, `reference/cli/workshop-info.md`
- `reference/cli/workshopctl.md` (in-hook only)
</source_docs>
