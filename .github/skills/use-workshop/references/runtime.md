<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
The runtime is the sandbox technology a workshop runs in: `lxd-container` (the default, and the supported choice) or `lxd-vm`. The VM runtime is **experimental** — it is gated behind a snap option and an LXD channel switch, it is not at feature parity with a container, and a VM costs materially more memory and disk. Reach for it only when the workshop itself has to run LXD containers and VMs (a VM has a real kernel, so nesting works natively and Workshop does not set `security.nesting`), or when the user wants a harder *kernel* boundary and understands what that boundary does not cover (see `<boundary>`).

Read this before answering any question about `runtime:`, `workshop init --runtime`, the `runtime:` line in `workshop info`, or a 0.9.7-era `confinement:` key. Assume the container runtime everywhere else in this skill — every other reference and workflow describes container behavior.
</overview>

<renamed_in_0_9_8>
Workshop 0.9.8 replaced the 0.9.7 keyword. Map old to new:

| 0.9.7 | 0.9.8+ |
|-------|--------|
| `confinement: container` | `runtime: lxd-container` (or omit the key) |
| `confinement: virtual-machine` | `runtime: lxd-vm` |
| `workshop init <NAME> --vm` | `workshop init <NAME> --runtime lxd-vm` |
| `confinement:` line in `workshop info` | `runtime:` line |

**A leftover `confinement:` key fails the launch (0.9.9+).** The workshop definition is strictly validated since 0.9.9 (see `references/definition-file.md`), so the old key is rejected up front (verified on 0.9.9):

```
error: cannot launch "dev": invalid file "<path>/workshop.yaml": workshop definition YAML contains unknown fields: "confinement" at line 3, column 14
```

The fix is to rename the key to `runtime: lxd-vm` — **not** to delete the line, which silently turns the intended VM into a container. On 0.9.8 the same key raised no error at all: it was ignored, the workshop launched as an ordinary container, and `workshop info` reported `runtime:   lxd-container` (verified on 0.9.8). So when a 0.9.8 user says "my VM definition launches a container now", the cause and the rename are the same. For an already-launched workshop the rename also means remove and relaunch, because the runtime is fixed at launch (see `<limitations>`).

The old flag fails loudly instead: `workshop init dev --vm` → `Error: unknown flag: --vm`.
</renamed_in_0_9_8>

<prerequisites>
Two host-level changes come before any VM workshop. Both are the user's call, so state the cost of each before giving the command.

1. **LXD from `6/edge`**, on a host with hardware virtualization:

   ```
   sudo snap refresh --channel=6/edge lxd
   ```

   The switch is **host-wide** — it applies to every container workshop on the machine too — the `edge` channel carries unreleased LXD builds, and **LXD doesn't support moving back from `6/edge` to `6/stable`**. Say this before the user runs it; never present it as a routine step. On `6/stable`, a VM workshop with no SDKs still launches, but one that declares any SDK is refused (see `<limitations>`).

2. **The experimental opt-in.** Until the host opts in, launching a VM workshop is refused (verified on 0.9.8):

   ```
   error: cannot launch "<NAME>": runtime "lxd-vm" is experimental
   To opt in: "sudo snap set workshop workshop.experimental-vms=1 && sudo snap restart workshop.workshopd"
   ```

   Run **both** commands — the daemon restart is part of the opt-in, not a follow-up that can be deferred:

   ```
   sudo snap set workshop workshop.experimental-vms=1
   sudo snap restart workshop.workshopd
   ```

Answering "how do I opt in" does not mean endorsing the VM. In the same answer, say plainly that `lxd-container` is the default and the supported choice, and that the user can simply drop the `runtime:` line if they don't need nested LXD or a harder kernel boundary. Give the steps and let them choose, but never let them read as the recommended path.

The opt-in is evaluated at `launch` only. An already-launched VM workshop keeps refreshing even if the option is later unset — so "it launched once, therefore the option is still set" is not a safe inference.
</prerequisites>

<declare>
`runtime` is a top-level key in the workshop definition, one per definition file:

```yaml
name: dev
base: ubuntu@24.04
runtime: lxd-vm
```

- Values: `lxd-container` and `lxd-vm`. **Omitting the key selects `lxd-container`** — `workshop init` without `--runtime` writes no `runtime:` line at all, and that absence is not a defect.
- Scaffold it with `workshop init <NAME> --runtime lxd-vm` (the message is `"<NAME>" workshop definition created at <path>/.workshop/<NAME>.yaml`), or add the key by hand to a definition that has not been launched yet.
- A bad value is rejected naming both valid values (verified on 0.9.8): `error: invalid runtime "classic"; valid runtimes: lxd-container, lxd-vm` from `workshop init --runtime`, and `error: cannot launch "dev": invalid runtime "classic"; valid runtimes: lxd-container, lxd-vm` from a definition.

Confirm what you actually got — never infer the runtime from the definition file alone, since the file can have been edited after launch (and on 0.9.8 it could carry a silently ignored `confinement:` key):

```
workshop info <NAME>
```

`workshop info` prints a `runtime:` line directly after `status:`, always — a container workshop reports `runtime:   lxd-container`.
</declare>

<limitations>
A VM workshop is not a container with a stronger wall. Four differences change what you can do with one.

