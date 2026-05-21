<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
The six interface types and how to wire them. The most important distinction at the CLI level is **auto-connect vs manual-connect**: it determines whether the agent has to issue `workshop connect` after a `launch`/`refresh` for the user's stated goal to actually work.
</overview>

<auto_vs_manual>
| Interface | Auto-connect default | Manual when |
|-----------|---------------------|-------------|
| **mount** | Yes — system→regular SDK auto, and regular→regular auto by interface match | Disconnected with `--forget`; multiple slots match the same interface |
| **GPU** | Yes (system → regular SDK plug) | — |
| **camera** | No | Always |
| **desktop** | No | Always |
| **ssh-agent** | No | Always |
| **tunnel** | Conditionally (see below) | Otherwise |

**Tunnel auto-connect** requires ALL of these:
- Plug is on the system SDK; slot is on a regular SDK.
- Plug listens on `localhost` or a Unix domain socket.
- Plug name matches the slot name.
- No host-port conflict.

If any condition fails, you must `workshop connect <plug-ref> <slot-ref>` manually.

For the security-sensitive interfaces (camera, desktop, ssh-agent), Workshop refuses to connect them on its own. The user has to opt in explicitly.
</auto_vs_manual>

<interface name="mount">
**Use for:** sharing files between host and workshop, or between SDKs in the same workshop. Persistent across operations.

**Slot side:**
- `system:mount` is the only mount slot that can expose **host** filesystem locations. Its `host-source` attribute is dynamic and is set with `workshop remount`.
- Regular SDKs may declare additional mount slots but only with `workshop-source` — paths inside the workshop.

**Plug side:** declared on a regular SDK (never on system). Required attribute `workshop-target` — absolute path in the workshop. Optional `mode`, `uid`, `gid`, `read-only`.

**Conflict resolution:** if two SDKs both declare a plug for the same target, bind one to the other with `bind: <SDK>:<PLUG>` so they share a single connection (note: `bind.N` in `workshop connections`).

**Reassign source:** `workshop remount <WORKSHOP>/<SDK>:<PLUG> <SOURCE>` — atomic if the new source is empty/non-existent on the same filesystem; otherwise requires `Stopped` status.
</interface>

<interface name="GPU">
**Use for:** GPU-accelerated workloads. Direct device pass-through to the workshop.

**Slot:** `system:gpu` only.
**Plug:** must be named `gpu`, cannot belong to the system SDK, no attributes.
**Connect:** automatic at launch/refresh; nothing for the agent to do.
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
**Connect:** manual.
</interface>

<interface name="ssh-agent">
**Use for:** delegating SSH authentication to the host's `ssh-agent` (e.g., to clone private repos, reach remote machines).

**Slot:** `system:ssh-agent` only.
**Plug:** must be named `ssh-agent`, cannot belong to the system SDK.
**Connect:** manual.
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
- **Host service → workshop:** slot on the system SDK (host service), plug on the regular SDK (where the consumer in the workshop will connect). Manual connect required.
- **Cross-workshop:** chain two tunnels through the host. Backend exposes via system plug; frontend consumes via system slot. The frontend half typically requires `workshop connect`.

**Constraints:**
- System-SDK plugs cannot listen on privileged ports (1–1023) or on Unix sockets outside `$HOME` / `$XDG_RUNTIME_DIR`.
- TCP↔Unix bridging works; UDP↔Unix does not.
- The host port must be free before launch/refresh, or the tunnel fails to activate.
</interface>

<wiring_decision_tree>
**User wants to expose a workshop service on the host:**
- Add `slots: <name>: { interface: tunnel, endpoint: localhost:<PORT> }` to the SDK that runs the service.
- Add `plugs: <name>: { interface: tunnel, endpoint: localhost:<PORT> }` under `system`.
- `workshop refresh`. Auto-connects.

**User wants the workshop to reach a host service:**
- Add `plugs: <name>: { interface: tunnel, endpoint: localhost:<PORT> }` to the consumer SDK.
- Add `slots: <name>: { interface: tunnel, endpoint: localhost:<PORT> }` under `system`.
- `workshop refresh` + `workshop connect <workshop>/<sdk>:<name> <workshop>/system:<name>`.

**User asks for SSH-agent forwarding (e.g., to clone a private repo from inside):**
- Ensure the SDK declares `plugs: ssh-agent`.
- Run `workshop connect <workshop>/<sdk>:ssh-agent`.

**User asks for GUI / display:**
- Ensure the SDK declares `plugs: desktop`.
- Run `workshop connect <workshop>/<sdk>:desktop`.

**User mentions GPU:**
- Make sure the SDK declares `plugs: gpu`. Auto-connect, no manual step.

**User has a plug-conflict error at launch:**
- Bind one plug to the other under the second SDK's `plugs:` map.
</wiring_decision_tree>

<source_docs>
- `explanation/interfaces/concepts.md`
- `explanation/interfaces/{camera,desktop,gpu,mount,ssh,tunnel}-interface.md`
- `reference/definition-files/workshop-definition.md`
- `how-to/customize-workshops/forward-ports.md`
- `how-to/fix-workshops/resolve-plug-conflicts.md`
</source_docs>
