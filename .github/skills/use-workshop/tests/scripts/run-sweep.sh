#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Run run-routing.sh across a list of tiers, with sweep-level error handling:
#
# - CONTINUE past assertion failures (run-routing.sh exit 1) — a tier with
#   failing cases is a normal diagnostic outcome; the remaining tiers still
#   carry signal. The sweep re-exits 1 at the end so the failure isn't lost.
# - ABORT on run-level errors (exit 2: judge/API/auth/credits) — every
#   subsequent tier would hit the same wall, burning candidate-model spend
#   for runs that get quarantined to results/raw/ anyway.
#
# Usage:
#   scripts/run-sweep.sh --model claude-sonnet-4-6 claude-haiku-4-5 ...
#   scripts/run-sweep.sh --provider openrouter:z-ai/glm-4.5-air openrouter:z-ai/glm-4.5 ...
#
# The first argument is the run-routing.sh flag to use; every remaining
# argument is one tier swept with that flag.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if (( $# < 2 )) || [[ "$1" != "--model" && "$1" != "--provider" ]]; then
  echo "usage: $0 --model|--provider <tier> [<tier>...]" >&2
  exit 64
fi
flag="$1"
shift

rc=0
for tier in "$@"; do
  set +e
  bash "${script_dir}/run-routing.sh" "${flag}" "${tier}"
  r=$?
  set -e
  if (( r == 2 )); then
    echo >&2
    echo "error: aborting sweep — '${tier}' hit run-level errors (judge/API/auth/" >&2
    echo "       credits). Remaining tiers skipped; fix the cause and re-run them." >&2
    exit 2
  fi
  if (( r != 0 )); then
    rc=1
  fi
done
exit "${rc}"
