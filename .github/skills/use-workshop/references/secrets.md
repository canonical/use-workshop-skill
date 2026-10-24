<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
How a workshop user gives an SDK a credential — an API key, a token — without the value ever landing in the workshop definition, the project directory, or a shell profile. Two routes exist (0.9.8+):

- **From the host keyring, through the `secret` interface.** The value stays in the user's keyring; the workshop definition only says *where to look*; an explicit `workshop connect` decides whether the workshop may ask. Each request is a fresh lookup, made only when an SDK command or service asks.
- **Ad hoc, for a single command.** `workshop exec --env NAME` / `workshop run --env NAME`, with `NAME` filled on the host from wherever the credential already lives. Nothing persists.

This file is the user side. Declaring a `secret` plug in an SDK, and consuming the value inside one, is the SDK author's job — the sibling `design-sdk` skill for Store SDKs, `references/in-project-sdk.md` for in-project ones.
</overview>

<choose>
| | From the host keyring | For a single command |
|---|---|---|
| What persists | The value stays in the keyring; the connection survives refreshes until the user disconnects it, removes an endpoint, or changes the slot's lookup | Nothing — the next command doesn't see the value |
| Who can read the value | **Any command in the workshop**, through the connected plug, each time it asks | The command run and the processes it starts, for that run only |
| Per-run effort | None once connected | Name the variable in every command |
| Needs | An SDK that declares a `secret` plug; a desktop session running a freedesktop.org Secret Service keyring (GNOME Keyring); `secret-tool` (`libsecret-tools`) | Nothing beyond the host's own credential store |
| Suits | An SDK the user runs repeatedly | A one-off command the user runs themselves |

