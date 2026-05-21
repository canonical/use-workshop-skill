#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Run the agentic E2E suite for the use-workshop skill.
#
# Each task spawns `claude -p` in an isolated sandbox, drives a real
# workshop with LXD, and asserts on transcript + captured state. Tasks are
# slow (3-15 min each) and side-effectful (they create and tear down
# LXD containers).
#
# Usage:
#   scripts/run-agentic.sh                    # all tasks, default model (Sonnet 4.6)
#   scripts/run-agentic.sh --filter-pattern bootstrap   # one task by description
#   scripts/run-agentic.sh --model claude-opus-4-7      # override default model

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tests_dir="$(cd "${script_dir}/.." && pwd)"
agentic_dir="${tests_dir}/agentic"
repo_root="$(cd "${tests_dir}/../../../.." && pwd)"

# Bridge token names. claude --bare reads ANTHROPIC_API_KEY only.
if [[ -z "${ANTHROPIC_API_KEY:-}" && -n "${ANTHROPIC_API_TOKEN:-}" ]]; then
  export ANTHROPIC_API_KEY="${ANTHROPIC_API_TOKEN}"
fi
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "error: set ANTHROPIC_API_KEY (or ANTHROPIC_API_TOKEN)" >&2
  exit 1
fi

# Sanity-check the host has what the harness expects.
for bin in claude workshop lxc node; do
  if ! command -v "${bin}" >/dev/null; then
    echo "error: required binary '${bin}' not found on PATH" >&2
    exit 1
  fi
done

# Parse our own --model override; everything else forwards to promptfoo.
model_override=""
forwarded=()
while (( $# > 0 )); do
  case "$1" in
    --model)
      model_override="$2"
      shift 2
      ;;
    --model=*)
      model_override="${1#--model=}"
      shift
      ;;
    *)
      forwarded+=("$1")
      shift
      ;;
  esac
done

# Pass the absolute repo root and (optional) model override to the JS provider
# via env. Relative paths inside agentic/promptfooconfig.yaml are unreliable
# because promptfoo's cwd-resolution differs across versions.
export AGENTIC_REPO_ROOT="${repo_root}"

if [[ -n "${model_override}" ]]; then
  model="${model_override}"
  export AGENTIC_MODEL_OVERRIDE="${model}"
else
  model="claude-sonnet-4-6"
fi

# Default to concurrency 2 — each task creates a real LXD container, and
# 4-way snap install / lxc launch hammering the daemon and disk has been
# observed to thrash. User-supplied -j / --max-concurrency overrides win.
user_set_concurrency=0
for arg in "${forwarded[@]}"; do
  case "${arg}" in
    -j|--max-concurrency|-j=*|--max-concurrency=*)
      user_set_concurrency=1
      ;;
  esac
done
if (( ! user_set_concurrency )); then
  forwarded=("-j" "2" "${forwarded[@]}")
fi

# When any filter / partial-run flag is present, treat the run as a partial:
# raw + summary go under results/raw/ (gitignored) so the canonical baseline
# at results/<date>-agentic-<model>.json is never silently overwritten by a
# subset run.
partial=0
for arg in "${forwarded[@]}"; do
  case "${arg}" in
    --filter-pattern|--filter-pattern=*|--filter|-n|--repeat|--vars)
      partial=1
      ;;
  esac
done

date_tag="$(date -u +%Y-%m-%d)"
time_tag="$(date -u +%H%M%S)"
mkdir -p "${tests_dir}/results/raw"
if (( partial )); then
  raw_json="${tests_dir}/results/raw/${date_tag}-${time_tag}-agentic-${model}.partial.full.json"
  summary_json="${tests_dir}/results/raw/${date_tag}-${time_tag}-agentic-${model}.partial.json"
  echo "(partial run detected — summary will go to results/raw/, not the canonical baseline)"
else
  raw_json="${tests_dir}/results/raw/${date_tag}-agentic-${model}.full.json"
  summary_json="${tests_dir}/results/${date_tag}-agentic-${model}.json"
fi

echo "Running agentic eval against ${model}"
echo "Repo root: ${repo_root}"

cd "${agentic_dir}"
set +e
promptfoo eval --output "${raw_json}" "${forwarded[@]}"
eval_rc=$?
set -e

# Build a slim summary that's safe to commit.
python3 "${script_dir}/_summarize.py" \
  --raw "${raw_json}" \
  --model "${model}" \
  --out "${summary_json}"

echo
echo "Raw:     ${raw_json}"
echo "Summary: ${summary_json}"
exit "${eval_rc}"
