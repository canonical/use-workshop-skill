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
| Share a host directory into the workshop | mount (host-source on `system:mount`) | Auto-connects to the system mount slot |
| Share workshop-internal directory between SDKs | mount (workshop-source on regular SDK slot) | **Not** auto-connected — pair the plug with the slot via a top-level `connections:` entry |
| Expose workshop service on the host | tunnel (slot on regular SDK, plug on `system`) | Auto-connect (system plug + matching name + non-privileged port) |
| Reach host service from inside the workshop | tunnel (slot on `system`, plug on regular SDK) | Manual: `workshop connect ...` |
| Expose a workshop service to other machines on the network | tunnel (slot on regular SDK, plug on `system` with `endpoint: 0.0.0.0:<port>`) | Manual (non-loopback never auto-connects); warn: no built-in auth, host firewall may need the port opened |
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

**Wire a mount plug to a specific (regular-SDK) slot — top-level `connections:`:**
```yaml
sdks:
  - name: <provider-sdk>     # exposes a mount slot
  - name: <consumer-sdk>     # has the mount plug
connections:
  - plug: <consumer-sdk>:<plug>
    slot: <provider-sdk>:<slot>
```
A regular-SDK mount slot does not auto-connect (auto-connect targets the system mount slot), so name the pairing explicitly. `bind:` and a top-level `connections:` entry are mutually exclusive for a given plug.

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
workshop connect <workshop>/<sdk-a>:<plug> <workshop>/<sdk-b>  # slot chosen by the plug's interface (errors if ambiguous)
```
The `manual` note appears in `workshop connections`.

**Persistence (0.9.5+):** a manual connection survives `workshop refresh` for as long as its plug and slot still exist in the definition — no re-connect ritual after each refresh. What resets wiring to the definition's auto-connect defaults is `workshop restore` (drops manual connects, re-establishes manual disconnects regardless of `--forget`, resets remount sources) — or `workshop remove` + `launch`, which starts from scratch.

**Step 5. Reassign a mount source.**
```
workshop remount <workshop>/<sdk>:<plug> <new-host-path>
```
Atomic if the new path is empty/non-existent on the same FS; otherwise requires the workshop to be `Stopped` (`workshop stop` first).

**Step 6. Disconnect.**
```
workshop disconnect <workshop>/<sdk>:<plug>                     # sticky: stays disconnected across refresh (0.9.5+)
workshop disconnect <workshop>/<sdk>:<plug> --forget            # temporary: auto-connect re-establishes it at next refresh
workshop disconnect <workshop>/system:<slot>                    # detach all plugs from this slot
```
(The `--forget` naming is easy to invert: it *forgets the disconnect*, so the plug comes back. `workshop restore` reconnects either way. `disconnect --forget` + `refresh` is also the recipe to reset a `remount`ed plug to its default source.)

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
- `explanation/interfaces/plugs-and-slots.md` (auto-connection policy; `bind:` vs `connections:`)
- `how-to/develop-sdks/declare-plugs-slots.md`
- `how-to/customize-workshops/use-host-devices.md` (custom-device wiring end to end)
- `how-to/customize-workshops/forward-ports.md`
- `how-to/fix-workshops/resolve-plug-conflicts.md`
- `explanation/interfaces/concepts.md` and the per-interface pages
- `reference/cli/workshop.md` (connect, disconnect, connections, remount sections)
</source_docs>
