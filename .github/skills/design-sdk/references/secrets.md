<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
How an SDK consumes a credential — an API key, a subscription token —
without shipping or storing it (Workshop 0.9.8+, SDKcraft 0.9.4+). The SDK
declares a `secret` plug; each user adds a matching slot (a lookup in their
own host keyring) to their workshop definition and connects it by hand; the
SDK requests the value at the moment it is needed with
`workshopctl get-secret <SDK>.<PLUG>`, or lets systemd request it for a
service. The value never enters the SDK, its hooks, or any file the SDK
writes. The user-side half (slot, connect, errors) is the sibling's
`../use-workshop/references/secrets.md`; load it when the README or a test
needs the consumer's steps.
</overview>

<when>
Use a `secret` plug when the tool needs a credential **the user supplies**:
an API key, a personal access token, a subscription token. It is not for
state the tool writes for itself (an OAuth session it refreshes, a login
cache, settings) — that is user data and stays on a **mount** plug. Many
agent SDKs need both; the reference shape is in
`reference-sdk-patterns.md` (claude-code).
</when>

<declare>
In `sdkcraft.yaml` — a name and the interface, nothing else (the schema's
`SecretPlug` has `additionalProperties: false`; there are no lookup
attributes and never a value):

```yaml
plugs:
  api-key:
    interface: secret
```

- Only regular SDKs declare `secret` plugs; slots belong to the user's
  `system` SDK and never ship with the SDK.
- Inside the workshop the identifier is `<SDK>.<PLUG>` with the SDK's own
  name — `claude-code.api-key`. Under `sdkcraft try` the workshop lists the
  SDK as `try-<SDK>`, but the identifier and the connect target keep the
  bare name (`workshop connect dev/<SDK>:api-key dev/system:<slot>`).
- **Workshop never connects it.** Not at launch, not via `connections:`.
  So the README must name the plug and the credential it expects, give the
  consumer's store/slot/connect steps, and the SDK must behave sensibly when
  the plug is unconnected or the lookup fails.
</declare>

<delivery>
Pick the mechanism by what consumes the credential:

