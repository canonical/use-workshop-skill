<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
How to read a repo's existing build/test/debug machinery and map it onto
workshop constructs. This is the heart of onboarding: the generated definition
should *wrap* what the repo already does — its Makefiles, scripts, CI steps —
never re-invent it. Every extracted fact must carry the file path it came
from; facts without evidence don't go in the proposal.
</overview>

<detection_pass>
Inspect in this order. All read-only — no writes, no workshop commands yet.

1. **Root listing + language census.** `ls -A`; then
   `git ls-files | sed -n 's/.*\.//p' | sort | uniq -c | sort -rn | head -20`
   for the extension histogram. Note monorepo layouts (multiple manifests in
   subdirectories) — each may need its own SDK or its own workshop
   (multi-definition layout).

2. **Language/runtime manifests** — each names an SDK candidate AND often pins
   the channel:
   - `go.mod` → `go` SDK; channel from the `go` directive (`go 1.26` →
     `1.26/stable`).
   - `package.json` → `node` SDK; channel from `engines.node` / `.nvmrc` /
     `.tool-versions` (`"node": ">=24"` → `"24"`). `scripts` map = action
     candidates. `devDependencies` with `electron`, `@vscode/test-electron`,
     `playwright`, `puppeteer` = GUI test host → desktop plug + X libraries
     (see step 4). `packageManager`/lockfile → which install command to wrap
     (`npm ci` vs `pnpm install`).
   - `pyproject.toml` / `requirements*.txt` / `uv.lock` → `uv` SDK;
     `requires-python` pins the interpreter.
   - `Cargo.toml` → `rust`; `rust-toolchain.toml` pins the channel.
   - `global.json` / `*.csproj` → `dotnet`; SDK version from `global.json`.
   - `pubspec.yaml` → `flutter`.
   - CMake/Meson/autotools → compilers via apt (in-project SDK) unless a
     dedicated Store SDK fits.
   - `snapcraft.yaml` / `rockcraft.yaml` / `debian/` → *packaging*, not the
     inner loop. Record as an out-of-loop note, not an action, unless the user
     asks for it.

3. **Build orchestrators** — the repo's own entry points; wrap, don't
   re-implement:
   - Root and subdirectory `Makefile`s: extract `.PHONY` and top targets. A
     docs Makefile becomes `docs-<target>` actions that shell out to it
     (`make -C docs/ html`), never a re-implementation of its recipe.
   - `justfile`, `Taskfile.yml`, `tox.ini`, `noxfile.py`, `gradlew`, `mvnw`:
     same treatment — the action calls the orchestrator.
   - If the orchestrator itself needs installing (just, task, tox), that's an
     SDK/in-project-SDK need, recorded as such.

4. **CI workflows** (`.github/workflows/*.y*ml`, `.gitlab-ci.yml`) — the
   highest-signal source; CI is an executable spec of how the project builds:
   - Exact build/test commands → action bodies.
   - `apt-get install` / `apt install` lines → the package list for an
     in-project SDK's `setup-base` hook.
   - `xvfb-run` usage → GUI test host: desktop plug for headed runs plus an
     `xvfb-run`-wrapped headless action.
   - **GUI test host with no apt evidence:** an Electron-family test
     dependency (`@vscode/test-electron`, `electron`, `playwright`,
     `puppeteer`) is itself sufficient evidence for BOTH constructs — the
     `desktop` plug on the in-project SDK (headed runs/debugging; do not
     omit it just because xvfb covers the headless loop) AND the canonical
     Chromium/Electron library set, encoded in `setup-base` rather than
     left to prose:
     `libatk1.0-0t64 libatk-bridge2.0-0t64 libgtk-3-0t64 libgbm1 libnss3
     libxss1 libasound2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1
     libxrandr2 libxfixes3 libxext6 libpango-1.0-0 libcairo2 libcups2t64
     libdbus-1-3 libexpat1 libxcb1 xvfb` (24.04 names; verify at launch).
   - `services:` containers (postgres, redis) → Store `docker` SDK inside the
     workshop, or a GAP if the setup can't be reproduced.
   - Runner OS (`runs-on: ubuntu-24.04`) → `base:` recommendation.
   - `canonical/launch-workshop` action or `workshop` invocations → the repo
     is already Workshop-aware; stop and surface that instead of onboarding
     over it.

5. **Lint/format configs** → a `lint` action per toolchain:
   - `.golangci.yaml` (multiple configs → multiple invocations in one
     action), `eslint.config.*`, `ruff.toml`, `.pre-commit-config.yaml`.
   - Shell scripts in the tree → a shellcheck action using the repo's own
     pipeline if CI has one.

