<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright 2026 Canonical Ltd. -->

# SDK reconstruction (one-off Sonnet 5 calibration round)

Given only a needs-phrased brief ("the server must be reachable from host
tools", "models must survive workshop updates"), does the design-sdk skill
produce an SDK repo functionally equivalent to the reference the Workshop
team actually ships? Mapping need → construct is exactly what the skill
claims to encode, so the briefs never name mechanisms — no "tunnel slot",
no "mount plug", no "systemd unit".

This harness exists for the **one-off Sonnet 5 calibration round** recorded
in `../BASELINE.md`. It is re-runnable (`make eval-reconstruction` in
`../Makefile`) but deliberately **not in CI** and not part of any pinned
baseline pair: candidate `claude-sonnet-5` + the local judge is a pair that
is never re-run, so its rates are not comparable with the suite's pinned
`claude-sonnet-4-6` rows.

## How it differs from the onboard-workshop reconstruction

- **No repo, no scrubbing.** The candidate starts in an EMPTY directory
  with design-sdk + use-workshop installed. The whole reference repo is
  parked as hidden ground truth.
- **Expectations-gated, not diffed.** `compare-sdk.py` gates on a
  calibrated `expectations/<sdk>.json` — interface kinds (by type and
  endpoint, not names), hook sets, part-plugin any-of groups, version
  wiring (adopt-info + VERSION read; the VERSION file itself is advisory
  because reference `main` branches are template branches), renovate
  datasource, README/CI presence. Every expectations file is calibrated so
  the reference repo itself passes its own scorecard.
- **Offline tier only.** Generate-and-stop: no sdkcraft, no workshop, no
  network. What the try loop would verify is reported, not run.

## Running

```console
$ make -C .. eval-reconstruction          # all three SDKs
$ DESIGN_SDKS=uv-sdk make -C .. eval-reconstruction   # fail-fast: smallest first
```

Knobs (see `run-sdk-reconstruction.sh`): `DESIGN_SDKS`, `DESIGN_SDK_ROOT`
(default `~/Documents/SDKs`, resolving `<name>-akcano` then `<name>`),
`DESIGN_RECON_MODEL` (default `claude-sonnet-5`), `RECON_AUTH`
(subscription default), `RECON_JUDGE` (local default), `RECON_CONCURRENCY`
(default 1).

The local clones are **not SHA-pinned**; each run records every clone's
HEAD SHA in `.work/run-*/staging-summary.txt`, and the round's record in
`../BASELINE.md` carries those SHAs. If this round is ever re-run in anger,
migrate the sources to `owner/repo@<sha>` specs first (the sibling
reconstruction's `resolve_source` is the model).

Raw promptfoo output lands in `../results/raw/` (gitignored); the committed
record is the `_summarize.py` slim summary plus the BASELINE.md narrative.