| What needs it | Mechanism | Why |
|---|---|---|
| A tool with a credential-helper setting | The tool runs `workshopctl get-secret <SDK>.<PLUG>` itself (e.g. Claude Code's `apiKeyHelper`) | Fetched only when needed; never in the tool's environment, so not inherited by what the tool runs |
| A command that reads stdin | Pipe from `workshopctl get-secret` | Stays out of the environment |
| A command that only reads an env var | An SDK-shipped **wrapper** that exports it for the tool process only | The variable lives in the wrapper and the process it starts |
| A long-running systemd service | `LoadCredential=` in the unit | systemd requests the value on each start, as a credential file |
| A value the user passes for one command | The user's `workshop exec --env NAME` | No slot or connection; the wrapper should honour it |

**Credential helper** — preferred when the tool has one. Configure it to run
`workshopctl get-secret <SDK>.<PLUG>`. A helper that *fails* usually does not
fall back to the tool's other logins, so enable it only when the secret is
readable — the claude-code wrapper probes first:
`workshopctl get-secret claude-code.api-key >/dev/null 2>&1 && args=(--settings '{"apiKeyHelper": "workshopctl get-secret claude-code.api-key"}')`.

**Wrapper** — for a tool that reads only an environment variable. A value
the user already set takes precedence (that is how the single-command
`--env NAME` route overrides the plug):

```bash
#!/usr/bin/bash
# Runs secret-demo-tool with the API key from the connected secret plug.
# A key already set in the environment takes precedence.
sdk_dir=$(dirname "$(dirname "$(readlink -f "$0")")")

if [[ -z "${SECRET_DEMO_API_KEY:-}" ]]; then
  if key=$(workshopctl get-secret secret-demo.api-key); then
    export SECRET_DEMO_API_KEY="$key"
  fi
  unset key
fi

exec "$sdk_dir/bin/secret-demo-tool" "$@"
```

On failure `get-secret` already wrote its diagnostic; the wrapper starts the
tool without the variable so the tool can use another login or say the key
is missing. For an intentional silent fallback, discard stderr for the
request only (`key=$(workshopctl get-secret secret-demo.api-key 2>/dev/null)`)
— the `Retrieve secret` change still records the failure. Ship the wrapper
as part content (a `dump` part) and put **its** directory on `PATH` from
`setup-base` (`/etc/profile.d/<sdk>.sh`), not the real binary's.

**systemd service** — runtime hooks receive `SDK_SYSTEMD_SECRET_SOCKET`; the
unit installed by `setup-base` points `LoadCredential=` at it, and the
service reads `$CREDENTIALS_DIRECTORY/<sdk>.<plug>`:

```bash
cat >/etc/systemd/system/secret-demo.service <<UNIT
[Unit]
Description=Secret demo service

[Service]
User=workshop
LoadCredential=secret-demo.api-key:${SDK_SYSTEMD_SECRET_SOCKET}
ExecStart=${SDK}/bin/secret-demo-service
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now secret-demo.service
```

If the plug is unconnected or the lookup fails, systemd **still starts the
unit with an empty credential** (`get-secret --systemd` exits 0 for an
unconnected plug). The service must reject that (`[[ -s "$key_file" ]]` or
exit non-zero) and the unit needs a restart policy, because an empty
credential is *expected* twice: on first launch (the service starts before
the user connects the plug) and on every refresh of an updated SDK
(`setup-base` runs before Workshop restores preserved connections). Tell the
user `workshop exec <ws> -- sudo systemctl restart <unit>` after connecting.
Debug with `sudo journalctl --no-pager -u <unit> -u 'workshop-secret@*'`.
</delivery>

<failure_handling>
`workshopctl get-secret` writes the value to stdout and, on failure, a short
diagnostic to stderr with a status that names the cause: `1` not found ·
`2` keyring locked · `3` plug not connected · `4` several items match ·
`255` anything else (undeclared plug, malformed id, internal error). Branch
on the status when the SDK must tell these apart. Rules:

- Never turn a failed lookup into a success-shaped result (an empty key
  exported as if valid, a health check that reports `okay`).
- Keep `set -x` off anywhere a value is assigned or substituted — and never
  fetch a secret in a hook: `workshop launch/refresh --verbose` turns on
  `xtrace` for hooks, and at `setup-base` time no connection exists yet.
- `check-health` must not depend on the secret being connected — an
  unconnected plug is a normal state for a fresh workshop, not a broken SDK.
- Every request leaves a `Retrieve secret "<WS>/<SDK>:<PLUG>"` change (never
  the value) — point users there when the tool hides the error.
</failure_handling>

<exposure>
Document these in the README, especially for an SDK that runs autonomous
tools:

| Mechanism | What can read the value | What the SDK cannot clean up |
|---|---|---|
| Helper / stdin | The consuming process and whatever it passes the value to | While connected, any workshop process can make a new request |
| Wrapper | The tool and every process it starts, via its environment | Same — any process can call `get-secret` |
| systemd credential | The unit's user, root, and other processes running as that user | The file stays until systemd stops the service |
| Single-command `--env` | The command and every process it starts | A variable the user's shell (or direnv) exports reaches every command run from there |

A connection exposes the secret to the **whole workshop**, not just this
SDK. Disconnecting stops new requests but cannot withdraw a value a process
already holds.
</exposure>

<testing>
In the try loop: store a throwaway value
(`secret-tool store --label="<sdk> test key" --collection=default service <sdk> account test`,
entering e.g. the 23-byte `not-a-real-secret-value`), add a `system` secret
slot with those attributes to the test workshop definition alongside
`try-<sdk>`, `workshop launch`, connect the bare-name plug, then check with
`workshop exec dev -- workshopctl get-secret <sdk>.<plug> | wc -c` — never by
printing. Also exercise the failure path: disconnect and confirm the tool
reports a missing key instead of pretending. The connection persists across
the `sdkcraft try` → `workshop refresh` loop.

Spread runners have no desktop keyring, so spread smoke tests must not
depend on a connected secret: assert the wrapper is on `PATH` and the tool
starts (and fails cleanly) without one, as the claude-code SDK's
`claude-wrapper-on-path` test does.
</testing>

<never>
Never put a secret — or a real-looking example of one — in SDK content,
`sdkcraft.yaml`, hooks, shell profiles, the README, spread tests, or logs.
Each ships, persists, or is shared. Never invent lookup attributes into
`sdkcraft.yaml`; the lookup is the user's, in their workshop definition.
</never>

<source_docs>
- `how-to/develop-sdks/use-secrets.md` (declare, test connection, helper, wrapper, systemd, single command, exposure)
- `explanation/interfaces/secret-interface.md` (identity, lifecycle, the bus boundary)
- `reference/cli/workshopctl.md` (`get-secret`, exit statuses, `--systemd`)
- `reference/definition-files/sdkcraft-definition.md` (the `secret` plug)
- `explanation/sdks/best-practices.md` (systemd services and `LoadCredential=`)
- `release-notes/v0.9.8.md` (Workshop 0.9.8 / SDKcraft 0.9.4)
</source_docs>
