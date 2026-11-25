<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
The runtime is the sandbox technology a workshop runs in: `lxd-container` (the default) or `lxd-vm`.

Since Workshop 0.9.10 the VM runtime is generally available. It needs no opt-in and no LXD channel switch, and it carries SDKs on LXD from `6/stable`. It is still not at feature parity with a container: only `mount` and `secret` interfaces work. It also costs materially more memory and disk.

Reach for a VM only in two cases:
- The workshop itself has to run LXD containers and VMs. A VM has a real kernel, so nesting works natively and Workshop does not set `security.nesting`.
- The user wants a harder *kernel* boundary and understands what that boundary does not cover (see `<boundary>`).

Read this before answering any question about `runtime:`, `workshop init --runtime`, the `runtime:`, `cpus:`, `memory:` or `disk:` lines in `workshop info`, or a 0.9.7-era `confinement:` key. Assume the container runtime everywhere else in this skill, because every other reference and workflow describes container behavior.
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
On 0.9.10 a VM workshop needs three things:
- Workshop 0.9.10 or later. Check with `workshop --version`.
- LXD 6.10 or later, which Workshop 0.9.10 requires anyway. The `6/stable` channel is enough.
- A host with hardware virtualization (`/dev/kvm` present).

There is no snap setting and no channel switch. `snap get workshop workshop.experimental-vms` now fails with `snap "workshop" has no "workshop.experimental-vms" configuration option` (verified on 0.9.10).

Verified on this release: a `runtime: lxd-vm` workshop with a Store SDK (`go`, 1.27) launched on LXD 6.10.1 from `6/stable` in under a minute, with its `mod-cache` mount auto-connected.

**0.9.9 and earlier.** Two host-level changes came first, and both errors below mean the host runs an old Workshop:
- Launch was refused until the host opted in:
  `runtime "lxd-vm" is experimental` / `To opt in: "sudo snap set workshop workshop.experimental-vms=1 && sudo snap restart workshop.workshopd"`
- A VM with SDKs was refused on LXD `6/stable`:
  `SDKs are currently unavailable for virtual machines`
  0.9.9 needed LXD `6/candidate`, and 0.9.8 needed `6/edge`.

The answer to either error is to upgrade Workshop to 0.9.10 (`sudo snap refresh workshop`) on LXD ≥ 6.10. Don't steer a user into the one-way `6/candidate` switch or the retired opt-in when an upgrade removes both.

Even so, `lxd-container` stays the default. If the user doesn't need nested LXD or a harder kernel boundary, they can simply drop the `runtime:` line.
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

`workshop info` always prints a `runtime:` line directly after `status:`. A container workshop reports `runtime:   lxd-container`. On 0.9.10 a VM then prints `cpus:`, `memory:` and `disk:` with the effective values (`2`, `4GiB` and `10GiB` by default). A container prints those lines only for the keys its definition sets.
</declare>

<limitations>
A VM workshop is not a container with a stronger wall. Four differences change what you can do with one, plus one host-suspend caveat (0.9.10; earlier releases differed, as the end of this section explains).

**1. The runtime is fixed at launch.** Editing `runtime:` on a launched workshop and refreshing fails:

```
error: cannot refresh "dev": cannot refresh "dev": runtime changed from "lxd-vm" to "lxd-container"
```