If the SDK has no `secret` plug, the keyring route is not available for it — use the single-command route, or ask the SDK's publisher. Never invent a plug name: the SDK's documentation (its README's plugs section) names the plug and the credential it expects.
</choose>

<keyring_route>
**1. Store the credential in the host keyring**, under attributes no other item shares. `secret-tool` prompts for the value, so it never appears on the command line or in shell history:

```
secret-tool store --label="OpenAI API key" --collection=default service openai account work
```

Check it is there **without printing the value** — `secret-tool search` writes the secret to stdout and the attributes to stderr, so discard stdout:

```
secret-tool search service openai account work >/dev/null
```

A match prints its `attribute.<NAME> = <VALUE>` lines; no output means no match. `secret-tool search` **exits 0 either way**, so never script `search … && echo found`. For a yes/no check use `secret-tool lookup service openai account work >/dev/null`, which exits 1 when nothing matches (both verified with libsecret-tools 0.21).

**2. Add a `secret` slot to the `system` SDK** in the workshop definition. Only the `system` SDK can carry a `secret` slot. The slot holds lookup attributes, never the value:

```yaml
name: dev
base: ubuntu@24.04
sdks:
  - name: system
    slots:
      openai-key:
        interface: secret
        attributes:
          service: openai
          account: work
  - name: <SDK>
```

The slot takes exactly two keys:
- `attributes` (required) — at least one name → **string** value. The lookup succeeds only when **exactly one** keyring item carries all of them.
- `collection` (optional) — which keyring collection to search. Omitted, it is the collection the keyring's `default` alias points to (the Login keyring in GNOME Keyring). Any other value is matched against collection labels and must identify exactly one collection; it can't be empty.

Apply it: `workshop launch` for a new workshop, `workshop refresh` for an existing one. Launch/refresh validates the slot's keys and types but **does not look in the keyring** — whether a matching item exists is only known when something asks for the value.

**3. Connect the plug — always by hand.** Workshop never connects a `secret` plug on its own, and a `connections:` entry in the definition does **not** connect it either: the interface policy forbids auto-connection, and a `connections:` pair is still subject to that policy — it is accepted without error and leaves the plug unconnected (verified on 0.9.8). Before connecting, `workshop connections` lists the two ends apart:

```
INTERFACE  PLUG               SLOT                 NOTES
secret     -                  dev/system:openai-key  -
secret     dev/<SDK>:<PLUG>   -                      -
```

Connect them:

```
workshop connect dev/<SDK>:<PLUG> dev/system:openai-key
```

When the slot has the same name as the plug, the one-argument form works too (the slot defaults to `<WORKSHOP>/system:<PLUG>`): `workshop connect dev/<SDK>:<PLUG>`. Afterwards `workshop connections` shows the pair with `manual` in `NOTES`. Connecting reads nothing from the keyring and puts nothing in the workshop; it only permits later requests.

The plug's identifier inside the workshop is `<SDK>.<PLUG>`, using the SDK's **bare** name: a `try-<NAME>` SDK keeps `<NAME>` (connect target `dev/<NAME>:<PLUG>`), and an in-project `project-<NAME>` SDK is `<NAME>` too — `workshopctl get-secret project-<NAME>.<PLUG>` is rejected as an invalid SDK name (verified on 0.9.8). **When you correct the identifier, every `get-secret` command you write carries a redirect** — a bare `workshopctl get-secret <NAME>.<PLUG>` prints the secret to the terminal and into any transcript, so it must not appear even as "the correct call is…" ahead of a safe check:

```
# Wrong — prints the value:
workshop exec dev -- workshopctl get-secret tools.api-key
# Right — the corrected identifier, checked without printing it:
workshop exec dev -- workshopctl get-secret tools.api-key | wc -c
```

Naming the identifier in prose (`tools.api-key`) is fine; it is the runnable command that must be value-safe.

**4. Check it without printing it.** The value is only fetched when requested, so prove the lookup works by requesting it and counting bytes, never by echoing it:

```
workshop exec dev -- workshopctl get-secret <SDK>.<PLUG> | wc -c
```

Or, to see only an error: `workshop exec dev -- workshopctl get-secret <SDK>.<PLUG> > /dev/null` — no output means the lookup succeeded.

**5. Use the SDK as usual.** Its commands (or its systemd service) request the value when they need it. To withdraw access: `workshop disconnect dev/<SDK>:<PLUG>`.
</keyring_route>

<troubleshoot>
A connection doesn't guarantee a lookup succeeds — the keyring is asked only when the value is requested, and how a failure surfaces depends on the SDK. Start with the record of requests: every request creates a change named `Retrieve secret "<WORKSHOP>/<SDK>:<PLUG>"` in `workshop changes` — `Done` means Workshop retrieved the value (not that the process received it), `Error` means retrieval failed. `workshop tasks <ID>` on an `Error` change logs the cause at the end of the line (`… retrieving system secret: secret provider is locked`). Neither changes nor tasks ever contain the value. These records are pruned like any change — troubleshooting history, not an audit trail.

Reproduce by hand with `workshopctl get-secret … > /dev/null`. The messages and exit codes (verified on 0.9.8 except where noted):

| stderr | Exit | Cause | Fix |
|--------|------|-------|-----|
| `cannot retrieve secret for plug "<SDK>.<PLUG>": unlock the secret provider and try again` | 2 | The keyring collection is locked (logged `secret provider is locked`) — doc-sourced | Unlock the keyring in the desktop session, run the command again. Workshop never unlocks it or prompts for a password |
| `no secret found for plug "<SDK>.<PLUG>"` | 1 | No item carries all the slot's attributes, or the named collection doesn't exist | Compare with `secret-tool search <attr> <value>… >/dev/null`, correct the slot, `workshop refresh`, then **connect again** — the changed lookup disconnected the plug |
| `multiple secrets match plug "<SDK>.<PLUG>"; refine the secret slot` | 4 | Several items carry all the attributes | `secret-tool search --all <attr> <value>… >/dev/null` to list them; add an attribute only the intended item carries, `workshop refresh`, connect again — or delete the extra items |
| `secret plug "<SDK>.<PLUG>" is not connected` | 3 | Not connected (often: the user relied on `connections:`) | `workshop connect` as in step 3 |
| `secret plug "<SDK>.<PLUG>" is not found` | 255 | That SDK declares no such plug — wrong name, or an SDK without a secret plug | Read the SDK's documented plug name |
| `error: invalid secret identifier: expected "<SDK>.<secret>" with both names present` / `error: invalid SDK name: …` | 255 | Malformed identifier, or a `project-`/`try-` prefix | Use the bare `<SDK>.<PLUG>` |
| `cannot retrieve secret for plug "<SDK>.<PLUG>": internal error` | 255 | Anything unclassified (no Secret Service on the session bus, an ambiguous collection label…) — doc-sourced | `workshop tasks <ID>` on the failed `Retrieve secret` change has the cause |

The keyring lives in the user's **desktop session**: a headless host, an SSH session without a session bus, or a CI runner has no Secret Service to ask, so the keyring route fails there — use the single-command route with whatever store the machine has. In a VM workshop (`runtime: lxd-vm`) the socket `workshopctl` talks to is not created, so expect `get-secret` not to work at all (`references/runtime.md`).
</troubleshoot>

<lifecycle>
- `workshop refresh` keeps the connection **as long as the slot's `attributes` and `collection` stay the same**. A refresh that changes either disconnects the plug — the new lookup might match a different item — and prints `WARNING: There is 1 new warning. See "workshop warnings".`; `workshop warnings` names it: `disconnected "<WS>/<SDK>:<PLUG>" from "<WS>/system:<SLOT>" because its definition changed` (verified on 0.9.8). Connecting again approves the new lookup; `workshop okay` acknowledges the warning.
- Removing the plug from the SDK, or the slot from the definition, drops the connection. `workshop restore` drops it too (like every manual connection).
- Each request is a fresh lookup: a value changed in the keyring takes effect on the next request, with no refresh.
- Disconnecting stops new requests; it cannot take back a value a process already received.
- The `Retrieve secret` changes show that a request happened, never the value — and they are pruned like any other change. Troubleshooting history, **not an audit trail**: don't promise the user they can review after the fact everything that read the secret.
</lifecycle>

<exposure>
Say these when the user sets up a secret, not only when asked:
- **A connection exposes the secret to the whole workshop**, not to one SDK or one process: while the plug is connected, any process in the workshop can request `<SDK>.<PLUG>` — including other SDKs and anything the user runs.
- A service's systemd credential file is readable by the unit's user and root — and every ordinary workshop process runs as that same `workshop` user. This is not process-level isolation.
- **Before an autonomous coding agent starts in the workshop, disconnect the secret plug** (and ssh-agent, writable mounts, tunnels it doesn't need) unless the agent is meant to use the credential.
- The value crosses the user's D-Bus session bus unencrypted (`plain` algorithm); the boundary is the host user's session, where any process of that user can already reach the keyring. Workshop doesn't persist the value.
</exposure>

<single_command>
For a one-off command, no slot and no connection: give `--env` only the variable's **name**, and Workshop takes the value from the environment of the `workshop` command itself. Fill that from the store, in an assignment that prefixes the command:

```
OPENAI_API_KEY=$(secret-tool lookup service openai account work) workshop exec --env OPENAI_API_KEY dev -- <COMMAND>
```

The shell history records the lookup, not the value, and the variable doesn't outlive the command. A password manager's CLI works the same way once unlocked (`op read …` for 1Password, `bw get password …` for Bitwarden). `workshop run --env NAME -- <action>` takes the same form.

- **Never** `--env OPENAI_API_KEY=<VALUE>` with the value typed in: it stays in shell history and is visible in the host's process list while the command runs.
- A direnv `.envrc` may hold the *lookup* (`export OPENAI_API_KEY=$(secret-tool lookup service openai account work)`), never the value — `.envrc` lives in the project directory, which the workshop sees and version control may pick up. Then `workshop exec --env OPENAI_API_KEY dev -- <COMMAND>`.
- If the named variable isn't set on the host, Workshop skips it **silently** and runs the command without it (verified on 0.9.8) — so a "key missing" error inside usually means the host variable was empty.
</single_command>

<never>
- Never put a secret value in the workshop definition, its `actions:`, project files, `.envrc`, a shell profile, or an SDK hook — all are plain files, the project directory (definition included) is visible inside the workshop and often ends up in version control, and a profile exports to every command.
- Never print a secret to verify it — count bytes (`| wc -c`) or discard stdout.
- Never add a secret pair to `connections:` expecting it to connect; never promise the keyring route on a host without a desktop keyring session.
</never>

<source_docs>
- `how-to/develop-with-workshops/provide-secrets.md` (both routes, the slot, connecting, the error table, the single-command pattern)
- `explanation/interfaces/secret-interface.md` (exposure, lifecycle, why connections drop on lookup changes)
- `reference/definition-files/workshop-definition.md` (the `secret` slot's keys)
- `reference/cli/workshopctl.md` (`get-secret`, its exit codes)
- `reference/cli/workshop.md` (connect, connections, disconnect, warnings, okay, exec `--env`)
- `security.md` (the session-bus boundary; coding agents and connected interfaces)
- `release-notes/v0.9.8.md` (the `secret` interface; connection maintenance on refresh)
</source_docs>
