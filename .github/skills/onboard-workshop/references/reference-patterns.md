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
and package set for every tool. (0.9.4+: `uv` creates the venv in
`setup-base`, so consumers no longer depend on SDK listing order.)

```yaml
connections:
  - plug: <python-tool-sdk>:venv
    slot: uv:venv
```
</pattern>

<pattern name="In-project SDK for repo-specific setup">
When the repo needs apt packages or setup no Store SDK provides (GUI test
libraries, simulation deps), ship an in-project SDK: `.workshop/<name>/`
with `sdk.yaml` + `hooks/`, consumed as `project-<name>`. Package
list comes from the repo's CI evidence. Template: `templates/in-project-sdk/`;
authoring detail: `../use-workshop/workflows/author-in-project-sdk.md`.
</pattern>

<pattern name="Build tree and cache survive a refresh">
Compiled projects keep their build directory and compiler cache OUT of
`/project/` and give each one a `mount` plug. An unsourced mount plug is
backed by a host directory Workshop allocates, so both survive `workshop
refresh` — which discards the workshop's writable filesystem and would
otherwise throw away a full build tree and a warm ccache. The project mount
stays what it should be: the developer's git worktree, free of build output.

```yaml
plugs:
  build:
    interface: mount
    workshop-target: /home/workshop/build
  ccache:
    interface: mount
    workshop-target: /home/workshop/.cache/ccache
```

Actions then configure and build against that path (`cmake -B $HOME/build`).
See `how-to/customize-workshops/add-mounts.md`.
</pattern>

<pattern name="Graphical application the developer actually runs">
A project that draws on screen — compositor, desktop shell, GTK/Qt/SDL app —
needs more than a compile. The in-project SDK declares a `desktop` plug so the
built binary can run against the host's display, and a `gpu` plug when
rendering is hardware-accelerated. `gpu` auto-connects; `desktop` does not, so
the handoff must include `workshop connect <workshop>/<sdk>:desktop`.
Distinguish this from a GUI *test* host (Electron/xvfb, see
`references/toolchain-signals.md`): there the display is scaffolding for the
test runner, here it is the product.

```yaml
plugs:
  desktop:
    interface: desktop
  gpu:
    interface: gpu
```

See `explanation/interfaces/desktop-interface.md` and
`explanation/interfaces/gpu-interface.md`.
</pattern>

<pattern name="Variant definitions (hardware or series)">
When a repo targets alternatives that cannot coexist in one definition, ship
one definition per variant in the multi-workshop layout, differing only in the
axis that varies. Two common axes: acceleration stack (`.workshop/cuda.yaml`
and `.workshop/rocm.yaml`, differing in the accelerator SDK) and Ubuntu series
(`.workshop/noble.yaml` and `.workshop/jammy.yaml`, differing in `base:`) when
CI builds the project for more than one release. They share one in-project SDK
by listing `project-<name>` in each. The user launches the one they need — and
with several definitions in a project, the workshop name becomes required in
every command. See `how-to/customize-workshops/use-multiple-workshops.md`.
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
consuming SDK plugs into it. If onboarding lands here, the SDK's own
documentation defines the expected wiring — `sdk info <name>` (metadata,
channels, website) plus the SDK's Store/README docs; copy it, don't guess
it. (The `sdk` CLI has exactly `find`/`info`/`list` — there is no
`sdk docs` subcommand.)
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
- `how-to/customize-workshops/add-mounts.md`
- `how-to/customize-workshops/use-multiple-workshops.md`
- `explanation/interfaces/desktop-interface.md`
- `explanation/interfaces/gpu-interface.md`
- `explanation/workshops/multi-workshop-patterns.md`
- `explanation/interfaces/plugs-and-slots.md`
- `how-to/develop-with-workshops/manage-python-environments.md`
</source_docs>
