#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Maintainer-only: refresh the SDK list stamp in references/sdk-catalog.md.
#
# Fetches the public canonical/reference-sdks README (via gh) and, when the
# `sdk` CLI is present, `sdk find ""` output, then prints both alongside the
# current catalog table for the maintainer to reconcile BY HAND. The table
# between <!-- catalog:start --> and <!-- catalog:end --> is curated (the
# "matching repo signals" column is editorial and cannot be generated), so
# this script deliberately does not rewrite it — it updates only the stamp
# line and shows the diff sources. Not part of `make check`; commit the result
# like the sibling's docs-manifest.txt.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_root="$(cd "${script_dir}/../.." && pwd)"
catalog="${skill_root}/references/sdk-catalog.md"

if [[ ! -f "${catalog}" ]]; then
  echo "error: ${catalog} not found" >&2
  exit 1
fi

echo "== Current catalog table (curated) =="
sed -n '/<!-- catalog:start -->/,/<!-- catalog:end -->/p' "${catalog}"
echo

if command -v gh >/dev/null 2>&1; then
  echo "== canonical/reference-sdks README (upstream source) =="
  sha="$(gh api repos/canonical/reference-sdks/commits/main --jq .sha 2>/dev/null | cut -c1-8 || true)"
  gh api repos/canonical/reference-sdks/readme --jq .content 2>/dev/null | base64 -d || {
    echo "warning: could not fetch the README via gh; reconcile manually." >&2
  }
else
  sha=""
  echo "warning: gh not found; skipping upstream README fetch." >&2
fi
echo

if command -v sdk >/dev/null 2>&1; then
  echo "== Live store listing (sdk find) =="
  sdk find "" || true
elif command -v workshop >/dev/null 2>&1; then
  echo "== Live store listing (workshop.sdk find) =="
  workshop.sdk find "" 2>/dev/null || true
else
  echo "note: no sdk CLI on PATH; live listing skipped." >&2
fi
echo

today="$(date -u +%Y-%m-%d)"
stamp="Generated from canonical/reference-sdks @ ${sha:-main} on ${today}"
sed -i "s|^Generated from canonical/reference-sdks @ .* on [0-9-]*|${stamp}|" "${catalog}"
echo "Updated stamp line in ${catalog}: ${stamp}"
echo "Now reconcile the table by hand against the sources above and commit."
