<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<objective>
Set up the SDK Store side and drive the first release: account, name
registration, upload, channel release, CI credentials. The Store is live —
there is no dry run, registrations are effectively permanent, and uploads
are visible. Every Store mutation is confirmed with the user before it
runs.
</objective>

<required_reading>
1. `references/store-publishing.md` — commands, channel grammar, credential
   flow
</required_reading>

<process>

**Step 1. Pack.** `sdkcraft pack` — one artifact per declared platform
(`<NAME>_<ARCH>_<BASE>.sdk`). A failing pack routes to
`iterate-and-debug.md`; nothing is uploaded from a red build.

**Step 2. Account.** `sdkcraft login`, then `sdkcraft whoami` — confirm the
right account is active and report it before anything irreversible.

**Step 3. Register — confirm first.** `sdkcraft register <NAME>`. Names are
global to the Store and normally cannot be re-registered after release; the
name must match `sdkcraft.yaml`'s `name:`. State this, get an explicit go,
then run.

**Step 4. Upload to edge — confirm first.**
`sdkcraft upload <NAME>_<ARCH>_<BASE>.sdk --release <TRACK>/edge`, one
invocation per platform artifact. Record the reported revision numbers.
First releases go to edge; promotion is a separate, verified step.

**Step 5. Verify, then promote.** After the edge revision is exercised (a
workshop consuming `<NAME>` from `<TRACK>/edge` passes the smoke tests):
`sdkcraft release <NAME> <REVISION> <TRACK>/stable` — idempotent, never
rebuilds or re-uploads. Channel grammar: `[<TRACK>/]<RISK>[/<BRANCH>]`,
risk ∈ stable|candidate|beta|edge; branch channels expire after a month.
Non-`latest` tracks need a Store-side guardrail —
`sdkcraft create-track <NAME> --track <TRACK>` only succeeds once the
guardrail exists (requested via an issue on `canonical/workshop`).

**Step 6. CI credentials.** `sdkcraft login --export credentials.txt`; the
file contents become the repo secret (staging:
`SDKCRAFT_STORE_CREDENTIALS_STAGING`). Delete the local file after the
secret is stored. Flip `upload.yml` to
`${{ secrets.SDKCRAFT_STORE_CREDENTIALS_PROD }}` only when the user
declares the SDK production-ready — that flip is the go-live switch, name
it as such and confirm.
</process>

<verification>
- [ ] `whoami` output was reported before register/upload.
- [ ] Register and every upload were individually confirmed.
- [ ] Revision numbers were recorded from upload output, not assumed.
- [ ] Promotion happened only after the edge revision was exercised.
- [ ] No credentials file left on disk after the secret was stored.
</verification>

<anti_patterns>
- Registering or uploading unconfirmed, or claiming a release succeeded
  without the command's output.
- Releasing straight to stable.
- Using a base as a track name (`24.04/stable`).
- Unquoted channels in YAML examples.
- Leaving `credentials.txt` in the working tree or committing it.
- Flipping to the production secret as a side effect of onboarding.
</anti_patterns>

<success_criteria>
- The SDK is registered, its revisions uploaded and released to the agreed
  channels, CI credentials stored as the staging secret, and the
  production flip left as an explicit, named decision.
</success_criteria>

<source_docs>
- `how-to/develop-sdks/publish-an-sdk.md`
- `reference/cli/sdkcraft.md`
</source_docs>
