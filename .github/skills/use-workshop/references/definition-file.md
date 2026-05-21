<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Anatomy of a workshop definition file. Use this when generating or editing `workshop.yaml` / `.workshop/<NAME>.yaml`. The schema is enforced; small errors will surface only at `workshop launch` or `workshop refresh` time.
</overview>

<file_layout>
**Single-workshop project:** definition lives at the project root as `workshop.yaml` or `.workshop.yaml` (the latter is hidden). The workshop name is optional in CLI commands.

**Multi-workshop project:** definitions live in `.workshop/<name>.yaml`. The filename (without `.yaml`) MUST match the `name:` field. Workshop name is REQUIRED in every CLI command.

**Cannot mix:** if both a root-level `workshop.yaml` and `.workshop/` files exist, Workshop reports an error.

**Workshop names:** start with a lowercase letter; lowercase letters, digits, and hyphens only.

**Lock file:** `.workshop.lock` is created at the project root on first interaction (e.g., `workshop list` or `workshop launch`) and binds the entire project — single file regardless of single- or multi-workshop layout (empirically verified: `workshop list` produces `<project>/.workshop.lock` for both `<project>/workshop.yaml` and `<project>/.workshop/<name>.yaml` layouts). Add `.workshop.lock` to `.gitignore`. Definition files themselves are MEANT to be committed.
</file_layout>

<top_level_keys>
| Key | Required | Type | Purpose |
|-----|----------|------|---------|
| `name` | yes | string | Workshop name; lowercase letters, digits, hyphens; must match filename for `.workshop/` files |
| `base` | yes | string | OS image: `ubuntu@20.04`, `ubuntu@22.04`, `ubuntu@24.04`, `ubuntu@26.04` |
| `sdks` | optional | list | SDKs layered on top of the base |
| `connections` | optional | list | Explicit plug↔slot wiring beyond auto-connect |
| `actions` | optional | map | Named bash scripts invoked via `workshop run` |
</top_level_keys>

<sdks_entry>
Each entry under `sdks:` is an object:

| Key | Required | Type | Purpose |
|-----|----------|------|---------|
| `name` | yes | string | SDK name. `system` for the system SDK; `project-<NAME>` for in-project SDKs; `try-<NAME>` for try SDKs |
| `channel` | optional | string | snap-like format `<TRACK>/<RISK>/<BRANCH>`; default `latest/stable`. Only for Store SDKs |
| `plugs` | optional | map | Plug bindings or new plug definitions on this SDK |
| `slots` | optional | map | New slot definitions on this SDK |

**Plug binding** (resolves plug conflicts between SDKs):
```yaml
sdks:
  - name: <sdk-a>
  - name: <sdk-b>
    plugs:
      <plug-name>:
        bind: <sdk-a>:<plug-name>
```

**Plug definition** (graft a plug onto an SDK in the workshop scope):
```yaml
sdks:
  - name: <sdk-name>
    plugs:
      <plug-name>:
        interface: mount
        workshop-target: /usr/local/<path>
```

**Slot definition** (graft a slot, e.g., for cross-SDK mount sources):
```yaml
sdks:
  - name: <sdk-name>
    slots:
      <slot-name>:
        interface: mount
        workshop-source: $SDK/<subdir>
```

`$SDK` expands to the SDK's installation path inside the workshop. `/project/` is the host project directory mounted in.
</sdks_entry>

<connections_entry>
Each entry under `connections:` explicitly wires a plug to a slot:
```yaml
connections:
  - plug: <sdk-a>:<plug>
    slot: <sdk-b>:<slot>
```
Both endpoints must use the same interface. The `system` SDK is implicitly available. Use this when auto-connect would not pick the right slot, or when you want a non-default wiring.
</connections_entry>

<actions_entry>
Each entry under `actions:` maps a name to a bash script:
```yaml
actions:
  <action-name>: |
    <shell command line(s)>
  another: <single-line command>
```
- `errexit` and `pipefail` are set automatically.
- Trailing arguments to `workshop run` reach the script as `"$@"`, `"$1"`, etc. Quote `"$@"` to preserve word boundaries.
- Action edits do NOT require `workshop refresh` — they're parsed at run time.
</actions_entry>

<interface_specifics>
**Mount plug attributes** (consumer side, on regular SDKs):
- `workshop-target` (required): absolute path inside the workshop; can use `/project/` or `$SDK/...`.
- `mode`, `uid`, `gid`: ownership and permissions; sensible defaults.
- `read-only`: boolean.

**Mount slot attributes** (provider side):
- On regular SDKs: `workshop-source` (required) — path inside the workshop.
- On the system SDK: dynamic `host-source` set by `workshop remount` (only).

**Tunnel `endpoint`** format:
- Network: `<HOST>:<PORT>/<PROTOCOL>` (e.g., `localhost:8080/tcp`, `udp`); `tcp` is default. Either side may omit the port (then both ends use the same).
- Unix domain socket: absolute path (e.g., `/run/foo.sock`); `$HOME` and `$XDG_RUNTIME_DIR` expand. System-SDK plugs cannot listen outside these two directories.
- Abstract socket: `@name`. Quote in YAML: `'@name'`.
- Privileged ports (1–1023) are blocked for system-SDK plugs.

**Camera, desktop, GPU, ssh-agent plugs:** must be named exactly `camera`, `desktop`, `gpu`, `ssh-agent` and cannot belong to the system SDK. They have no attributes.

**Slots for those interfaces only exist on the system SDK** — `system:camera`, `system:desktop`, `system:gpu`, `system:ssh-agent`. No regular SDK can declare them.
</interface_specifics>

<minimal_examples>

**Single SDK, no extras:**
```yaml
name: dev
base: ubuntu@22.04
sdks:
  - name: <sdk-name>
    channel: <track>/<risk>
```

**With actions:**
```yaml
name: dev
base: ubuntu@24.04
sdks:
  - name: <sdk-name>
actions:
  <action>: |
    <command>
  forwarding-args: <command> "$@"
```

**Plug binding to resolve a conflict:**
```yaml
sdks:
  - name: <sdk-a>
  - name: <sdk-b>
    plugs:
      <plug>:
        bind: <sdk-a>:<plug>
```

**Tunnel exposing a workshop service to the host (auto-connects):**
```yaml
sdks:
  - name: <service-sdk>
    slots:
      api:
        interface: tunnel
        endpoint: localhost:8080
  - name: system
    plugs:
      api:
        interface: tunnel
        endpoint: localhost:8080
```

**Tunnel exposing a host service to the workshop (manual connect required):**
```yaml
sdks:
  - name: <consumer-sdk>
    plugs:
      svc:
        interface: tunnel
        endpoint: localhost:5432
  - name: system
    slots:
      svc:
        interface: tunnel
        endpoint: localhost:5432
```
After `workshop refresh`, run: `workshop connect <workshop>/<consumer-sdk>:svc <workshop>/system:svc`.

</minimal_examples>

<source_docs>
- `reference/definition-files/workshop-definition.md` (authoritative; includes JSON Schema)
- `reference/definition-files/schema.json`
- `explanation/workshops/concepts.md`
- `how-to/customize-workshops/add-actions.md`
- `how-to/customize-workshops/forward-ports.md`
</source_docs>
