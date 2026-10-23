<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
The eight interface types and how to wire them. The most important distinction at the CLI level is **auto-connect vs manual-connect**: it determines whether the agent has to issue `workshop connect` after a `launch`/`refresh` for the user's stated goal to actually work.
</overview>

<model>
A workshop is a graph of capabilities wired through two named endpoints that both reference an **interface** type:
- **slot** = the provider end (exposes a capability of that interface type). Host-rooted capabilities (camera, a host directory, the host ssh-agent) can only be exposed by the **system SDK**; a regular SDK can expose only workshop-internal directories/endpoints. Concretely, a regular SDK may define slots for **`mount` and `tunnel` only** — slots for every other interface are built into the `system` SDK and cannot be added to it under another name. The exception is **`secret`** (0.9.8+): its slots exist only on the `system` SDK too, but the user *adds* them in the workshop definition, under any name, one per keyring lookup (see the `secret` section).
- **plug** = the consumer end (declared on the SDK that wants the capability).
- **connection** = a plug joined to a slot. At launch/refresh Workshop auto-connects each plug to a same-interface slot **where the interface policy allows it** (see `<auto_vs_manual>`); otherwise you wire it with `workshop connect`. Persistence (0.9.5+): manual connections survive `workshop refresh` (while their plugs/slots still exist in the definition, and — 0.9.8+ — while the parts of their definition that the connection depends on stay the same: a tunnel's `endpoint`, a custom-device plug's filter, a secret slot's lookup; a change there drops the connection with a `workshop warnings` entry), and a manual `workshop disconnect` without `--forget` stays disconnected across refreshes; `workshop restore` resets everything to auto-connect defaults. Two YAML mechanisms shape the topology in the workshop definition (mutually exclusive for a given plug): an inline `bind:` (delegate one plug to another, resolving same-target conflicts) and a top-level `connections:` list (pair a specific plug with a specific slot — e.g. to reach a regular-SDK slot instead of the system default; the pairing must still satisfy the interface's auto-connect policy, so manual-only interfaces cannot be wired this way). Full model: `explanation/interfaces/plugs-and-slots.md`.
</model>

<auto_vs_manual>
**The VM runtime narrows this table to two rows.** A `runtime: lxd-vm` workshop supports only `mount` and `secret` (0.9.9): those auto-connect and persist as below, while every other interface's plugs and slots are skipped with an `incompatible plugs` warning and cannot be connected at all. Through 0.9.8 a VM skipped auto-connect entirely. On LXD `6/stable` a VM cannot carry SDKs, so it has no plugs to wire in the first place. See `references/runtime.md`.

| Interface | Auto-connect default | Manual when |
|-----------|---------------------|-------------|
| **mount** | Yes, but **to system-SDK slots only** | A regular-SDK mount slot is the target — it is NOT auto-connected; pair it explicitly with a top-level `connections:` entry |
| **GPU** | Yes (system → regular SDK plug) | — |
| **camera** | No | Always |
| **desktop** | No | Always |
| **ssh-agent** | No | Always |
| **custom-device** | No | Always (security) |
| **secret** | **Never** — not even through `connections:` | Always (0.9.8+) |
| **tunnel** | Conditionally (see below) | Otherwise |

**Tunnel auto-connect** requires ALL of these:
- Plug is on the system SDK; slot is on a regular SDK.
- Plug listens on `localhost` or a Unix domain socket.
- Plug name matches the slot name.
- No host-port conflict.

If any condition fails, you must `workshop connect <plug-ref> <slot-ref>` manually.

For the security-sensitive interfaces (camera, desktop, ssh-agent, custom-device, secret), Workshop refuses to connect them on its own. The user has to opt in explicitly — with `workshop connect`, since a `connections:` pair is still bound by this policy (for `secret` it is accepted without error and leaves the plug unconnected).

**Connection maintenance (0.9.8+).** A refresh drops a preserved manual connection whose definition changed in a way that matters — tunnel: either end's `endpoint`; custom-device: the plug's filter attributes; secret: the slot's `attributes` or `collection`. It warns (`disconnected "<plug>" from "<slot>" because its definition changed`, via `workshop warnings`), and the fix is to connect again. Mount, camera, desktop, GPU and ssh-agent connections are always kept. So "my tunnel / secret stopped working after I edited the definition" is expected: reconnect.
</auto_vs_manual>

<interface name="mount">
**Use for:** sharing files between host and workshop, or between SDKs in the same workshop. Persistent across operations.