(The doubled `cannot refresh` prefix is an upstream message-wrapping quirk, not a transcription error. Note also that *removing* the key from a launched VM's definition triggers this too — an absent `runtime:` means `lxd-container`, which is a change.)

There is no in-place migration. `workshop remove <NAME>` then `workshop launch <NAME>` — and say so plainly, because this is the one place in this skill where remove+launch is the correct answer rather than the anti-pattern.

**2. Only `mount` and `secret` interfaces work.** A VM auto-connects at launch and refresh, and keeps manual connections across a refresh, exactly as a container does — but only for those two interfaces. Plugs and slots of every other interface (`tunnel`, `desktop`, `ssh-agent`, `camera`, `custom-device`, `gpu`) are skipped with a warning that names them — `"<SDK>" SDK has incompatible plugs: …` with the reason `<interface> interface only available to containers` — are left out of `workshop connections`, and cannot be connected by hand. The SDK itself still installs. So when a user needs one of those interfaces, the answer is a container workshop, not a `workshop connect`. A `mount` can be connected only while the VM is running (0.9.10 docs). `workshopctl` reaches the daemon over vsock in a VM, so `workshopctl get-secret` (`references/secrets.md`) and an SDK's `check-health` hook work as in a container, and `workshop info` shows SDK health notes. If the daemon cannot listen on vsock, every VM workshop is refused: `cannot launch "<NAME>": virtual machines are unavailable: <reason>`.

**3. A stopped VM may not be removable, but only in one case.** Disconnecting a `mount` plug from a `workshop-source` slot (a mount between workshops) needs the VM running. Removal disconnects mounts, so `workshop remove` on a stopped VM workshop with such a mount can fail. Run `workshop start <NAME>` first, then `workshop remove <NAME>`. If it won't start, follow `workflows/purge-and-recover.md`, starting with its copy-out step. An ordinary SDK mount (a Workshop-allocated host directory) does not block removal: on 0.9.10 a stopped VM with a `go:mod-cache` mount was removed directly, together with a container in the same `workshop remove`. Upstream says a future release lifts the remaining case.

**4. Virtual hardware has hard limits, but the definition sets them (0.9.10+).** A VM has a fixed processor count, total memory and root disk, like a physical machine. Since 0.9.10 the workshop definition sets them with `cpus`, `memory` and `disk`. The defaults for a VM are 2 CPUs, `4GiB` and `10GiB`, and the minimums are `512MiB` of memory and a `10GiB` disk. A change applies on the next `workshop refresh` with no remove and relaunch (verified: `cpus: 3` and `memory: 6GiB` on a running VM, then refresh, applied in about 30 s, and `nproc` printed 3). `workshop info` on a VM always prints `cpus:`, `memory:` and `disk:` after `runtime:`. See `references/definition-file.md` for the format and errors. Through 0.9.9 the same three quantities were fixed when the VM started, LXD gave a VM 1GiB of memory, and nothing in the definition could change them.

Interface connections are also capped, the way devices on a physical machine are. Each `mount` connection is its own PCIe device. Workshop gives the system SDK 8 PCIe ports (the `/project` mount, the network card, and other default devices use some of them) and adds 4 for each further SDK except `sketch`; each extra 4 ports slows `workshop start` a little. It stops at 192 ports, about 46 SDKs. All SDKs share the budget, so one SDK with many mount plugs can exhaust it:

```
- Connect "dev/go:mod-cache" to "dev/system:mount" (… Failed starting device "go_mod-cache": No unused PCIe ports available for hotplugging
```

```
- Start "dev" workshop (Failed setting up disk device "go_mod-cache": Failed allocating bus for virtiofs disk device: PCI devices limit reached: used 12 of 12 slots; increase limits.max_bus_ports to allow more devices)
```

The remedy is `workshop disconnect` on mounts the user doesn't need; an extra SDK with few plugs also raises the budget. Don't follow the message's `limits.max_bus_ports` hint with `lxc config` — Workshop sets that key itself from the SDK count, and `limits.cpu` from `cpus:`. Workshop may also raise the CPU count above `cpus:`, adding a processor for every 32 ports. A host with too few cores can then fail `workshop start` with `Failed adding CPUs: Cannot allocate more CPUs than available`. The way out is fewer SDKs, a lower `cpus:`, or a container.

**Host suspend ends shell sessions (0.9.10 docs).** If the host suspends for 35 seconds or longer, `workshop shell` sessions into a VM exit abruptly when it resumes. The command inside may still be running, so check before re-running it. Upstream expects a future LXD release to fix this.

**Fixed in 0.9.10:**
- `workshop remount` on a stopped VM workshop.
- Mounts between workshops inside a VM.

On 0.9.9 these failed, and the answer is to upgrade.

**What older releases did.**
- 0.9.9 had the same interface rules (only `mount` and `secret`) and needed the opt-in and LXD `6/candidate` for SDKs (see `<prerequisites>`). Its hardware was fixed at start, and a stopped VM with any mount could refuse removal.
- Through 0.9.8 a VM skipped auto-connect at launch *and* refresh, and restored nothing: every connection was manual, and every refresh lost it. It never ran `check-health` and had no working `workshopctl`, because its socket wasn't created.

Answer a user on an old release from this list, after you check `workshop --version`.
</limitations>

<boundary>
The VM boundary stops at the kernel. The project directory, **including its `.git` directory**, is still mounted read-write, and outbound network access is still open — so a VM does not protect the project from a coding agent that works in it. Everything inside still runs as the `workshop` user with passwordless `sudo`, and connected interfaces still extend the agent's reach. With that `sudo`, an agent can also leave the workshop unable to start, and neither a restart nor `workshop restore` is sure to bring it back. The supported way out is `workshop remove`, after copying out the files that matter (`workflows/purge-and-recover.md`).

So when a user asks for a VM "to sandbox an AI agent", answer the real question: the protections that matter are a **separate clone** of the repository rather than the working copy (git hooks and `.git/config` commands run on the host), and **disconnecting** interfaces such as ssh-agent, secret, desktop, tunnels and writable mounts before an autonomous agent starts. A VM can be added on top, but it is not a substitute for either. Upstream collects these caveats in `security.md` ("Coding agents") and `reference/ai-agents.md`.
</boundary>

<operational_notes>
- **Timing.** Start allows 10 minutes for a VM (5 for a container), so a longer `Pending` is normal, not a stall. A forced stop allows 30 seconds (10 for a container). `workshop refresh` does not force-stop a VM — a forced stop can leave repairable filesystem damage that the snapshot would then capture. 0.9.8 sped up VM boot (secure boot off, no firmware boot menu, unused devices removed, `pollinate.service` disabled). 0.9.9 reserves PCIe ports for SDK mounts up front, so a VM with many mounts boots reliably. A first VM launch with one Store SDK took about 45 s on 0.9.10.
- **First launch is slow.** A VM boots a different base image than a container, so the first launch on a given base downloads that image.
- **Disk snapshots.** A VM runs its `setup-base` hooks on a fixed 10GiB root disk and grows it to `disk:` afterwards, so the base snapshot can be reused by a VM with any disk size (0.9.10). The 0.9.10 upgrade also updates an existing `workshop` ZFS storage pool to full disk quotas on refresh.
- **Snapshots are keyed on the runtime** and, for VMs, are taken with the filesystem frozen (automatic; no flag). The freeze adds up to a few minutes to the snapshot step during `refresh`, and the step cannot be cancelled. The 0.9.8 upgrade also bumped the snapshot format, so existing SDK snapshots are rebuilt once on the first refresh after upgrading.
- **Removal order in a mixed project (LXD 6.9 only).** On LXD 6.9 a VM held references to every mounted filesystem, so removing a VM and container workshops in one `workshop remove a b c` could fail; removing the VM first avoided it. Workshop 0.9.10 requires LXD ≥ 6.10, where a VM and a container were removed together without error.
- **What is unchanged.** The `/project` mount, host↔workshop uid/gid mapping, `workshop exec` / `run` / actions, SSH by hostname, `*.wp` DNS and cross-workshop name resolution, host timezone, autostart after a host reboot, and `start` / `stop` / `remove` all behave exactly as they do for a container.
</operational_notes>

<source_docs>
- `how-to/customize-workshops/use-virtual-machines.md` (prerequisites, `--runtime lxd-vm`, verification incl. the `cpus`/`memory`/`disk` lines, the limitations, the kernel-only boundary)
- `reference/definition-files/workshop-definition.md` (`runtime`, `cpus`, `memory`, `disk`)
- `release-notes/v0.9.10.md` (VMs generally available: opt-in removed, SDKs on stable LXD; LXD 6.10 minimum; resource keys; remount and cross-workshop mount fixes)
- `reference/workshops.md` ("Interfaces in virtual machines": the PCIe port budget, the CPU allocation, and their errors)
- `explanation/architecture/components.md` (`workshopctl` over vsock in virtual machines)
- `release-notes/v0.9.9.md` (`workshopctl` and `check-health` in VMs over vsock; auto-connect in VMs; container-only interfaces skipped; PCIe ports reserved; unknown definition fields rejected)
- `release-notes/v0.9.8.md` (`confinement: virtual-machine` replaced by `runtime: lxd-vm`; faster VM startup)
- `release-notes/v0.9.7.md` (VM workshops introduced as experimental)
- `how-to/fix-workshops/purge.md` ("Before removing a workshop": copying files out of a broken container or VM)
- `security.md` (coding agents: what a VM does and does not change)
- `reference/definition-files/schema.json` (the `runtime`, `cpus`, `memory` and `disk` properties)
- `reference/cli/workshop.md` (`init --runtime`, the `info` output)
</source_docs>
