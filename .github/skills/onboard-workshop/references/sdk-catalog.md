<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Codified catalog of known published SDKs, derived from the public
`canonical/reference-sdks` index. This is a FALLBACK for when the `sdk` CLI is
unavailable or its search misses — always prefer a live `sdk find <keyword>` +
`sdk info <name>` (they are the ground truth for existence, channels, and
supported bases). Any SDK proposed from this table and not confirmed live MUST
be tagged "(catalog, unverified — confirm with `sdk info` before launch)".

**Precision here is not authority.** Some rows carry a corrected Store name or
a narrowed channel list; that records what was true when the table was
generated, and it is still a catalog claim, not a confirmation. A name being
spelled exactly right is not evidence the SDK exists on this machine, on this
base, or on that channel today. Run `sdk find` / `sdk info` and say what came
back — never present a catalog row as settled fact because it looks specific.

Regenerate via `tests/scripts/update-sdk-catalog.sh` (maintainer-only).
</overview>

<catalog>
<!-- catalog:start -->
Generated from canonical/reference-sdks @ 070f581d on 2026-09-22 (hand-curated v1)
— fallback only; always prefer live `sdk find`.

| SDK | Provides | Typical channels | Matching repo signals |
|-----|----------|------------------|----------------------|
| `go` | Go toolchain + module cache mount | `1.26/stable`, `latest/stable` | `go.mod`, `*.go` |
| `node` | Node.js LTS + Corepack; npm/pnpm/yarn cache mounts; inspector tunnel slot | `"24"`, `"22"`, `latest/stable` | `package.json`, lockfiles |
| `rust` | Rust toolchain | `latest/stable` | `Cargo.toml` |
| `dotnet` | .NET SDK | `10/stable`, `9/stable`, `8/stable` | `global.json`, `*.csproj` |
| `flutter` | Flutter SDK | `latest/stable` | `pubspec.yaml` |
| `uv` | Python via uv; shared-venv slot (`uv:venv`) — venv created in `setup-base` (0.9.4+), so `uv:venv` consumers have no install-ordering issues | `latest/stable` | `pyproject.toml`, `requirements*.txt`, `uv.lock` |
| `openjdk` | Java (OpenJDK) toolchain (0.9.4+) | `latest/stable` | `*.java`, `pom.xml`, `build.gradle` |
| `maven` | Maven build tool (0.9.4+; pair with `openjdk`) | `latest/stable` | `pom.xml`, `mvnw` |
| `gradle` | Gradle build tool (0.9.4+; pair with `openjdk`) | `latest/stable` | `build.gradle(.kts)`, `gradlew` |
| `docker-ce` | Docker engine inside the workshop (Store name is `docker-ce`, not `docker`) | `latest/stable` | `Dockerfile`, `docker-compose.yaml`, CI `services:` |
| `cuda-toolkit` | NVIDIA CUDA toolkit | `latest/stable` | CUDA/torch-gpu deps |
| `rocm` | AMD ROCm stack | `latest/stable` | ROCm deps |
| `openvino` | Intel OpenVINO | `latest/stable` | OpenVINO deps |
| `ollama` | Ollama model server (service + tunnel) | `vulkan/stable`, `cuda/stable`, `rocm/stable`, `cpu/stable` | Ollama client code, model files |
| `comfy` | ComfyUI serving (Store name is `comfy`, not `comfy-ui`) | `latest/stable` | ComfyUI workflows |
| `jupyter` | JupyterLab (service + tunnel; `venv` plug) | `latest/stable` | `*.ipynb` |
| `ros2` | ROS 2 | `latest/stable` | `package.xml`, colcon |
| `zephyr` + `zephyr-sdk-ng` + `zephyr-<arch>` | Zephyr RTOS + arch toolchains (wired via `connections:`) | `4.4/stable`, `1.0.1/stable` | `west.yml`, Zephyr trees |
| `direnv` | direnv | `latest/stable` | `.envrc` |
| `vscode-remote` | VS Code remote server prerequisites — **deprecated (0.9.5)**: automatic OpenSSH config makes it obsolete and the `canonical.workshop` VS Code extension has taken over; still published, but do NOT propose for new definitions — steer to the extension or plain Remote-SSH via `<ws>.<project>.wp` | `latest/stable` | user wants VS Code attach (legacy repos may still list it) |
| `github-runner` | Self-hosted GitHub Actions runner | `latest/stable` | act/runner workflows |
| `claude-code`, `codex`, `copilot`, `opencode`, `agy` | AI coding agents (`agy` = Antigravity CLI, 0.9.4+) | `latest/stable` | user asks for agent tooling |
<!-- catalog:end -->
</catalog>

<usage_rules>
- Channels shown are the commonly used ones at generation time, NOT a promise —
  `sdk info <name>` is authoritative and channels drift.
- A toolchain absent here AND absent from `sdk find` results → in-project SDK
  (apt recipe) or a GAP; never invent a Store name.
- Pairing notes ("pair with `openjdk`") and version floors ("0.9.4+") are
  catalog claims too. Proposing a pair still means confirming BOTH names live,
  or tagging both unverified — a confident sentence about how two SDKs work
  together is not a substitute for `sdk find`.
- Cache/venv plugs (e.g. `node` caches, `uv:venv`) auto-wire or wire via
  `connections:` — see `references/reference-patterns.md`.
</usage_rules>

<source_docs>
- `reference/cli/sdk.md`
- `reference/sdks.md`
- `explanation/sdks/concepts.md`
</source_docs>
