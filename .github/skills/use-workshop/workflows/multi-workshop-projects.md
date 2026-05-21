<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Define and operate multiple workshops in a single project, with optional cross-workshop networking through the host. Useful when one project has independent toolchains (e.g., separate runtimes for separate components).
</objective>

<required_reading>
1. `references/definition-file.md` — `.workshop/<name>.yaml` layout, in-project SDKs
2. `references/interfaces.md` — tunnel patterns
3. `references/command-cheatsheet.md` — `launch`/`refresh`/`stop`/`remove` with multiple names
</required_reading>

<process>

**Step 1. Switch the project to multi-workshop layout.**
You CANNOT have both a root-level `workshop.yaml` and `.workshop/*.yaml` files. If the project already has a single `workshop.yaml`, move it under `.workshop/` and rename to match a workshop name.

Target layout:
```
my-project/
├── .workshop/
│   ├── <name-a>.yaml
│   ├── <name-b>.yaml
│   └── <shared-sdk-name>/        # optional in-project SDK shared across both
│       └── sdk.yaml
├── ...
```

Each `.workshop/<name>.yaml` must have its `name:` field equal to the file basename (sans `.yaml`).

**Step 2. Write each workshop definition.**
Use `templates/workshop-multi-sdk.yaml` as a starting point. Each workshop can have a different `base:`, different SDKs, different actions. Both share the same project directory mounted at `/project/`.

**Step 3. Operate them.**
With multiple workshops in a project, the workshop name is **required** in every command — you cannot omit it.

```
workshop launch <name-a> <name-b>
workshop list
workshop run <name-a> -- <action>
workshop shell <name-a>
workshop refresh <name-a>          # one at a time
workshop stop <name-a> <name-b>
workshop remove <name-a> <name-b>  # final cleanup
```

**Step 4. Share custom tooling across workshops.**
Define an in-project SDK at `.workshop/<sdk-name>/sdk.yaml`. Reference from each workshop's `sdks:` list as `project-<sdk-name>`. After editing, refresh both workshops to apply.

**Step 5. Cross-workshop networking via tunnel-through-host.**
Direct cross-workshop plug-to-slot connections are rejected. Bridge through the host instead:

In the **provider** workshop (e.g., backend), expose the service to the host:
```yaml
sdks:
  - name: <provider-sdk>
    slots:
      <name>:
        interface: tunnel
        endpoint: localhost:<port>      # service inside the workshop
  - name: system
    plugs:
      <name>:
        interface: tunnel
        endpoint: localhost:<port>      # port on the host
```
Auto-connects.

In the **consumer** workshop (e.g., frontend), reach the host port:
```yaml
sdks:
  - name: <consumer-sdk>
    plugs:
      <name>:
        interface: tunnel
        endpoint: localhost:<port>      # where consumer connects inside its workshop
  - name: system
    slots:
      <name>:
        interface: tunnel
        endpoint: localhost:<port>      # host-side port (bridged from the provider)
```
Manual connect after refresh:
```
workshop connect <consumer-name>/<consumer-sdk>:<name>
```

The host port must be free before launching the provider workshop, or the tunnel fails to activate. Use a different port per cross-workshop tunnel.

</process>

<verification>
```
workshop list                                # both workshops show Ready
workshop connections <consumer-name>         # tunnel listed as `manual`
# from inside the consumer workshop:
workshop exec <consumer-name> -- nc -zv localhost <port>
```
After cleanup:
```
workshop list                                # empty for the project
workshop list --global                       # workshops gone everywhere
```
</verification>

<anti_patterns>
- Mixing a root `workshop.yaml` with `.workshop/*.yaml` — Workshop refuses.
- Naming the file differently from `name:` in a multi-workshop project — Workshop refuses.
- Trying `workshop connect <a>/sdk:plug <b>/sdk:slot` across workshops — rejected. Bridge through the host.
- Re-using the same host port for multiple cross-workshop tunnels — first one wins, others fail.
- Omitting the workshop name in CLI commands when the project has multiple workshops — rejected.
</anti_patterns>

<success_criteria>
- Each workshop is `Ready` and responds to its own commands.
- Cross-workshop service calls succeed (via the host bridge).
- The user understands that the workshop name is mandatory in this layout.
</success_criteria>

<source_docs>
- `how-to/customize-workshops/use-multiple-workshops.md`
- `how-to/customize-workshops/forward-ports.md`
- `explanation/workshops/projects.md`
- `reference/cli/workshop-launch.md`, `reference/cli/workshop-list.md`, `reference/cli/workshop-run.md`, `reference/cli/workshop-connect.md`
</source_docs>
