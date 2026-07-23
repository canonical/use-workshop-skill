<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Proven definition patterns distilled from Canonical's reference workshops.
Match the repo's shape to a pattern, then copy the YAML shape from a template
(`templates/` here or `../use-workshop/templates/`) — the snippets below show
the wiring idea, not copy-paste material.
</overview>

<patterns>

<pattern name="Dev server exposed to the host">
The serving SDK declares a tunnel slot; `system` grafts a same-named plug.
Same name + same interface + plug on `system` → auto-connects at launch.
Multiple servers = multiple pairs (one per port). Template:
`templates/workshop-dev-server.yaml`.

```yaml
sdks:
  - name: <serving-sdk>
    slots:
      webapp:
        interface: tunnel
        endpoint: localhost:<port>
  - name: system
    plugs:
      webapp:
        interface: tunnel
        endpoint: localhost:<port>
```
</pattern>

<pattern name="Shared Python venv across SDKs">
Python-ecosystem SDKs (jupyter, tooling SDKs) share the `uv` SDK's venv by
wiring their `venv` plug to `uv:venv` under `connections:` — one interpreter
and package set for every tool.

```yaml
connections:
  - plug: <python-tool-sdk>:venv
    slot: uv:venv
```
</pattern>

<pattern name="In-project SDK for repo-specific setup">
When the repo needs apt packages or setup no Store SDK provides (GUI test
libraries, simulation deps), ship an in-project SDK: `.workshop/<name>/`
with `sdk.yaml` + executable hooks, consumed as `project-<name>`. Package
list comes from the repo's CI evidence. Template: `templates/in-project-sdk/`;
authoring detail: `../use-workshop/workflows/author-in-project-sdk.md`.
</pattern>

<pattern name="Hardware-variant definitions">
When a repo supports alternative acceleration stacks (CUDA vs ROCm), ship one
definition per variant in the multi-workshop layout — `.workshop/cuda.yaml`
and `.workshop/rocm.yaml` — differing only in the accelerator SDK. The user
launches the one matching their hardware. See
`how-to/customize-workshops/use-multiple-workshops.md`.
</pattern>

<pattern name="Actions wrap the existing build system">
Reference workshops never inline build logic — actions call the repo's own
entry points (`dotnet build` in the project dir, `idf.py build`, `make -C
docs/ html`) and forward arguments with `"$@"` where useful (e.g.
`pull: ollama pull "$@"`).
</pattern>

<pattern name="Toolchain graphs via connections">
Multi-SDK toolchains (e.g. RTOS + per-architecture cross-compilers) wire
explicitly under `connections:` — each toolchain SDK exposes a slot, the
consuming SDK plugs into it. If onboarding lands here, the SDKs' own docs
(`sdk docs <name>`) define the expected wiring; copy it, don't guess it.
</pattern>

</patterns>

<live_enrichment>
Optional, never required: complete worked examples live in the
`canonical/reference-workshops` GitHub repo. It is PRIVATE — access depends on
the local `gh` auth, and the user's collaborators may not have it.

- Try: `gh api repos/canonical/reference-workshops/contents/` then fetch a
  relevant example's definition the same way.
- On ANY failure (no `gh`, 404, 403, offline): continue silently with this
  file. Do not surface the failure as a problem, do not retry, and never cite
  the repo as a resource to a user who may not have access.
</live_enrichment>

<source_docs>
- `how-to/customize-workshops/forward-ports.md`
- `how-to/customize-workshops/use-multiple-workshops.md`
- `explanation/workshops/multi-workshop-patterns.md`
- `explanation/interfaces/plugs-and-slots.md`
- `how-to/develop-with-workshops/manage-python-environments.md`
</source_docs>
