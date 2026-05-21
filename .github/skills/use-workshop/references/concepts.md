<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Core conceptual model an agent must hold to operate Workshop fluently. These are the nouns the user will use; getting them right keeps your suggestions accurate.
</overview>

<core_terms>

<term name="workshop (lowercase)">
A container-based, isolated development environment defined by a single YAML blueprint. Hosted by LXD as an implementation detail (don't rely on it). Capitalized "Workshop" is the tool itself; lowercase "workshop" is an instance of an environment.
</term>

<term name="project">
The directory on the host that contains workshop definition file(s). The project directory is mounted at `/project/` inside every workshop the project defines. A `.workshop.lock` file in the project directory binds the project to its launched workshop(s).
</term>

<term name="workshop definition">
A YAML file describing how a workshop should be assembled: `name`, `base` image, `sdks:` list, optional `connections:`, optional `actions:`. Either `workshop.yaml` / `.workshop.yaml` at project root (single-workshop project), or `.workshop/<name>.yaml` files (multi-workshop project — names must match filenames). Cannot mix the two layouts.
</term>

<term name="base">
The underlying OS image of the workshop, declared as `base: ubuntu@<release>` (currently `20.04`, `22.04`, `24.04`, or `26.04`).
</term>

<term name="SDK">
A bundled, layered unit of code/data/configuration installed on top of the base. Several origins:
- **Regular SDK**: from the SDK Store, versioned with `channel:`. Default channel is `latest/stable`.
- **System SDK**: built into Workshop; named `system`; auto-installed first; provides default slots for camera, desktop, GPU, mount, ssh-agent. Cannot be removed.
- **In-project SDK**: defined under `.workshop/<NAME>/sdk.yaml` in the project directory; referenced as `project-<NAME>` in the workshop definition.
- **Try SDK**: locally available SDK produced by the SDK-authoring toolchain (out of scope here), referenced as `try-<NAME>` (no `channel`).
- **Sketch SDK**: a transient, per-workshop, single-instance SDK opened in `$EDITOR` via `workshop sketch-sdk`. Stored under `$XDG_DATA_HOME/workshop/`. Can be ejected as an in-project SDK.
</term>

<term name="interface, plug, slot, connection">
The mechanism for controlled communication and resource sharing.
- **Interface**: a predefined resource type (camera, desktop, GPU, mount, ssh-agent, tunnel). Cannot create custom types.
- **Plug**: the consumer side, declared in the SDK that wants to use the resource.
- **Slot**: the provider side; for host resources, declared on the system SDK; for workshop-internal resources, on a regular SDK.
- **Connection**: a plug bound to a slot. Auto-connected for some interfaces (mount, GPU, and tunnel under certain conditions); manual via `workshop connect` for camera, desktop, ssh-agent, and most tunnel cases.
</term>

<term name="plug binding">
A workaround for plug conflicts: when two SDKs both declare a plug for the same target, bind one plug to the other via `bind: <SDK>:<PLUG>` so they share a single underlying connection. Both bound plugs share the same `bind.N` note in `workshop connections`.
</term>

<term name="action">
A named bash script in the workshop's `actions:` section. Invoked via `workshop run <WORKSHOP> -- <ACTION> [args]`. Forwards trailing arguments as positional parameters (`"$@"`, `"$1"`, ...). Action edits do NOT require `workshop refresh` — actions are parsed at run time.
</term>

<term name="change and task">
Every mutating workshop operation produces a **change** with a numeric ID, composed of multiple **tasks** (atomic, individually reversible steps). Inspect with `workshop changes` and `workshop tasks [<ID>]`. On task failure the change auto-rolls back unless `--wait-on-error` was used at launch/refresh time.
</term>

<term name="hook">
A lifecycle script in an SDK: `setup-base` (runs once at install, becomes part of the snapshot), `setup-project` (runs per project after interfaces are connected), `save-state`/`restore-state` (bracket a refresh), `check-health` (post-launch/refresh, reports SDK health to the daemon and drives the workshop status into `Ready`/`Pending`/`Error`). Hooks are SDK-internal — operating an existing workshop, you usually only encounter them via task names in error logs.
</term>

</core_terms>

<gotchas>
- Two projects with the same workshop `name:` are independent workshops, not a shared one. `workshop list --global` shows the project path.
- `cp -r` of a project directory does not duplicate the workshop. The copy is silent until you launch in the new directory; then you have two independent workshops with the same name.
- Deleting a project directory without `workshop remove` first leaves orphaned LXD resources. See the `purge-and-recover` workflow.
- `latest/stable` channel is not necessarily either "latest" or "stable" — the SDK publisher chooses what each track means. Don't assume.
- SDKs are mounted read-only inside the workshop. Updates flow only through `workshop refresh` re-fetching the channel.
</gotchas>

<source_docs>
- `explanation/workshops/concepts.md`
- `explanation/workshops/projects.md`
- `explanation/workshops/changes-tasks.md`
- `explanation/sdks/concepts.md`
- `explanation/interfaces/concepts.md`
- `reference/definition-files/workshop-definition.md`
</source_docs>
