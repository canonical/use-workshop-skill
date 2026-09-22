<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Confinement is how a workshop is sandboxed: `container` (the default, and the supported choice) or `virtual-machine`. VM confinement (0.9.7+) is **experimental** — it is gated behind a snap option, it is not at feature parity with a container, and a VM costs materially more memory and disk. Reach for it only when the boundary has to be harder than a container's: isolating an AI agent working in the project, or running LXD containers and VMs *inside* the workshop (a VM has a real kernel, so nesting works natively and Workshop does not set `security.nesting`).

Read this before answering any question about `confinement:`, `workshop init --vm`, or the `confinement:` line in `workshop info`. Assume container confinement everywhere else in this skill — every other reference and workflow describes container behavior.
</overview>

<opt_in>
Until the host opts in, launching a VM workshop is refused:

```
error: cannot launch "<NAME>": confinement "virtual-machine" is experimental
To opt in: "sudo snap set workshop workshop.experimental-vms=1 && sudo snap restart workshop.workshopd"
```

Run **both** commands — the daemon restart is part of the opt-in, not a follow-up that can be deferred:

```
sudo snap set workshop workshop.experimental-vms=1
sudo snap restart workshop.workshopd
```

The gate is evaluated at `launch` only. An already-launched VM workshop keeps refreshing even if the option is later unset — so "it launched once, therefore the option is still set" is not a safe inference.

Beyond the opt-in, a VM workshop that declares **any** SDK also needs an LXD that can mount shifted disks into a VM — in practice LXD from `latest/edge`. See `<limitations>`.
</opt_in>

<declare>
`confinement` is a top-level key in the workshop definition, one per definition file:

```yaml
name: dev
base: ubuntu@24.04
confinement: virtual-machine
```

- Values: `container` and `virtual-machine`. **Omitting the key selects `container`** — `workshop init` without `--vm` writes no `confinement:` line at all, and that absence is not a defect.
- Scaffold it with `workshop init <NAME> --vm`, or add the key by hand to a definition that has not been launched yet.
- A bad value fails at YAML decode, before the rest of the file is validated. The message is `invalid confinement: "<value>"`, wrapped in whichever command hit it — `error: cannot launch "dev": invalid confinement: "classic"` (verified against 0.9.7).

Confirm what you actually got — never infer confinement from the definition file alone, since the file can have been edited after launch:

```
workshop info <NAME>
```

`workshop info` prints a `confinement:` line (0.9.7+) directly after `status:`, always — a container workshop reports `confinement: container`.
</declare>

<limitations>
A VM workshop is not a container with a stronger wall. Four differences change what you can do with one.

**1. Confinement is fixed at launch.** Editing `confinement:` on a launched workshop and refreshing fails:

```
error: cannot refresh "dev": cannot refresh "dev": confinement changed from "virtual-machine" to "container"
```

(The doubled `cannot refresh` prefix is an upstream message-wrapping quirk, not a transcription error. Note also that *removing* the key from a launched VM's definition triggers this too — an absent `confinement:` means `container`, which is a change.)

There is no in-place migration. `workshop remove <NAME>` then `workshop launch <NAME>` — and say so plainly, because this is the one place in this skill where remove+launch is the correct answer rather than the anti-pattern.

**2. SDK support depends on the host's LXD.** Where LXD offers shifted mounts to containers only, a VM workshop that declares an SDK is refused:

```
error: cannot refresh "dev": cannot refresh "dev": SDKs are currently unavailable for virtual machines
```

Probe the host before promising SDKs in a VM:

```
lxc query /1.0/metadata/configuration | jq -r '.configs["device-disk"]["device-conf"].keys[] | select(has("shift")) | .shift.condition'
```

`container` means container-only — install LXD from `latest/edge` to lift it. Workshop probes this at runtime, so the restriction disappears on its own once LXD is new enough. A workshop that declares no SDKs is unaffected.

**3. Interfaces are not auto-connected.** Launching a VM skips the auto-connect step entirely, and so does refreshing one — the connection persistence that holds for containers (0.9.5+) does **not** apply here. Wire what you need with `workshop connect`, and re-wire after every refresh. Interfaces backed by LXD proxy devices — tunnel, desktop, ssh-agent, camera, custom-device — are unavailable in a VM regardless. The `workshopctl` binary is still installed inside a VM, but the socket it talks to is not created, so don't read its presence as proof the interface machinery is live.

**4. SDK health checks do not run.** `check-health` is skipped after launch and refresh, so `workshop info` reports no SDK health notes for a VM. Do not wait for a health signal that will not arrive.

Net effect on a stock LXD: a VM workshop is limited to `name`, `base`, `confinement`, and `actions`.
</limitations>

<operational_notes>
- **Timing.** Start allows 10 minutes for a VM (5 for a container), so a longer `Pending` is normal, not a stall. A forced stop allows 30 seconds (10 for a container). `workshop refresh` no longer force-stops a VM — a forced stop can leave repairable filesystem damage that the snapshot would then capture.
- **First launch is slow.** A VM boots a different base image than a container, so the first launch on a given base downloads that image.
- **Snapshots are keyed on confinement** and, for VMs, are taken with the filesystem frozen (automatic; no flag). The freeze adds up to a few minutes to the snapshot step during `refresh`, and the step cannot be cancelled.
- **Removal order in a mixed project.** On LXD 6.9 a VM holds references to every mounted filesystem, so removing a VM and container workshops in one `workshop remove a b c` can fail. Remove the VM workshop first.
- **What is unchanged.** The `/project` mount, host↔workshop uid/gid mapping, `workshop exec` / `run` / actions, SSH by hostname, `*.wp` DNS and cross-workshop name resolution, host timezone, and `start` / `stop` / `remove` all behave exactly as they do for a container.
</operational_notes>

<source_docs>
- `release-notes/v0.9.7.md` (VM workshops, the experimental opt-in, the LXD `latest/edge` requirement, confinement in `workshop info`)
- `reference/definition-files/schema.json` (the `confinement` property and its allowed values)
- `reference/definition-files/workshop-definition.md` (the rest of the top-level keys; it does not yet carry a `confinement` row)
</source_docs>
