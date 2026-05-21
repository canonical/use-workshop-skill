<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Wire and unwire interface connections: forward ports, attach/detach mounts, share host SSH agent, expose GPU, hook up display, resolve plug conflicts via binding. Decide when manual `workshop connect` is required vs when auto-connect handles it.
</objective>

<required_reading>
1. `references/interfaces.md` — auto vs manual table, wiring decision tree
2. `references/definition-file.md` — plug/slot definition syntax, tunnel endpoint format, mount attributes
3. `references/command-cheatsheet.md` — `connect`, `disconnect`, `connections`, `remount`
4. `references/anti-patterns.md` — cross-workshop plug rejections, privileged-port limits
</required_reading>

<process>

**Step 1. Establish current wiring.**
```
workshop connections [<workshop>]      # current plug↔slot links
workshop connections --all <workshop>  # also show disconnected plugs
workshop info                          # mount sources, tunnels, etc.
```

**Step 2. Match the user's goal to an interface.**

| Goal | Interface | Default behavior |
|------|-----------|------------------|
| Share a host directory into the workshop | mount (host-source on `system:mount`) | Auto-connect if plug name matches |
| Share workshop-internal directory between SDKs | mount (workshop-source on regular SDK slot) | Auto-connect by interface match |
| Expose workshop service on the host | tunnel (slot on regular SDK, plug on `system`) | Auto-connect (system plug + matching name + non-privileged port) |
| Reach host service from inside the workshop | tunnel (slot on `system`, plug on regular SDK) | Manual: `workshop connect ...` |
| Use host GPU | gpu (plug `gpu` on regular SDK) | Auto-connect |
| Use host display (Wayland/X11) | desktop (plug `desktop` on regular SDK) | Manual |
| Use host camera | camera (plug `camera`) | Manual |
| Forward host SSH agent | ssh-agent (plug `ssh-agent`) | Manual |

**Step 3. Edit the definition where needed.**
Use `templates/workshop-with-connections.yaml` as a starting point. Common patterns:

**Expose a workshop port on the host (auto-connects):**
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
After `workshop refresh`, the host can hit `localhost:8080`.

**Reach a host service from inside (manual connect):**
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
Then:
```
workshop refresh
workshop connect <workshop>/<consumer-sdk>:svc <workshop>/system:svc
```

**Resolve a plug conflict via binding:**
```yaml
sdks:
  - name: <sdk-a>
  - name: <sdk-b>
    plugs:
      <plug>:
        bind: <sdk-a>:<plug>
```
Both plugs share the same underlying connection (visible as `bind.N` in `workshop connections`).

**Step 4. Connect manually if the interface requires it.**
```
workshop connect <workshop>/<sdk>:<plug>                       # implies system:<plug>
workshop connect <workshop>/<sdk>:<plug> :<slot>               # system slot under same workshop
workshop connect <workshop>/<sdk-a>:<plug> <workshop>/<sdk-b>:<slot>
```
The `manual` note appears in `workshop connections`.

**Step 5. Reassign a mount source.**
```
workshop remount <workshop>/<sdk>:<plug> <new-host-path>
```
Atomic if the new path is empty/non-existent on the same FS; otherwise requires the workshop to be `Stopped` (`workshop stop` first).

**Step 6. Disconnect.**
```
workshop disconnect <workshop>/<sdk>:<plug>                     # default-target
workshop disconnect <workshop>/<sdk>:<plug> --forget            # don't auto-reconnect on next refresh
workshop disconnect <workshop>/system:<slot>                    # detach all plugs from this slot
```

</process>

<verification>
```
workshop connections [<workshop>]      # confirm the plug shows the expected slot
workshop info                          # for mounts/tunnels: see addresses, host-source
workshop changes && workshop tasks     # if any of the above produced a change ID
```
For tunnels, also surface a curl or netcat one-liner the user can run on the host to confirm forwarding.
</verification>

<anti_patterns>
- Trying to connect a plug in workshop A to a slot in workshop B — rejected. Use cross-workshop tunneling via the host (see `multi-workshop-projects.md`).
- Listening on a privileged port (1–1023) for a system-SDK tunnel plug — rejected.
- Bridging UDP ↔ Unix socket — not supported. Only TCP ↔ Unix.
- Running `workshop remount` on a `Ready` workshop with a non-empty incompatible source — will require a stop first; surface that.
- Forgetting `workshop connect` after defining a manual-connect tunnel; the YAML edit alone doesn't wire it.
</anti_patterns>

<success_criteria>
- `workshop connections` shows the desired plug↔slot pair.
- `workshop info` reflects the configured mount source or tunnel address.
- The user can actually reach the resource (test with a curl, ls, ssh-add -l, etc., as appropriate).
</success_criteria>

<source_docs>
- `how-to/customize-workshops/forward-ports.md`
- `how-to/fix-workshops/resolve-plug-conflicts.md`
- `explanation/interfaces/concepts.md` and the per-interface pages
- `reference/cli/workshop-connect.md`, `reference/cli/workshop-disconnect.md`, `reference/cli/workshop-connections.md`, `reference/cli/workshop-remount.md`
</source_docs>
