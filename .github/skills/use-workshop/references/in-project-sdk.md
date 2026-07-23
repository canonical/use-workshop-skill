<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
In-project SDKs live inside the project at `.workshop/<NAME>/` and are version-controlled with the project. They install at workshop launch/refresh and are the right tool for tooling that's specific to one project (or a small set of related projects) and not appropriate for the public Store.

Two artifacts make up an in-project SDK:
1. `.workshop/<NAME>/sdk.yaml` — the SDK manifest.
2. `.workshop/<NAME>/hooks/<HOOK-NAME>` — executable scripts, discovered automatically by filename (one per hook).

There is NO build step (that is `sdkcraft`'s job, out of scope here). Workshop reads the manifest and runs the hook scripts directly.
</overview>

<sdk_yaml_schema>
Minimal `sdk.yaml` shape:

```yaml
# .workshop/<NAME>/sdk.yaml
name: <NAME>           # matches the directory; the ONLY required key
# plugs: {}            # optional; interface plugs the SDK requests
# slots: {}            # optional; mount/tunnel slots the SDK provides
```

There is NO `hooks:` key in an in-project `sdk.yaml`. Hooks are executable files under `.workshop/<NAME>/hooks/<HOOK-NAME>`, discovered automatically by filename — adding a `hooks:` key fails strict validation (0.9.2+) with an `unknown field` error and its line/column. The only SDK definition where hooks appear in YAML is a *sketch* SDK's `sdk.yaml` (a map of hook name → inline script); `workshop sketch-sdk --eject` materializes that map into `hooks/` files and drops the key. Do not copy a sketch's `hooks:` map into an in-project SDK.

Reference the SDK from the workshop definition as `project-<NAME>`:

```yaml
sdks:
  - name: project-<NAME>
```

Only `name` is mandatory. Valid optional top-level keys: `title`, `version`, `summary`, `description`, `base`, `architecture`, `license`, `plugs`, `slots` (built Store SDKs additionally carry fields like `sdkcraft-started-at` — never author those by hand). `architecture` is assumed to match the host (or `all`). `name` rules: at least one lowercase letter; lowercase letters, digits, and interior hyphens; up to 40 characters; cannot be `agent`, `system`, or `sketch`, and cannot start with `try-` or `project-` — the `project-` prefix appears ONLY in the workshop definition's `sdks:` reference. The manifest lives at `.workshop/<NAME>/sdk.yaml` (or `.workshop/<NAME>/meta/sdk.yaml`).

The post-build JSON Schema (`reference/definition-files/schema-sdk.json`) describes the *post-`sdkcraft`* form (its `required` list reflects a packed SDK, which carries fields like `sdkcraft-started-at`) — that is NOT the in-project authoring shape. Do not reach for it to validate `sdk.yaml`.

Note: user-facing YAML is validated strictly (0.9.2+) — an unknown or misspelled key in `sdk.yaml` (or a sketch SDK) is rejected up front with a line/column, rather than being silently ignored. Fix the key; don't retry the same file.
</sdk_yaml_schema>

<hook_taxonomy>
Exactly five hook names are recognized: `setup-base`, `setup-project`, `check-health`, `save-state`, `restore-state`. Each is an executable file under `.workshop/<NAME>/hooks/<HOOK-NAME>` (no extension; the file's shebang picks the interpreter). All are optional. **There is no `setup-sdk` hook** — do not invent one.

| Hook | When it runs | Runs as | Working dir | Typical use |
|------|--------------|---------|-------------|-------------|
| `setup-base` | On first install and whenever the SDK revision changes — **before the project directory is mounted and before any plug/slot is connected**. A refresh reuses the post-`setup-base` base snapshot, so it does NOT re-run unless the base image (or an SDK listed above this one in the definition) changes. | `root` | the SDK's `hooks/` dir | OS-level prep that must persist into every workshop on this base and that other SDKs may rely on (`apt-get install …`, write `/etc/profile.d/<sdk>.sh`). |
| `setup-project` | At every launch and after every *applied* `workshop refresh`, **after the project is mounted and auto-connect has finished**. | `workshop` user | `/project/` | Project-aware install (`uv tool install ruff`, `npm ci`). The most common hook. Also has `$HOME`, `$XDG_RUNTIME_DIR`, `$DBUS_SESSION_BUS_ADDRESS`. |
| `check-health` | After `setup-project` (and, on a refresh, after `restore-state`). Has ~5 seconds per attempt to report and exit. | `root` | the SDK's `hooks/` dir | Verify the SDK can operate; report via `workshopctl set-health` (see below). Because it runs as root, wrap user-context checks in `sudo -u workshop --login`. |
| `save-state` | During an *applied* `workshop refresh`, on the **old** SDK revision, before the writable filesystem is discarded. | `root` | the SDK's `hooks/` dir | Copy anything that must survive the rebuild into `$SDK_STATE_DIR`. |
| `restore-state` | During the **same** refresh, on the **new** SDK revision, after every SDK's `setup-project` has run. | `root` | the SDK's `hooks/` dir | Read state back from `$SDK_STATE_DIR`; keep it idempotent and tolerant of missing input. |

**`save-state`/`restore-state` are refresh hooks, not stop/start hooks.** They run only when a `workshop refresh` actually has work to apply (a new revision, an added/removed SDK, or a definition change); a no-op refresh skips every hook. `$SDK_STATE_DIR` is the only directory that survives the rebuild.

**Health reporting.** From `check-health`, call `workshopctl set-health <okay|waiting|error> [<message>]` (optional `--code=<short-code>`; a message is required for `waiting`/`error` and not allowed with `okay`). Mapping: `okay` → the SDK is *Ready*; `waiting` → Workshop sleeps 1s and re-runs `check-health`, up to 10 times before moving the SDK to *Error*; `error` (or a non-zero exit, no report, or running past 5s) → *Error*. There is no `Ready|Pending|Error` status and no `--reason` flag.

**Executable script requirement.** Each hook file MUST be executable (`chmod +x`) and start with a shebang. Workshop execs hooks — it does NOT shell-source them. A hook without `+x` is silently ignored.

**Hook environment.** Every hook gets `SDK=<the SDK's install dir>`; `setup-project` additionally gets `$HOME`/`$XDG_RUNTIME_DIR`/`$DBUS_SESSION_BUS_ADDRESS`, and `save-state`/`restore-state` get `$SDK_STATE_DIR`. `errexit` and `pipefail` are always set (a non-zero exit or pipe stage fails the hook); `--verbose` on `launch`/`refresh` adds `xtrace`. Reference SDK-shipped binaries by full path (`"$SDK/bin/<BINARY>"`) — the SDK's `bin/` is not on `PATH` inside the hook unless `setup-base` puts it there (e.g. via `/etc/profile.d`).

**Failure semantics.** A non-zero exit from any hook fails the change. The workshop transitions to `Error` (or `Waiting`, if launched/refreshed with `--wait-on-error`).

**Refresh re-run rules.** An applied `workshop refresh` re-runs `setup-project` and `check-health` (plus `save-state`/`restore-state` when a revision actually changes). It does NOT re-run `setup-base` — that runs only on workshop creation and revision change. To force an edited `setup-base` to take effect, recreate the workshop (`workshop remove` + `workshop launch`).
</hook_taxonomy>

<filesystem_layout>
```
<project>/
├── .workshop/
│   └── <NAME>/
│       ├── sdk.yaml
│       └── hooks/
│           ├── setup-project        # executable
│           └── check-health         # executable, optional
└── workshop.yaml          # references project-<NAME> under sdks:
```

In multi-workshop projects (`.workshop/<wkshp-a>.yaml`, `.workshop/<wkshp-b>.yaml`) the SDK directory is a sibling of the per-workshop YAML files; multiple workshops can share one in-project SDK by listing it under each workshop's `sdks:`.
</filesystem_layout>

<minimal_examples>
Tool-wrapper SDK (one hook, no plugs/slots) — the canonical pattern for installing a CLI tool against the project:

```yaml
# .workshop/ruff/sdk.yaml
name: ruff             # no hooks: key — the hook below is discovered by filename
```

```bash
#!/bin/bash
# .workshop/ruff/hooks/setup-project
set -euo pipefail
uv tool install ruff
```

`chmod +x .workshop/ruff/hooks/setup-project`, then add `- name: project-ruff` to `workshop.yaml` under `sdks:` and `workshop refresh`.

Health-aware SDK (with `check-health`):

```yaml
# .workshop/db/sdk.yaml
name: db               # hooks/ files below are discovered by filename
```

```bash
#!/bin/bash
# .workshop/db/hooks/check-health
set -euo pipefail
if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  workshopctl set-health okay
else
  workshopctl set-health waiting "postgres not yet listening"
fi
```
</minimal_examples>

<source_docs>
- `explanation/sdks/runtime-hooks.md` (the five hooks: privileges, working dirs, ordering, and the `set-health` contract)
- `how-to/develop-sdks/write-runtime-hooks.md` (one worked example per hook)
- `explanation/sdks/lifecycle.md` (where in-project sits: sketch → in-project → build → publish → consume)
- `tutorial/part-3-sketch-sdks.md` (working in-project SDK example after eject)
- `explanation/sdks/concepts.md` (SDK concepts)
- `reference/definition-files/sdk-definition.md` (`sdk.yaml` shape; an in-project SDK needs only `name`)
- `reference/cli/workshopctl.md` (`set-health` invocation, in-hook only)
</source_docs>
