<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
What Workshop can and cannot express, and how to turn that into an honest
feasibility verdict for a repo. Load this before proposing anything. Every
construct in a proposal must map to a row in `<envelope>`; every detected need
that maps to nothing becomes a GAP in the verdict, never a silent omission.
The full definition-file anatomy lives in
`../use-workshop/references/definition-file.md` — this file is the
onboarding-decision view of the same facts.
</overview>

<envelope>
The complete expressive surface of a workshop definition:

| Construct | Limits | Onboarding use |
|-----------|--------|----------------|
| `name` | `^[a-z](?:-?[a-z0-9])*$`, max 40 chars; must match filename in `.workshop/<name>.yaml` layout | Default `dev` |
| `base` | Exactly one of `ubuntu@20.04`, `ubuntu@22.04`, `ubuntu@24.04`, `ubuntu@26.04` | Match the repo's CI runner / docs; default `ubuntu@24.04` |
| `sdks` | Store SDKs by name (+ snap-style `channel`), in-project SDKs as `project-<name>`, try SDKs as `try-<name>`, implicit `system` | Toolchains and runtimes |
| `sdks[].plugs` / `sdks[].slots` | Graft interface endpoints onto any listed SDK (incl. `system`) | Tunnels for dev servers; desktop/gpu/device access |
| `connections` | Explicit plug↔slot wiring when auto-connect isn't enough | venv sharing, cross-SDK content |
| `actions` | Named bash scripts (`errexit`+`pipefail`; args as `"$@"`); parsed at `workshop run` time, no refresh needed | The repo's build/test/lint/serve commands |
| Interfaces | `tunnel` (ports/sockets; system-SDK plugs can't use ports 1–1023), `mount`, `gpu`, `camera`, `desktop`, `ssh-agent`, `custom-device` | Host resources |
| In-project SDK | `.workshop/<name>/sdk.yaml` + executable `hooks/` (`setup-base`, `setup-project`, `check-health`, `save-state`, `restore-state`) | Repo-specific apt packages and setup |
| Project mount | Host project directory appears at `/project/` inside the workshop | All actions run against it |
</envelope>

<not_in_envelope>
Things a proposal must NEVER contain, because Workshop cannot express them:

- **No git-URL or path SDK source.** SDKs come from the Store (by name), from
  the project (`project-<name>` at `.workshop/<name>/`), or from a local
  sdkcraft try area (`try-<name>`). You cannot point `sdks:` at a GitHub repo
  or arbitrary directory. To use a recipe from another repo, vendor it as an
  in-project SDK.
- **No workshop-level `env:`, `services:`, `hooks:`, `mounts:`, or `packages:`
  keys.** The five top-level keys are `name`, `base`, `sdks`, `connections`,
  `actions` — nothing else. Environment setup and daemons belong to SDKs;
  mounts are interface endpoints.
- **No non-Ubuntu bases.** No Alpine, Fedora, Debian, or arbitrary images.
- **No non-Linux toolchains.** Workshops are Ubuntu LXD containers: no macOS
  (Xcode/iOS), Windows (MSVC/.NET Framework), or BSD-only builds.
- **No invented SDK names or channels.** An SDK exists when `sdk find`/
  `sdk info` says so (or the catalog lists it, tagged unverified). A channel
  exists when `sdk info` lists it.
- **No privileged ports on system-SDK tunnel plugs.** Host side of a tunnel
  must use port ≥ 1024; remap (80 → 8080) and say so.
- **No guaranteed host-device passthrough beyond the interfaces.** Only what
  `gpu`, `camera`, `desktop`, `ssh-agent`, `custom-device` (by `subsystem`/
  `vendorid`/`productid`) and `mount` cover.
- **No nested virtualization guarantees.** VM-based tooling (KVM-dependent
  emulators, nested hypervisors) is outside what the definition can promise.
  Docker inside the workshop IS available — via the Store `docker` SDK, not by
  hand-installing dockerd.
</not_in_envelope>

<feasibility_rubric>
Classify the repo AFTER the analysis pass, BEFORE generating anything.

**FULL** — every element of the primary developer loop (build, test, lint,
run/debug entry points found in the analysis) maps to an envelope construct.
Packaging pipelines (snapcraft, release jobs) may still be listed as
out-of-loop notes without blocking FULL — scope is the *inner dev loop*.

**PARTIAL** — the primary build + test loop maps, but at least one detected
element does not. Every unmapped element MUST appear as:

```
GAP: <need> — <why it cannot map> — <workaround, or "none">
```

PARTIAL requires the user to acknowledge the gaps before you generate.

**INFEASIBLE** — the primary loop itself cannot run inside an Ubuntu LXD
container (non-Linux toolchain, unsupported OS dependency, mandatory hardware
with no interface). Deliver the verdict, the reasons, and docs pointers.
Generate NOTHING — a definition that cannot build the project is worse than no
definition. Do not soften the verdict to be helpful.
</feasibility_rubric>

<verdict_format>
Emit exactly this block before any generation step:

```
## Feasibility: FULL | PARTIAL | INFEASIBLE

Covered:
- <need> → <construct> (<evidence file>)
- ...

Gaps:                          # omit section when FULL
- GAP: <need> — <why> — <workaround|none>

Unverified:                    # omit when everything was confirmed live
- <sdk>/<channel> — proposed from catalog; confirm with `sdk info <sdk>`
```
</verdict_format>

<worked_examples>
1. **Go CLI with Makefile-driven docs and lint** → FULL. `go.mod` → `go` SDK
   (channel from the `go` directive); `docs/Makefile` targets → actions
   wrapping `make -C docs/`; golangci-lint config → `lint` action; Sphinx
   preview port → tunnel pair. Snapcraft packaging noted out-of-loop.
2. **TypeScript VS Code extension** → FULL. `package.json` → `node` SDK
   (channel from `engines.node`); npm scripts → actions; Electron test host
   needs X libraries → in-project SDK with `setup-base` (apt list from the CI
   workflow) + `desktop` plug; headless variant via `xvfb-run` action.
3. **Web app with Postgres in docker-compose** → PARTIAL (typically). App
   build/test/serve map (SDK + actions + tunnel); the database maps via the
   Store `docker` SDK running compose inside the workshop — but if the repo
   needs a macOS-only E2E driver, that is `GAP: <driver> — macOS-only — none`.
4. **iOS application** → INFEASIBLE. Xcode toolchain cannot run in an Ubuntu
   container. No definition generated.
5. **Firmware repo needing a proprietary vendor IDE** → INFEASIBLE unless the
   vendor ships a Linux CLI toolchain (then re-evaluate: compile may be FULL
   with flashing as a `custom-device` plug or a GAP).
</worked_examples>

<source_docs>
- `reference/definition-files/workshop-definition.md`
- `reference/definition-files/schema.json`
- `explanation/interfaces/tunnel-interface.md`
- `explanation/interfaces/custom-device-interface.md`
- `explanation/sdks/concepts.md`
- `explanation/workshops/projects.md`
</source_docs>
