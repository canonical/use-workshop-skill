<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<!--
SDK README template (condensed from canonical/template-sdk). Rules:
- The opening paragraph closely matches sdkcraft.yaml's `description` (it is
  reused by `sdk info`): plain sentences, no headings/bullets, focused on how
  the SDK affects the environment — what it provides, what it persists —
  never marketing language.
- Concise: NO "Installed components" or "Platforms, channels, versions"
  sections (components fold into the overview; channels belong to
  `sdk info`). No implementation details; plugs/slots get interface, path,
  and one-line purpose each — nothing more.
- Say "workshop updates" (not "restarts"/"sessions") for what mounts survive.
- Every command example must have been tested; be explicit about host vs
  inside-the-workshop.
- Replace [PLACEHOLDERS]; delete sections that don't apply; delete this
  comment block.
-->

# [Software Name] SDK for Workshop

[2–3 sentences: what the SDK provides, what it persists on the host, notable
behavior. Closely matches sdkcraft.yaml's description.]

---

## Reference workshop

A minimal workshop:

```yaml
# workshop.yaml
name: [workshop-name]
base: ubuntu@[version]
sdks:
  - name: [sdk-name]
    channel: [channel]
```

[One sentence on what this demonstrates. If a plug needs explicit wiring,
show the `connections:` block here — this is the only place connection
mechanics belong.]

---

## Using the SDK

### Prerequisites, project layout

1. [Prerequisite SDKs, if any — state reliance on other SDKs explicitly.]
2. [Expected project layout / source preparation:]

   ```bash
   [command]
   ```

### [Primary workflow task]

Once the workshop is ready:

```bash
[commands]
```

[Where outputs go; what persists across workshop updates.]

---

## Plugs (resources this SDK consumes)

### `[plug-name]`

- Interface: `[interface]`
- Workshop target: `[/path]`
- Purpose: [one line — what this persists between workshop updates.]

<!-- OR: This SDK doesn't define any plugs. -->

## Slots (resources this SDK provides)

### `[slot-name]`

- Interface: `[interface]`
- Workshop source: `[/path]`
- Purpose: [one line — what this exposes to other SDKs.]

<!-- OR: This SDK doesn't define any slots. -->

---

## Documentation and guidance

- [[Upstream] official documentation]([url])

---

## Community and support

- [Upstream community forum]([url])
- Please review our [Code of Conduct](https://ubuntu.com/community/ethos/code-of-conduct)
  before participating.

---

## Contributions

All contributions, including code, documentation updates, and issue reports,
are welcome! See [CONTRIBUTING]([url]); open issues or pull requests on the
[official repository]([url]).

---

## License and copyright

Copyright [YEAR] [HOLDER].

[Required claims and disclaimers for the license of everything the SDK
installs.]
