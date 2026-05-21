<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
In-project SDKs live inside the project at `.workshop/<NAME>/` and are version-controlled with the project. They install at workshop launch/refresh and are the right tool for tooling that's specific to one project (or a small set of related projects) and not appropriate for the public Store.

Two artifacts make up an in-project SDK:
1. `.workshop/<NAME>/sdk.yaml` — the SDK manifest.
2. `.workshop/<NAME>/hooks/<HOOK-NAME>` — executable scripts (one per declared hook).

There is NO build step (that is `sdkcraft`'s job, out of scope here). Workshop reads the manifest and runs the hook scripts directly.
</overview>

<sdk_yaml_schema>
Minimal `sdk.yaml` shape:

```yaml
name: <NAME>           # matches the directory; lowercase, digits, hyphens
hooks:
  - <HOOK-NAME>        # one entry per hook script under hooks/
plugs: {}              # optional; interface plugs the SDK provides
slots: {}              # optional; interface slots the SDK provides
```

Reference the SDK from the workshop definition as `project-<NAME>`:

```yaml
sdks:
  - name: project-<NAME>
```

The post-build JSON Schema (`reference/definition-files/schema-sdk.json`) describes the *post-`sdkcraft`* form (carries `architecture`, `sdkcraft-started-at`, etc.) — that is NOT the in-project authoring shape. Do not reach for it to validate `sdk.yaml`. In particular, in-project hooks are a filesystem layout convention (`hooks/<HOOK-NAME>` executable scripts), not a YAML field.
</sdk_yaml_schema>

<hook_taxonomy>
Five hook names are recognized. Each is an executable file under `.workshop/<NAME>/hooks/<HOOK-NAME>` (no extension; the file's shebang picks the interpreter). All hooks are optional.

| Hook | When it runs | Runs as | Typical use |
|------|--------------|---------|-------------|
| `setup-base` | Once per (base, SDK) combination, on first install. Becomes part of the snapshot. | `root` against the base image (cwd `/`) | OS-level package installs (`apt-get install …`) that must persist into every workshop using this SDK on this base. |
| `setup-sdk` | Once per SDK install in a workshop, after `setup-base`. | `root` inside the workshop (cwd `/`) | SDK-private filesystem prep that's not project-aware (e.g., placing a system-wide config under `/etc/`). |
| `setup-project` | At every launch and after `workshop refresh`, after interfaces are connected. | `workshop` user (cwd `/project/`) | Project-aware install (e.g., `uv tool install ruff`, `npm ci`). The most common hook for a tool-wrapper SDK. |
| `check-health` | After setup hooks finish, and on demand via `workshop refresh`. | `workshop` (cwd `/project/`) | Wait for a daemon to become responsive; verify a database is reachable; etc. Must call `workshopctl set-health <Ready\|Pending\|Error> [--reason …]` before exiting. Workshop status reflects the hook's last call. |
| `save-state` / `restore-state` | `save-state` on stop; `restore-state` on start. | `workshop` (cwd `/project/`) | Persist/restore mutable state (a database directory, a service's data files) across workshop stop/start cycles. |

**Executable script requirement.** Each hook file MUST be executable (`chmod +x`) and start with a shebang. Workshop does NOT shell-source hooks — it execs them. A hook without `+x` is silently ignored.

**Failure semantics.** A non-zero exit from any hook fails the change. The workshop transitions to `Error` (or `Waiting`, if launched/refreshed with `--wait-on-error`).

**Refresh re-run rules.** `workshop refresh` re-runs `setup-project` and `check-health`. It does NOT re-run `setup-base` or `setup-sdk` — those run only on workshop creation. To pick up a `setup-base` change, the workshop must be recreated (`workshop remove` + `workshop launch`).
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
name: ruff
hooks:
  - setup-project
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
name: db
hooks:
  - setup-project
  - check-health
```

```bash
#!/bin/bash
# .workshop/db/hooks/check-health
set -euo pipefail
if pg_isready -h localhost -p 5432; then
  workshopctl set-health Ready
else
  workshopctl set-health Pending --reason "postgres not yet listening"
fi
```
</minimal_examples>

<source_docs>
- `tutorial/part-3-sketch-sdks.md` (working in-project SDK example after eject)
- `explanation/sdks/concepts.md` (full hook taxonomy + workshopctl mapping)
- `reference/definition-files/sdk-definition.md` (`sdk.yaml` shape)
- `reference/cli/workshopctl.md` (`set-health` invocation, in-hook only)
</source_docs>
