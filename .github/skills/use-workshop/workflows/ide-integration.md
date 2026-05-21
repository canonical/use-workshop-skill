<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Make a workshop reachable from a remote IDE or a host browser. Two general patterns cover essentially all such cases: (a) tunnel a workshop service (HTTP, SSH, custom protocol) to a host port; (b) tunnel a host service into the workshop. This workflow stays generic — concrete IDEs/tools are listed in the docs as worked examples; the skill itself only teaches the pattern.
</objective>

<required_reading>
1. `references/interfaces.md` — tunnel auto-connect rules
2. `references/definition-file.md` — tunnel endpoint format
3. `references/command-cheatsheet.md` — `connect`, `connections`, `info`, `refresh`
</required_reading>

<process>

**Step 1. Identify the protocol the IDE/tool speaks.**
- HTTP / WebSocket → tunnel (TCP port).
- SSH (e.g., remote-shell IDEs) → tunnel from a workshop SSH port to a host TCP port + an SDK that runs `sshd` inside.
- A host-side daemon the workshop needs (database, queue, secrets agent) → reverse tunnel into the workshop.

**Step 2. Edit the workshop definition.**

**A) Make a workshop service reachable from the host:**
```yaml
sdks:
  - name: <service-sdk>
    slots:
      <name>:
        interface: tunnel
        endpoint: localhost:<workshop-port>
  - name: system
    plugs:
      <name>:
        interface: tunnel
        endpoint: localhost:<host-port>
```
Auto-connects when the names match and the host port is non-privileged and free.

**B) Reach a host service from the workshop:**
```yaml
sdks:
  - name: <consumer-sdk>
    plugs:
      <name>:
        interface: tunnel
        endpoint: localhost:<workshop-port>
  - name: system
    slots:
      <name>:
        interface: tunnel
        endpoint: localhost:<host-port>
```
Manual connect required:
```
workshop connect <workshop>/<consumer-sdk>:<name> <workshop>/system:<name>
```

**Step 3. Apply.**
```
workshop refresh
```
For pattern B, also run `workshop connect ...` after the refresh.

**Step 4. Discover the address the user should point their tool at.**
```
workshop info
```
The output's `tunnels:` section reports both ends of each established tunnel:
```
sdks:
  system:
    tunnels:
      <name>:
        from: 127.0.0.1:<host-port>/tcp
        to:   localhost:<workshop-port>/tcp
```
Tell the user to point their tool at the `from:` address (host side).

**Step 5. For SSH-based remote IDEs:**
- The workshop SDK (or sketch SDK) must run `sshd` inside.
- Expose its port via the auto-connect tunnel pattern (A).
- The user connects their IDE to `<host>:<host-port>` as the `workshop` user (the default non-privileged user).

**Step 6. For ssh-agent forwarding (e.g., to clone private repos from inside a remote IDE session):**
- Add `plugs: ssh-agent: {}` to a regular SDK (or sketch).
- Manual connect: `workshop connect <workshop>/<sdk>:ssh-agent`.
- Then ssh-agent forwarding works inside the workshop.

</process>

<verification>
```
workshop connections [<workshop>]            # tunnel(s) listed, plug↔slot manual or auto
workshop info                                 # tunnel `from:`/`to:` addresses
nc -zv localhost <host-port>                  # quick port liveness check from the host
```
For SSH-based access, recommend `ssh -p <host-port> workshop@localhost` as the smoke test.
</verification>

<anti_patterns>
- Forgetting that pattern B (host service → workshop) requires `workshop connect`. Auto-connect does NOT apply.
- Picking a privileged host port (≤ 1023) for a system-SDK tunnel plug — rejected.
- Running another service on the chosen host port. The tunnel will fail to activate at refresh time.
- Hard-coding a specific IDE's vendor names or commands when the user only asked "how do I expose this service". Stay generic.
</anti_patterns>

<success_criteria>
- The IDE / tool / browser can reach the workshop service at the documented host address.
- `workshop connections` shows the tunnel as Connected.
- The user knows whether they need a manual `workshop connect` step or not.
</success_criteria>

<source_docs>
- `how-to/customize-workshops/forward-ports.md`
- `how-to/develop-with-workshops/` — worked examples for specific IDEs and tools live here; surface the matching `.md` to the user when they ask about a particular vendor.
- `explanation/interfaces/tunnel-interface.md`, `explanation/interfaces/ssh-interface.md`
</source_docs>