**Slot side:**
- `system:mount` is the only mount slot that can expose **host** filesystem locations. Its `host-source` attribute is dynamic and is set with `workshop remount`.
- Regular SDKs may declare additional mount slots but only with `workshop-source` — paths inside the workshop.

**Plug side:** declared on a regular SDK (never on system). Required attribute `workshop-target` — absolute path in the workshop. Optional ownership/permission attributes, applied **only when Workshop creates** `workshop-target` (an existing path keeps its ownership): `uid`/`gid` (default `1000` when `workshop-target` is under `/home/workshop`, `/project`, or `/run/user/1000`, else `0`; `gid` follows the same path rule even when `uid` is set explicitly), `mode` (octal; defaults `0o775` when the owner is uid 1000, else `0o755`), `read-only` (default `false`). See `how-to/develop-sdks/configure-mount.md`.

**Auto-connect target:** a mount plug auto-connects to the **system SDK's** mount slot. To read from a *regular* SDK's mount slot instead, name the pair in the workshop definition's top-level `connections:` (it won't auto-connect).

**Where the bytes live when no source is set:** a mount plug needs no `host-source` to be useful. Left unset, Workshop allocates a directory for the plug on the **host** — under `~/.local/share/workshop/id/<PROJECT-ID>/<WORKSHOP>/mount/<SDK>/<PLUG>/` — and bind-mounts it at `workshop-target`. The contents therefore survive `workshop start`, `stop`, and **`refresh`**, which is the point: a refresh discards the workshop's writable filesystem, so anything expensive to rebuild (an out-of-tree build tree, a `ccache`/`sccache` directory, a model cache) is kept by giving it a mount plug rather than a `save-state`/`restore-state` hook pair. See `how-to/customize-workshops/add-mounts.md`.

**Conflict resolution:** if two SDKs both declare a plug for the same target, bind one to the other with `bind: <SDK>:<PLUG>` so they share a single connection (note: `bind.N` in `workshop connections`).

**Reassign source:** `workshop remount <WORKSHOP>/<SDK>:<PLUG> <SOURCE>` — atomic if the new source is empty/non-existent on the same filesystem; otherwise requires `Stopped` status.
</interface>

<interface name="GPU">
**Use for:** GPU-accelerated workloads. Direct device pass-through to the workshop.

**Slot:** `system:gpu` only.
**Plug:** must be named `gpu`, cannot belong to the system SDK, no attributes.
**Connect:** automatic at launch/refresh; nothing for the agent to do.
**Device-group fix (0.9.2):** Workshop now adds the `workshop` user to the relevant device groups (e.g. `render`), restoring access to devices like `/dev/kfd` on `ubuntu@26.04`. If GPU device access fails on a workshop created before 0.9.2, `workshop refresh` applies the fix.
</interface>

<interface name="camera">
**Use for:** access to host video capture devices (`/dev/video*`, `/dev/media*`).

**Slot:** `system:camera` only.
**Plug:** must be named `camera`, cannot belong to the system SDK.
**Connect:** manual: `workshop connect <WORKSHOP>/<SDK>:camera`.
</interface>

<interface name="desktop">
**Use for:** GUI applications inside the workshop using the host's Wayland/X11 socket.

**Slot:** `system:desktop` only.
**Plug:** must be named `desktop`, cannot belong to the system SDK.
**Connect:** manual. Supported on WSL too (0.9.5+, subject to an outstanding upstream WSL bug).
</interface>

<interface name="ssh-agent">
**Use for:** delegating SSH authentication to the host's `ssh-agent` (e.g., to clone private repos, reach remote machines). (Distinct from SSH *into* the workshop, which needs no interface at all — 0.9.5+ ships automatic OpenSSH client config; see `workflows/ide-integration.md`.)

**Slot:** `system:ssh-agent` only.
**Plug:** must be named `ssh-agent`, cannot belong to the system SDK.
**Connect:** manual — and once connected it persists across `workshop refresh` (0.9.5+); no re-connect ritual after each refresh.
**What it shares:** the host agent's *identities* — the private keys stay with the agent on the host, and the host's SSH configuration files are not shared. But **any process in the workshop** can ask the host agent to authenticate with those identities, not just the SDK that declared the plug. Disconnect it when it isn't needed, and always before an autonomous coding agent starts in the workshop.
</interface>

<interface name="custom-device">
**Use for:** arbitrary host devices that no dedicated interface covers, identified by their kernel **subsystem** — serial adapters (`tty`), input devices (`input`), USB peripherals (`usb`), accelerators, etc. Typical for hardware testing and embedded development.

