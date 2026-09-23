<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Make a workshop reachable from a remote IDE or a host browser. Since 0.9.5 the primary path for SSH-based tools needs **zero workshop-side setup**: Workshop maintains an automatic OpenSSH client configuration on the host, so Remote-SSH IDEs connect straight to the workshop's hostname. Tunnels remain the pattern for non-SSH services (HTTP, WebSocket, custom protocols) in either direction. This workflow stays generic — concrete IDEs/tools are listed in the docs as worked examples; the skill itself only teaches the pattern.
</objective>

<required_reading>
1. `references/interfaces.md` — tunnel auto-connect rules
2. `references/definition-file.md` — tunnel endpoint format
3. `references/command-cheatsheet.md` — `connect`, `connections`, `info`, `refresh`
</required_reading>

<process>

**Step 1. SSH-based remote IDEs (VS Code Remote-SSH, JetBrains Gateway, plain `ssh`): use the built-in SSH path (0.9.5+).**

Nothing to install and nothing to declare. On distros with `/etc/ssh/ssh_config.d/`, the Workshop snap installs a drop-in (`70-workshop-cert-authority.conf`) and maintains a per-user SSH certificate authority that signs a host certificate for every workshop and a user certificate for connecting — so there is no host-key prompt and no password prompt.

1. Read the hostname from `workshop info` (the `hostname:` line, `<workshop>.<project>.wp` — the host resolves `*.wp` names since 0.9.4).
2. Point the IDE's remote-SSH facility at that hostname, user `workshop`.
3. Smoke test from a host terminal: `ssh <workshop>.<project>.wp`.

Migration caveat: workshops launched before 0.9.5 must be **removed and launched again** (a refresh is not enough) to gain the automatic SSH configuration. The `vscode-remote` SDK is deprecated (0.9.5) — this built-in path replaces its reason to exist. Do not build an sshd-inside-the-workshop + tunnel rig for SSH access — that ritual is obsolete.

**Step 1a. VS Code specifically: prefer the extension, but stay honest about what it is.**

There is now a first-party extension, `canonical.workshop` (`code --install-extension canonical.workshop`). It needs VS Code 1.90+, Workshop 0.9.5+, and pulls in `ms-vscode-remote.remote-ssh`; the documented UI matches extension version 0.5.2. It is a convenience layer over the same CLI this skill already teaches — every one of its actions maps to a command you can run yourself, which is what to fall back on when the extension misbehaves:

| Extension action | CLI equivalent |
|------------------|----------------|
| Add New Workshop | `workshop init` (the wizard prints the exact line in its `Workshop` output channel) |
| Reopen in Workshop | `workshop launch` if never launched, else `workshop start`, then SSH to the workshop's hostname |
| Refresh and Reopen | `workshop refresh --wait-on-error`, then the SSH connection again |
| Continue Refresh / Abort Refresh | `workshop refresh --continue` / `workshop refresh --abort` |
| Turn Off… | `workshop remove` |
| (expanded workshop row) | `workshop info` |
| Reopen Locally / Open Definition File | no equivalent — these only move the VS Code window |

Two limits worth stating unprompted: the Add-New-Workshop wizard lists only Canonical's reference SDKs, so any other SDK goes into the definition by hand; and plain Remote-SSH to `<workshop>.<project>.wp` (Step 1) still works with no extension at all. Recommend the extension when the user is already in VS Code; don't make it a prerequisite.

**Step 2. Non-SSH services: identify the direction.**
- A workshop service the host needs (HTTP dev server, WebSocket, Jupyter) → pattern A below.
- A host-side daemon the workshop needs (database, queue, secrets agent) → pattern B below.

**Step 3. Edit the workshop definition.**

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

**Step 4. Apply.**
```
workshop refresh
```
For pattern B, also run `workshop connect ...` after the refresh — once connected, the manual connection persists across future refreshes (0.9.5+).

**Step 5. Discover the address the user should point their tool at.**
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
Tell the user to point their tool at the `from:` address (host side). Note the split: SSH goes by hostname (`<workshop>.<project>.wp`, Step 1); tunneled services go by the tunnel's `from:` address — tunnel endpoints themselves never resolve hostnames, `*.wp` included.

**Step 6. For ssh-agent forwarding (e.g., to clone private repos from inside a remote IDE session):**
- Add `plugs: ssh-agent: {}` to a regular SDK (or sketch).
- Manual connect: `workshop connect <workshop>/<sdk>:ssh-agent` — persists across refreshes (0.9.5+).
- Then ssh-agent forwarding works inside the workshop.

</process>

<verification>
```
ssh <workshop>.<project>.wp                   # SSH path: no prompts, lands in the workshop
workshop connections [<workshop>]             # tunnel(s) listed, plug↔slot manual or auto
workshop info                                 # hostname: line + tunnel `from:`/`to:` addresses
nc -zv localhost <host-port>                  # quick port liveness check from the host
```
</verification>

<anti_patterns>
- Building an sshd-SDK + tunnel rig for SSH access — obsolete since 0.9.5; the built-in SSH path needs no workshop-side setup. If `ssh <ws>.<project>.wp` fails on an old workshop, the fix is remove + launch, not sshd.
- Forgetting that pattern B (host service → workshop) requires `workshop connect`. Auto-connect does NOT apply.
- Picking a privileged host port (≤ 1023) for a system-SDK tunnel plug — rejected.
- Running another service on the chosen host port. The tunnel will fail to activate at refresh time.
- Hard-coding a specific IDE's vendor names or commands when the user only asked "how do I expose this service". Stay generic.
</anti_patterns>

<success_criteria>
- SSH-based tools reach the workshop at `<workshop>.<project>.wp` with no prompts and no workshop-side setup.
- Non-SSH services are reachable at the documented tunnel address; `workshop connections` shows the tunnel as Connected.
- The user knows whether they need a manual `workshop connect` step or not.
</success_criteria>

<source_docs>
- `how-to/develop-with-workshops/connect-vscode.md` (the extension-first VS Code guide, incl. the action-to-command table), `how-to/develop-with-workshops/run-jetbrains-gateway.md`, `how-to/develop-with-workshops/run-jupyterlab-in-browser.md` — worked examples for specific IDEs/tools; surface the matching page when the user names a vendor.
- `explanation/architecture/components.md` (Network — the SSH certificate authority and `*.wp` resolution)
- `release-notes/v0.9.5.md` (automatic OpenSSH config; remove-and-relaunch migration caveat)
- `how-to/customize-workshops/forward-ports.md`
- `explanation/interfaces/tunnel-interface.md`, `explanation/interfaces/ssh-interface.md`
</source_docs>
