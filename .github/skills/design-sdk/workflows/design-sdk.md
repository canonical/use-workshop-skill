<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Take a piece of software (a name, an upstream repo, or a description) to an
approved Design Proposal for a publishable Workshop SDK. Read-only: this
workflow writes no files — generation happens in `generate-sdk.md` after
approval.
</objective>

<required_reading>
1. `references/design-best-practices.md` — the decision doctrine
2. `references/reference-sdk-patterns.md` — named shapes to match against
3. `references/sdkcraft-definition.md` — what the definition can express
4. `../use-workshop/references/interfaces.md` — auto vs manual connect
</required_reading>

<process>

**Step 1. Requirements interview.** Before any question, state what the
brief already pins — the constructs that are settled by the request itself,
each named with its mechanism, so the user sees the design taking shape:
a host-reachable service pins a tunnel SLOT at its port **plus a systemd
user unit** (no `apps:`/`services:` key exists; hooks don't exec daemons);
"persists across updates" pins a mount plug; "shared with other SDKs" pins
a mount SLOT; GPU need pins the `gpu` plug. Then settle the ten questions.
Ask only the ones the request leaves open, batched into ONE message, each
with a recommendation ("Options: A / B — Recommendation: A, because
<evidence>"):

1. What software, exactly (binary, toolchain, daemon, GUI-adjacent tool)?
2. How does upstream distribute it (release tarballs, git tags, npm, PyPI,
   apt, install script)?
3. What must persist across workshop updates (caches, models, config)?
4. Does it serve a network service consumers reach from the host? (If the
   answer is or may be yes, the recommendation names the mechanism up
   front: a tunnel SLOT at the service's port plus a systemd user unit —
   there is no `apps:`/`services:` key, and hooks don't exec daemons.)
5. Hardware needs (GPU, camera, USB device)?
6. Which Ubuntu bases, and one base or several?
7. Which architectures (amd64 / arm64 / riscv64)?
8. Version scheme (semver, major-only tracks, date-based)?
9. Which renovate datasource discovers new versions?
10. How many release tracks (single `latest`, or one per major/major.minor)?

**Step 2. Verify upstream distribution facts.** Confirm the release URL
shape, tag prefix (`v1.2.3` vs `1.2.3`), and checksum availability from the
upstream project — fetch the releases page if reachable. Never guess a
download URL: an unverifiable URL goes into the proposal marked
`UNVERIFIED`, never as settled fact.

**Step 3. Match a pattern.** Name the closest entry in
`references/reference-sdk-patterns.md` (uv, ollama, go, cuda-toolkit,
claude-code, jupyter, vscode-remote) and say why. If the user has reference
SDK checkouts locally, prefer reading the real repo over recalling the
catalog. A design that matches no pattern is a flag, not a license to
invent — decompose it until its pieces match.

**Step 4. Pick the platform layout** per
`references/sdkcraft-definition.md`: single-base multi-arch
(`platforms: {amd64:, arm64:}` under one `base`), multi-base
(`ubuntu@22.04:amd64` style keys, no `base`), or arch-independent
(`build-for: all`).

**Step 5. Pick the parts strategy** per the doctrine: apt-installable
dependencies → `setup-base` (keeps security updates); pinned or custom-built
upstream binaries → parts; a version-only SDK may have no real parts at all.
Name each part, its plugin, and what it stages.

**Step 6. Pick the interface layout AND write the connection story.** For
each plug/slot: interface type, name (singleton names for
camera/desktop/gpu/ssh-agent), endpoint or target path, and — explicitly —
whether it auto-connects, needs a `connections:` entry in the consumer's
definition, or needs `workshop connect`. This story is carried verbatim
into the README later. When several slots could serve one plug, the
proposal says which `connections:` entry pins the topology.

**Step 7. Pick the minimal hook set.** Only hooks that do real work:
`setup-base` (system packages, profile.d), `setup-project` (user config,
service enablement), `check-health` (probe real functionality),
`save-state`/`restore-state` only when state must survive a refresh outside
a mount.

**Step 8. Pick the track/branch/datasource model** per
`references/onboarding-ci.md`: track style (`latest` / `"[0-9]+"` /
`"[0-9]+.[0-9]+"`), renovate datasource, dep name, and
`extractVersionTemplate` if tags are prefixed.

**Step 9. Emit the Design Proposal and STOP for approval.** Fixed format —
one line per construct, each citing its source pattern or doctrine rule:

```
## Design Proposal: <NAME> SDK

Software:      <what> — <upstream>, distributed via <mechanism>
Pattern:       <reference SDK> (<why>)
Platforms:     <layout> [pattern/doctrine cite]
Parts:         <name>: <plugin> — <what it stages> [cite]
Interfaces:    <plug/slot>: <interface> <endpoint/target> — <auto|connections:|workshop connect> [cite]
Hooks:         <hook>: <one-line responsibility> [cite]
Service:       <unit name> installed by setup-project | none [cite]
Versioning:    adopt-info + VERSION; track(s) <...>; datasource <...>
Tests:         launch + <capability probes>
Unverified:    <anything not confirmed against upstream, or "none">
```

Do not generate files until the user approves (in the `new` chain, an
explicit "go ahead" on the proposal is the gate).
</process>

<verification>
- [ ] Every open question was asked with a recommendation, in one batch.
- [ ] Upstream distribution facts are verified or marked `UNVERIFIED`.
- [ ] Every proposal line carries a pattern or doctrine citation.
- [ ] The connection story labels every plug/slot auto / `connections:` /
      `workshop connect`.
- [ ] The proposal ends with a STOP — no files written.
</verification>

<anti_patterns>
- Writing files before the proposal is approved.
- Proposing an `apps:`/`services:` key, `stage-packages`, or any construct
  absent from `references/sdkcraft-definition.md`.
- Guessing a download URL or checksum and presenting it as fact.
- An open-ended question without a recommendation, or questions dribbled
  across several messages.
- Skipping the connection story — "the consumer can connect it" is not a
  design.
- Recommending hooks that duplicate what a mount already persists.
</anti_patterns>

<success_criteria>
- A Design Proposal in the fixed format, every line cited, delivered before
  any file exists, with unverified facts named.
- The user approved it, refined it, or stopped — their call, explicitly.
</success_criteria>

<source_docs>
- `explanation/sdks/best-practices.md` (parts decomposition, interface
  heuristic, setup-base vs setup-project)
- `explanation/sdks/concepts.md` (SDK lifecycle and the publisher mental
  model)
- `explanation/sdks/parts.md` (what parts are)
- `explanation/interfaces/plugs-and-slots.md` (auto-connection policy)
- `reference/definition-files/sdkcraft-definition.md` (the definition
  surface)
</source_docs>
