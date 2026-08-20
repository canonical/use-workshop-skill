<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Define and operate multiple workshops in a single project, with cross-workshop networking by DNS name (same project) or a host bridge (for host-only services). Useful when one project has independent toolchains (e.g., separate runtimes for separate components).
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

**Step 5. Cross-workshop networking.**

**Same project — reach another workshop by name (0.9.2+).** Each workshop has a DNS name `<workshop>.<project>.wp`, and workshops in the same project resolve each other by name over the shared workshop network — no host tunnel needed. A service that `backend` listens on is reachable from `frontend` at `http://backend.<project>.wp:<port>` (or the short name `http://backend:<port>` where the base supports the DNS search domain). Read the exact name from the `hostname:` line of `workshop info`. Existing workshops need one `workshop refresh` to activate it. If `workshop info` shows a `hostname-fallback` note (0.9.3+), the preferred name couldn't be assigned (e.g. the project directory name isn't a valid DNS label) — use the ID-based name from the `hostname:` line instead.
```
workshop info backend                                   # read hostname:, e.g. backend.myproj.wp
workshop exec frontend -- curl -sf http://backend.myproj.wp:8080/health
```
This is plain DNS over the workshop network, not an interface connection — the rule that direct cross-workshop plug↔slot connections are rejected still holds. The **host** also resolves `*.wp` names (0.9.4+) — `curl http://backend.myproj.wp:8080` works from a host terminal for services listening on the workshop network, and SSH from the host is automatic (0.9.5+; see `ide-integration.md`). Tunnels remain the mechanism for publishing a service on a *host* port.

**When you still need a tunnel** — to bridge a workshop to a *host* service (a plain host process has no workshop `.wp` name, so DNS-by-name doesn't apply) — bridge through the host instead:

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
- Trying `workshop connect <a>/sdk:plug <b>/sdk:slot` across workshops — rejected (interface connections don't span workshops). For plain network traffic within the same project, use the workshop's `.wp` DNS name; bridge through the host only for host services or cross-project traffic.
- Reaching for a host tunnel to let two workshops in the *same* project talk — unnecessary in 0.9.2+; they resolve each other by name.
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
- `explanation/workshops/multi-workshop-patterns.md`
- `reference/cli/workshop.md` (launch, list, run, connect, info sections)
</source_docs>
