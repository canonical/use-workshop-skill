<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

<overview>
Store-side publishing: pack → register → upload → release. Everything past
`pack` talks to the LIVE SDK Store — there is no dry-run or staging mode for
the CLI commands, so each Store mutation is confirmed with the user before
running. CI automation of this loop is `onboarding-ci.md`'s territory; this
file covers the commands and the channel model.
</overview>

<pack_vs_try>
`sdkcraft pack` builds one artifact per declared platform
(`<NAME>_<ARCH>_<BASE>.sdk`) and leaves them in the working directory;
`sdkcraft try` is the same build but copies the artifacts into the try area
for local consumption as `try-<name>`. Publish from a clean build:
`sdkcraft clean && sdkcraft pack`.
</pack_vs_try>

<account_and_registration>
- `sdkcraft login` authenticates (Ubuntu One); `sdkcraft whoami` confirms
  the active account — always check before mutating the Store.
- `sdkcraft register <NAME>` reserves the name: once per SDK, ever. Names
  are global and normally cannot be re-registered after release; the name
  must match `name:` in `sdkcraft.yaml`. Confirm with the user before
  registering.
- `sdkcraft login --export credentials.txt` mints credentials without
  touching the local keyring — the file's contents become the CI repository
  secret (`SDKCRAFT_STORE_CREDENTIALS_PROD`). Treat the file as a secret:
  never commit it, delete it after the secret is stored.
</account_and_registration>

<upload_and_release>
- `sdkcraft upload <artifact>.sdk` pushes one file and reports its revision
  number; the revision is not yet visible to `sdk find` until released.
  Upload one artifact PER platform — the Store tracks revisions per
  platform.
- `sdkcraft upload <artifact>.sdk --release <track>/edge` uploads and
  releases in one step — the standard first-publish shape: land on `edge`,
  verify, then promote.
- `sdkcraft release <NAME> <REVISION> <CHANNELS>` promotes an existing
  revision (idempotent; adjusts only the channel map). Channels accept
  comma-separated lists (`beta,edge`).
</upload_and_release>

<channels>
Channel shape: `[<TRACK>/]<RISK>[/<BRANCH>]`.
- TRACK groups revisions along major-version lines or platform variants
  (`1.x`, `nvidia`); omitted = `latest`. Never use the base (e.g. `24.04`)
  as a track — the Store already tracks revisions per platform.
- RISK: `stable`, `candidate`, `beta`, `edge`.
- BRANCH: optional, short-lived, expires after one month.
- Non-`latest` tracks must exist first: `sdkcraft create-track <NAME>
  --track <TRACK>` — and it only succeeds within a Store-side guardrail
  pattern. Guardrails are not self-service: request one via a GitHub issue
  on the Workshop repository naming the SDK and the track pattern.
</channels>

<source_docs>
- `how-to/develop-sdks/publish-an-sdk.md` (the four-step flow, credentials, channels, guardrails)
- `reference/cli/sdkcraft.md` (store subcommand signatures)
- `explanation/sdks/lifecycle.md` (publish stage in the SDK lifecycle)
</source_docs>