**Slot:** `system:custom-device` only (the slot is always named `custom-device`).
**Plug:** declared on a regular SDK (never on system); name is freeform. Attributes: `subsystem`, `vendorid` (0.9.3+), `productid` (0.9.3+) — each optional, but at least one must be set; `productid` also requires `vendorid` (a product ID is only meaningful within a vendor's namespace). Quote IDs so they parse as strings.

```yaml
plugs:
  <PLUG-NAME>:
    interface: custom-device
    subsystem: <SUBSYSTEM>     # e.g. tty, input, usb
    # vendorid: "0403"         # optional (0.9.3+); narrow to one vendor
    # productid: "6001"        # optional (0.9.3+); requires vendorid
```

To find a device's attributes on the host: `udevadm info --query=property --property=SUBSYSTEM --property=ID_VENDOR_ID --property=ID_MODEL_ID <DEVICE-PATH>` — `vendorid` matches `ID_VENDOR_ID`, `productid` matches `ID_MODEL_ID`. A bare `subsystem: tty` exposes every serial device on the host; narrow with `vendorid`/`productid` when the workshop needs just one adapter.

**Connect:** manual, always (never auto-connects, for security):
`workshop connect <WORKSHOP>/<SDK>:<PLUG-NAME> :custom-device`.

**Live tracking:** while connected, ALL host devices matching the plug's attributes are visible inside the workshop; devices plugged in or removed on the host appear and disappear inside the workshop accordingly.
</interface>

<interface name="tunnel">
**Use for:** sharing TCP/UDP ports or Unix domain sockets between workshop ↔ host or across workshops via the host.

**Plug = listening side; slot = service side.** Workshop forwards every connection that reaches the plug address to the slot address.

**Endpoints** (see `definition-file.md` for full grammar):
- `localhost:<PORT>/tcp` (default protocol is `tcp`)
- `localhost:<PORT>/udp`
- `/absolute/path.sock` (Unix domain socket; `$HOME`, `$XDG_RUNTIME_DIR` expand)
- `'@name'` (abstract socket; quote in YAML)

**Direction patterns:**
- **Workshop service → host:** slot on the regular SDK (service inside the workshop), plug on the system SDK (host port). Auto-connects.
- **Workshop service → other machines on the network:** same shape, but the system plug listens on `endpoint: 0.0.0.0:<PORT>` (or another non-loopback address). A non-loopback plug **never auto-connects** — run `workshop connect` after refresh — and carries two warnings for the user: the tunnel adds no authentication (whatever listens is exposed as-is), and the host firewall may need the port opened.
- **Host service → workshop:** slot on the system SDK (host service), plug on the regular SDK (where the consumer in the workshop will connect). Manual connect required.
- **Cross-workshop:** chain two tunnels through the host. Backend exposes via system plug; frontend consumes via system slot. The frontend half typically requires `workshop connect`. (Same-project workshops can often skip tunnels entirely and use `*.wp` hostnames — but tunnel endpoints themselves never resolve hostnames.)

**Constraints:**
- System-SDK plugs cannot listen on privileged ports (1–1023) or on Unix sockets outside `$HOME` / `$XDG_RUNTIME_DIR`.
- TCP↔Unix bridging works; UDP↔Unix does not.
- The host port must be free before launch/refresh, or the tunnel fails to activate.
</interface>

<interface name="secret">
**Use for:** giving an SDK a credential (API key, token) from the user's host keyring at runtime, without writing the value anywhere (0.9.8+). Full user-side procedure, errors and exposure: `references/secrets.md`.

**Plug:** declared by a regular SDK (any name, no attributes) — the SDK's documentation names it. Never on the system SDK.
**Slot:** added by the user under `system` in the workshop definition, any name, carrying only the keyring lookup — `attributes` (≥1 string-valued pair; must match exactly one item) and optional `collection`:
```yaml
sdks:
  - name: system
    slots:
      openai-key:
        interface: secret
        attributes:
          service: openai
          account: work
```
**Connect:** always `workshop connect <WS>/<SDK>:<PLUG> <WS>/system:<SLOT>` (one argument when the slot has the plug's name). Never automatic; `connections:` can't do it. Survives refresh until the slot's lookup changes. Inside the workshop the secret is `<SDK>.<PLUG>` (bare SDK name) and is read with `workshopctl get-secret <SDK>.<PLUG>`.
**Exposure:** a connected secret is available to the **whole workshop**, not just the declaring SDK. Needs a desktop keyring session on the host (Secret Service over D-Bus). Works in a VM workshop since 0.9.9 (`workshopctl` reaches the daemon over vsock); not through 0.9.8.
</interface>

<wiring_decision_tree>
**User wants to expose a workshop service on the host:**
- Add `slots: <name>: { interface: tunnel, endpoint: localhost:<PORT> }` to the SDK that runs the service.
- Add `plugs: <name>: { interface: tunnel, endpoint: localhost:<PORT> }` under `system`.
- `workshop refresh`. Auto-connects.

**User wants a workshop service reachable from other machines (LAN/network):**
- Slot on the service SDK as above; system plug with `endpoint: 0.0.0.0:<PORT>`.
- `workshop refresh` + `workshop connect` (non-loopback never auto-connects). Warn: no built-in auth; host firewall may need opening.

**User wants the workshop to reach a host service:**
- Add `plugs: <name>: { interface: tunnel, endpoint: localhost:<PORT> }` to the consumer SDK.
- Add `slots: <name>: { interface: tunnel, endpoint: localhost:<PORT> }` under `system`.
- `workshop refresh` + `workshop connect <workshop>/<sdk>:<name> <workshop>/system:<name>`.

**User wants an SDK to have an API key or token (OpenAI, GitHub, Anthropic…):**
- If the SDK declares a `secret` plug: store the value with `secret-tool store …`, add a `secret` slot under `system` with matching `attributes`, `workshop refresh`, then `workshop connect <workshop>/<sdk>:<plug> <workshop>/system:<slot>` and check with `workshopctl get-secret … | wc -c`. See `references/secrets.md`.
- For a one-off command, or an SDK without a secret plug: `KEY=$(secret-tool lookup …) workshop exec --env KEY <workshop> -- <command>`.
- Never write the value into the definition, an action, `.envrc`, or a profile.

**User asks for SSH-agent forwarding (e.g., to clone a private repo from inside):**
- Ensure the SDK declares `plugs: ssh-agent`.
- Run `workshop connect <workshop>/<sdk>:ssh-agent`.

**User asks for GUI / display:**
- Ensure the SDK declares `plugs: desktop`.
- Run `workshop connect <workshop>/<sdk>:desktop`.

**User mentions GPU:**
- Make sure the SDK declares `plugs: gpu`. Auto-connect, no manual step.

**User wants host devices no dedicated interface covers (serial/tty, input, usb, accelerators):**
- Add `plugs: <name>: { interface: custom-device, subsystem: <SUBSYSTEM> }` to the SDK — at least one of `subsystem`/`vendorid`/`productid` (0.9.3+); `productid` requires `vendorid`.
- `workshop refresh` + `workshop connect <workshop>/<sdk>:<name> :custom-device` (never auto-connects).

**User wants an SDK to read a mount from another (regular) SDK, not the host/system default:**
- Add a top-level `connections:` entry pairing `consumer-sdk:<plug>` with `provider-sdk:<slot>` — a regular-SDK mount slot does not auto-connect. Both references take the bare SDK name, even for a `try-`/`project-` SDK (see `definition-file.md`).

**User wants to set ownership/permissions on a mounted directory:**
- Add `uid`/`gid`/`mode`/`read-only` to the mount plug (see the mount section); they apply only when Workshop creates the target.

**User has a plug-conflict error at launch:**
- Bind one plug to the other under the second SDK's `plugs:` map.
</wiring_decision_tree>

<source_docs>
- `explanation/interfaces/concepts.md`
- `explanation/interfaces/plugs-and-slots.md` (plug/slot/connection model, auto-connection policy, `bind:` vs `connections:`)
- `explanation/interfaces/{camera,custom-device,desktop,gpu,mount,secret,ssh,tunnel}-interface.md`
- `how-to/develop-with-workshops/provide-secrets.md` (secret slot, manual connect, troubleshooting)
- `release-notes/v0.9.8.md` (the `secret` interface; connections dropped when a definition changes)
- `reference/definition-files/workshop-definition.md`
- `how-to/develop-sdks/declare-plugs-slots.md`
- `how-to/develop-sdks/configure-mount.md` (mount ownership: `uid`/`gid`/`mode`/`read-only`)
- `how-to/develop-sdks/share-content-between-sdks.md` (mount slot/plug between two SDKs)
- `how-to/customize-workshops/add-mounts.md`
- `how-to/customize-workshops/use-host-devices.md` (custom-device end to end: discover attributes, declare, connect)
- `how-to/customize-workshops/forward-ports.md`
- `how-to/fix-workshops/resolve-plug-conflicts.md`
</source_docs>