**1. The runtime is fixed at launch.** Editing `runtime:` on a launched workshop and refreshing fails:

```
error: cannot refresh "dev": cannot refresh "dev": runtime changed from "lxd-vm" to "lxd-container"
```

(The doubled `cannot refresh` prefix is an upstream message-wrapping quirk, not a transcription error. Note also that *removing* the key from a launched VM's definition triggers this too — an absent `runtime:` means `lxd-container`, which is a change.)

There is no in-place migration. `workshop remove <NAME>` then `workshop launch <NAME>` — and say so plainly, because this is the one place in this skill where remove+launch is the correct answer rather than the anti-pattern. The same holds across Workshop upgrades: upstream warns that an upgrade can change the runtime incompatibly, so VM workshops may have to be removed **before** upgrading Workshop.

**2. SDK support depends on the host's LXD.** On LXD `6/stable`, a VM workshop that declares an SDK is refused:

```
error: cannot refresh "dev": cannot refresh "dev": SDKs are currently unavailable for virtual machines
```

The fix is the `6/edge` switch in `<prerequisites>`, with its cost stated. To check whether the installed LXD can already mount shifted disks into a VM:

```
lxc query /1.0/metadata/configuration | jq -r '.configs["device-disk"]["device-conf"].keys[] | select(has("shift")) | .shift.condition'
```

`container` means container-only. Workshop probes this at runtime, so the restriction disappears on its own once LXD is new enough. A workshop that declares no SDKs is unaffected.

**3. Interfaces are not auto-connected.** Launching a VM skips the auto-connect step entirely, and so does refreshing one — the connection persistence that holds for containers does **not** apply here. Wire what you need with `workshop connect`, and re-wire after every refresh. Interfaces backed by LXD proxy devices — tunnel, desktop, ssh-agent, camera, custom-device — are unavailable in a VM regardless. The `workshopctl` binary is still installed inside a VM, but the socket it talks to is not created, so don't read its presence as proof the interface machinery is live — and don't promise `workshopctl get-secret` (the `secret` interface, `references/secrets.md`) in a VM either.

**4. SDK health checks do not run.** `check-health` is skipped after launch and refresh, so `workshop info` reports no SDK health notes for a VM. Do not wait for a health signal that will not arrive.

Net effect on a stock LXD: a VM workshop is limited to `name`, `base`, `runtime`, and `actions`.
</limitations>

<boundary>
The VM boundary stops at the kernel. The project directory, **including its `.git` directory**, is still mounted read-write, and outbound network access is still open — so a VM does not protect the project from a coding agent that works in it. Everything inside still runs as the `workshop` user with passwordless `sudo`, and connected interfaces still extend the agent's reach.

So when a user asks for a VM "to sandbox an AI agent", answer the real question: the protections that matter are a **separate clone** of the repository rather than the working copy (git hooks and `.git/config` commands run on the host), and **disconnecting** interfaces such as ssh-agent, secret, desktop, tunnels and writable mounts before an autonomous agent starts. A VM can be added on top, with the prerequisites above, but it is not a substitute for either. Upstream collects these caveats in `security.md` ("Coding agents") and `reference/ai-agents.md`.
</boundary>

<operational_notes>
- **Timing.** Start allows 10 minutes for a VM (5 for a container), so a longer `Pending` is normal, not a stall. A forced stop allows 30 seconds (10 for a container). `workshop refresh` does not force-stop a VM — a forced stop can leave repairable filesystem damage that the snapshot would then capture. 0.9.8 sped up VM boot (secure boot off, no firmware boot menu, unused devices removed, `pollinate.service` disabled).
- **First launch is slow.** A VM boots a different base image than a container, so the first launch on a given base downloads that image.
- **Snapshots are keyed on the runtime** and, for VMs, are taken with the filesystem frozen (automatic; no flag). The freeze adds up to a few minutes to the snapshot step during `refresh`, and the step cannot be cancelled. The 0.9.8 upgrade also bumped the snapshot format, so existing SDK snapshots are rebuilt once on the first refresh after upgrading.
- **Removal order in a mixed project.** On LXD 6.9 a VM holds references to every mounted filesystem, so removing a VM and container workshops in one `workshop remove a b c` can fail. Remove the VM workshop first.
- **What is unchanged.** The `/project` mount, host↔workshop uid/gid mapping, `workshop exec` / `run` / actions, SSH by hostname, `*.wp` DNS and cross-workshop name resolution, host timezone, autostart after a host reboot, and `start` / `stop` / `remove` all behave exactly as they do for a container.
</operational_notes>

<source_docs>
- `how-to/customize-workshops/use-virtual-machines.md` (prerequisites incl. LXD `6/edge`, the opt-in, `--runtime lxd-vm`, verification, the four limitations, the kernel-only boundary)
- `release-notes/v0.9.8.md` (`confinement: virtual-machine` replaced by `runtime: lxd-vm`; faster VM startup)
- `release-notes/v0.9.7.md` (VM workshops introduced as experimental)
- `security.md` (coding agents: what a VM does and does not change)
- `reference/definition-files/schema.json` (the `runtime` property and its allowed values)
- `reference/cli/workshop.md` (`init --runtime`, the `info` output)
</source_docs>
