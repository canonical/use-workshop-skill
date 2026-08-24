<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
The exemplar catalog: named patterns mined from Canonical's published
reference SDKs (the `canonical/reference-sdks` index on GitHub). Every design
decision in a generated SDK should name its closest pattern here — the
pattern says not just WHAT the shape is but WHY it is that shape. When the
user has local checkouts of the reference SDKs, prefer reading the real repo
over the condensed shapes below; the catalog stands alone when they don't.
</overview>

<pattern name="source-built binary with shared cache and venv (uv)">
A Rust-built tool: `plugin: rust` part cloning the upstream tag named by
`VERSION`, `organize`/`prime` narrowing the artifact to `bin/`; a mount
`cache` plug persists the package cache across refreshes; a mount `venv`
slot (`workshop-source: /home/workshop/uv-venv`) offers a shared virtual
environment to other SDKs. `setup-base` pre-creates the slot directory
(slot sources are never auto-created), adds `$SDK/bin` to PATH via
profile.d, generates completions, and diverts `/usr/bin/pip` to `uv pip`
via `dpkg-divert` + `update-alternatives` (guarded, so the hook stays
idempotent). `setup-project` appends `UV_LINK_MODE=copy` to `~/.profile`
with a comment — the cache is mount-backed, so hardlinking is unavailable.
Why: pin the exact upstream version regardless of the archive; share one
environment across Python SDKs without dependency management.
</pattern>

<pattern name="daemon behind a tunnel (ollama)">
A served model runtime: two dump parts (release-tarball binary + a
`services` dir holding the unit file); multi-base platforms
(`ubuntu@22.04:amd64`, `ubuntu@24.04:amd64`, no `build-base`); a `gpu` plug
(auto-connects when the host has one); a mount `models` plug so downloaded
models survive workshop updates; a tunnel slot `ollama-server` with
`endpoint: 11434` so host tools reach the server. `setup-base` only writes
the PATH profile.d file; `setup-project` installs and enables the user
systemd unit; `check-health` calls the real CLI against the server and
reports `waiting` with the command's output while the daemon starts.
Why: this is the canonical background-service SDK — unit as a dump part,
user-level systemd, tunnel slot, polling health check.
</pattern>

<pattern name="toolchain with env round-trip (go)">
An official toolchain tarball: single `nil`-plugin part downloading
`go<VERSION>.linux-$CRAFT_ARCH_BUILD_FOR.tar.gz` into
`$CRAFT_PART_INSTALL`; three single-base platforms cross-built from amd64
(`build-on: [amd64]`, `build-for: [arm64]`, ...); a mount `mod-cache` plug at
`/home/workshop/go/pkg/mod`. `setup-base` writes PATH and pins
`GOMODCACHE`/`GOTOOLCHAIN=local` via `sudo -iu workshop go env -w`.
`save-state` harvests `go env -changed` (stripping single quotes — `go env
-w` re-quotes) into `$SDK_STATE_DIR`; `restore-state` replays it
line-by-line. Multi-track repo: version branches `1.24`/`1.25`/`1.26`, one
renovate packageRule per track.
Why: user-tunable tool settings live in the writable filesystem that a
refresh discards — the state hooks are what preserve them.
</pattern>

<pattern name="apt-repo toolchain with build-time markers (cuda-toolkit)">
A vendor apt stack: `nil` part whose `override-build` maps
`$CRAFT_PLATFORM` to the vendor's apt series and writes `version` + `series`
marker files into `$CRAFT_PART_INSTALL`; `setup-base` reads `$SDK/version`
and `$SDK/series`, configures the vendor repository (key, sources list,
pin), and `eatmydata apt-get install`s the toolkit; a `gpu` plug;
`check-health` verifies nvcc, maps toolkit version → minimum driver, and
fails with distinct `--code=` slugs per failure mode.
Why: apt content belongs in `setup-base`, but platform-dependent choices are
build-time knowledge — marker files are the handoff.
</pattern>

<pattern name="checksum-verified proprietary binary (claude-code)">
A downloaded CLI: `nil` part with `build-packages: [curl, ca-certificates,
jq]`; `override-pull` fetches the vendor manifest, extracts the platform
checksum, validates its shape, downloads the binary, and verifies sha256
before `override-build` installs it with `install -Dm755` into
`$CRAFT_PRIME/bin/`; a `case "$CRAFT_ARCH_BUILD_FOR"` switch maps arch to
the vendor's platform naming; a mount plug persists credentials
(`/home/workshop/.claude`). Spread suite runs three bases as variants with
`EXPECTED_VERSION` pulled from the host's `VERSION` file at parse time.
Why: hand-rolled downloads verify integrity when upstream publishes
checksums — never skip verification that is available.
</pattern>

<pattern name="service on a shared environment (jupyter)">
A service consuming another SDK's resource: mount `venv` plug targeting
`$SDK/venv` — with `override-prime: mkdir -p venv` so the `$SDK`-rooted
mount target exists in the primed tree (the pack-time interface linter
requires it); tunnel slot at `127.0.0.1:8888`; `setup-project` detects
whether a shared venv is wired (checks for `pyvenv.cfg`), creates a fallback
venv when not — printing the exact `connections:` snippet the user would add
— then installs the pinned JupyterLab into whichever venv won and enables
the user unit. `check-health` starts the service and polls systemd state.
Why: consumers of optional slots must work in both wirings and teach the
user the explicit wiring in their output.
</pattern>

<pattern name="version-only configurator (vscode-remote)">
No payload at all: single `nil` part that only runs `craftctl set version`;
everything happens in `setup-base` (reconfigure sshd, drop the user
password) and `check-health` (verify the ssh unit, print the connection
string). One mount plug persists `~/.vscode-server` with an explicit
`mode: 0o700`.
Why: an SDK is a unit of setup logic, not necessarily of software — parts
are optional.
</pattern>

<cross_cutting>
- Every reference SDK: `adopt-info` + `VERSION` file read in
  `override-pull`; no hardcoded `version:`.
- Repo shape: `sdkcraft.yaml`, `hooks/`, `README.md`, `renovate.json`,
  `.github/workflows/` (4 thin files), `tests/` (spread) — plus `services/`
  when there's a daemon.
- Plug names are short nouns for the resource (`cache`, `models`,
  `mod-cache`, `venv`), not tool names; singleton interfaces keep their
  mandated names (`gpu`, `desktop`, `camera`, `ssh-agent`).
- Descriptions follow one template sentence: "This SDK provides X for Y.
  [Key resources] are persisted on the host to speed up [...] across
  workshop updates."
</cross_cutting>

<source_docs>
- `explanation/sdks/best-practices.md` (the uv/ollama/comfy rationale the catalog extends)
- `explanation/sdks/concepts.md` (try area, SDK types, reference implementations pointer)
- `explanation/sdks/sdk-vs-dockerfile.md` (framing for why SDKs are setup units)
- `reference/index.md` (the reference-implementations listing)
</source_docs>
