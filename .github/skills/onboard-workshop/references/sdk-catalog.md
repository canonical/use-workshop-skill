<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Codified catalog of known published SDKs, derived from the public
`canonical/reference-sdks` index. This is a FALLBACK for when the `sdk` CLI is
unavailable or its search misses — always prefer a live `sdk find <keyword>` +
`sdk info <name>` (they are the ground truth for existence, channels, and
supported bases). Any SDK proposed from this table and not confirmed live MUST
be tagged "(catalog, unverified — confirm with `sdk info` before launch)".
Regenerate via `tests/scripts/update-sdk-catalog.sh` (maintainer-only).
</overview>

<catalog>
<!-- catalog:start -->
Generated from canonical/reference-sdks @ main on 2026-07-23 (hand-curated v1)
— fallback only; always prefer live `sdk find`.

| SDK | Provides | Typical channels | Matching repo signals |
|-----|----------|------------------|----------------------|
| `go` | Go toolchain + module cache mount | `1.26/stable`, `latest/stable` | `go.mod`, `*.go` |
| `node` | Node.js LTS + Corepack; npm/pnpm/yarn cache mounts; inspector tunnel slot | `"24"`, `"22"`, `latest/stable` | `package.json`, lockfiles |
| `rust` | Rust toolchain | `latest/stable` | `Cargo.toml` |
| `dotnet` | .NET SDK | `9/stable`, `8/stable` | `global.json`, `*.csproj` |
| `flutter` | Flutter SDK | `latest/stable` | `pubspec.yaml` |
| `uv` | Python via uv; shared-venv slot (`uv:venv`) | `latest/stable` | `pyproject.toml`, `requirements*.txt`, `uv.lock` |
| `docker` | Docker engine inside the workshop | `latest/stable` | `Dockerfile`, `docker-compose.yaml`, CI `services:` |
| `cuda-toolkit` | NVIDIA CUDA toolkit | `latest/stable` | CUDA/torch-gpu deps |
| `rocm` | AMD ROCm stack | `latest/stable` | ROCm deps |
| `openvino` | Intel OpenVINO | `latest/stable` | OpenVINO deps |
| `ollama` | Ollama model server (service + tunnel) | `vulkan/stable`, `cpu/stable` | Ollama client code, model files |
| `comfy-ui` | ComfyUI serving | `24.04/edge` | ComfyUI workflows |
| `jupyter` | JupyterLab (service + tunnel; `venv` plug) | `latest/stable` | `*.ipynb` |
| `ros2` | ROS 2 | `latest/stable` | `package.xml`, colcon |
| `zephyr` + `zephyr-sdk-ng` + `zephyr-<arch>` | Zephyr RTOS + arch toolchains (wired via `connections:`) | `4.3/stable`, `0.17.4/stable` | `west.yml`, Zephyr trees |
| `esp32-core` | ESP-IDF | `24.04/edge` | `idf.py`, ESP-IDF projects |
| `direnv` | direnv | `latest/stable` | `.envrc` |
| `vscode-remote` | VS Code remote server prerequisites | `latest/stable` | user wants VS Code attach |
| `github-runner` | Self-hosted GitHub Actions runner | `latest/stable` | act/runner workflows |
| `claude-code`, `codex`, `copilot`, `opencode`, `agy` | AI coding agents | `latest/stable` | user asks for agent tooling |
<!-- catalog:end -->
</catalog>

<usage_rules>
- Channels shown are the commonly used ones at generation time, NOT a promise —
  `sdk info <name>` is authoritative and channels drift.
- A toolchain absent here AND absent from `sdk find` results → in-project SDK
  (apt recipe) or a GAP; never invent a Store name.
- Cache/venv plugs (e.g. `node` caches, `uv:venv`) auto-wire or wire via
  `connections:` — see `references/reference-patterns.md`.
</usage_rules>

<source_docs>
- `reference/cli/sdk.md`
- `reference/sdks.md`
- `explanation/sdks/concepts.md`
</source_docs>