6. **Dev servers and ports** — every server the developer runs locally is a
   tunnel candidate (slot on the SDK that serves; same-named plug grafted on
   `system`; host port ≥ 1024):
   - Sphinx/mkdocs serve (8000), vite (5173), next/express (3000), flask
     (5000), django (8000), storybook (6006).
   - `docker-compose.yaml` `ports:` mappings.
   - Evidence: serve targets in Makefiles/scripts, `--port` flags, README run
     instructions.

7. **IDE and debug artifacts:**
   - `.vscode/launch.json` / `tasks.json`, `.idea/runConfigurations` → record
     the debug entry points and preLaunch build tasks; note that host-IDE
     attach/F5 into the workshop is wired separately (route to
     `../use-workshop/workflows/ide-integration.md`), the definition alone
     doesn't provide it.
   - `.editorconfig`, devcontainer.json → environment expectations worth
     mirroring (devcontainer `features`/`postCreateCommand` ≈ setup-base
     evidence).

8. **Hardware and host-resource needs:**
   - CUDA/ROCm/torch-with-GPU → `cuda-toolkit`/`rocm` SDK candidates + `gpu`
     interface; consider the multi-definition variant layout
     (`.workshop/cuda.yaml` + `.workshop/rocm.yaml`).
   - Serial/embedded flashing (`/dev/tty*`, udev rules) → `custom-device`
     plug (by `subsystem`/`vendorid`); flashing may still be a GAP.
   - Webcam/GUI apps → `camera`/`desktop` plugs.
   - Private git dependencies (go.mod `replace` to private hosts, git+ssh in
     requirements) → `ssh-agent` plug.
</detection_pass>

<signal_to_construct_table>
| Signal (with evidence file) | Extract | Workshop construct |
|-----------------------------|---------|--------------------|
| `go.mod` `go 1.26` | major.minor | `go` SDK, `channel: 1.26/stable` |
| `package.json` `engines.node: 24` | major | `node` SDK, `channel: "24"` |
| npm `scripts.test` | command | `test:` action wrapping `npm run test` |
| Makefile target `html` in `docs/` | target name | `docs-html:` action `make -C docs/ html` |
| CI `apt-get install libgtk-3-0 xvfb …` | package list | in-project SDK `hooks/setup-base` |
| CI `xvfb-run -a npm test` | wrapper | `test-ci:` action (headless) + desktop plug (headed) |
| Sphinx serve on :8000 | port | tunnel slot (serving SDK) + `system` plug, endpoint 8000 |
| `.golangci.yaml` + `.golangci.incremental.yaml` | both configs | one `lint:` action, two invocations |
| `go test -coverpkg` in CI | flags | `cover:` action verbatim |
| `docker-compose.yaml` | services, ports | `docker` SDK + compose-wrapping action + tunnels |
| `.vscode/launch.json` | debug entry | note + `ide-integration.md` pointer |
| torch + CUDA in requirements | variant | `cuda-toolkit` SDK + `gpu` plug (ROCm variant file if needed) |
| snapcraft.yaml | packaging | out-of-loop note (not an action by default) |
</signal_to_construct_table>

<action_conventions>
- Names: bare verbs for the primary loop (`build`, `test`, `lint`), prefixed
  for domains (`docs-html`, `docs-run`, `test-ci`). Lowercase, hyphens.
- Forward arguments where the wrapped tool takes them: `<tool> "$@"`.
- Actions run under `errexit`+`pipefail` — multi-command actions stop at the
  first failure, which is what CI parity wants; don't add `set -e` yourself.
- One action per developer intent, not per underlying command; a `lint` action
  may run three linters.
- The action body calls the repo's real entry point (`make -C docs/ html`,
  `npm run test`) so the definition stays correct when the underlying recipe
  changes.
</action_conventions>

<repo_facts_format>
End the analysis with exactly this block — it is the input to the proposal:

```
## Repo Facts

Languages: <primary + secondary, from census>
Toolchain: <runtime/version — evidence file>
Build: <command — evidence file>
Test: <command(s) — evidence file>
Lint: <command(s) — evidence file>
Dev servers: <name: port — evidence file> | none found
Setup deps: <apt/other packages — evidence file> | none found
Hardware/host needs: <gpu/device/desktop/ssh — evidence> | none found
Packaging (out of loop): <snapcraft/docker release/… — evidence> | none found
Existing workshop files: none | <path — STOP, route to use-workshop>
Debug/IDE: <launch.json entries, F5 flow — evidence> | none found
```
</repo_facts_format>

<source_docs>
- `reference/definition-files/workshop-definition.md`
- `how-to/customize-workshops/add-actions.md`
- `how-to/customize-workshops/forward-ports.md`
- `how-to/customize-workshops/use-host-devices.md`
- `how-to/develop-sdks/write-runtime-hooks.md`
- `how-to/develop-with-workshops/run-workshops-in-github-actions.md`
- `how-to/develop-with-workshops/connect-vscode.md`
</source_docs>
