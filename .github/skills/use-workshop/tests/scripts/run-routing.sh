#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Run the routing eval for the use-workshop skill.
#
# - Regenerates skill-bundle.md from current SKILL.md/references/workflows.
# - Bridges ANTHROPIC_API_TOKEN to ANTHROPIC_API_KEY (promptfoo's anthropic
#   provider expects the latter).
# - Invokes `promptfoo eval` against tests/promptfooconfig.yaml.
# - Writes raw JSON to tests/results/raw/ (gitignored, ~MB-scale).
# - Writes a slim summary to tests/results/<date>-routing-<model>.json
#   (committed, ~KB-scale; one row per case + meta totals).
#
# Usage:
#   scripts/run-routing.sh                                  # default: first provider in config
#   scripts/run-routing.sh --model claude-haiku-4-5         # scope to one model
#   scripts/run-routing.sh --filter-pattern foo             # passes through to promptfoo

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tests_dir="$(cd "${script_dir}/.." && pwd)"

# Bridge token names. promptfoo's anthropic provider reads ANTHROPIC_API_KEY.
if [[ -z "${ANTHROPIC_API_KEY:-}" && -n "${ANTHROPIC_API_TOKEN:-}" ]]; then
  export ANTHROPIC_API_KEY="${ANTHROPIC_API_TOKEN}"
fi
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "error: set ANTHROPIC_API_KEY (or ANTHROPIC_API_TOKEN)" >&2
  exit 1
fi

# Always regenerate the bundle so the eval reflects current skill content.
bash "${script_dir}/regenerate-bundle.sh"

# Parse our own --model flag out of $@; everything else is forwarded to promptfoo.
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

if [[ -n "${model_override}" ]]; then
  model="${model_override}"
  forwarded+=("--filter-providers" "anthropic:messages:${model}")
else
  # Pull the first provider's model id from promptfooconfig.yaml for the result filename.
  # Format in the config: `id: anthropic:messages:claude-sonnet-4-6`.
  model="$(awk '/^[[:space:]]*-?[[:space:]]*id:[[:space:]]*anthropic:messages:/ {
    sub(/^.*anthropic:messages:/, ""); print; exit }' "${tests_dir}/promptfooconfig.yaml")"
  if [[ -z "${model}" ]]; then
    model="unknown-model"
  fi
fi

# When any filter / partial-run flag is present, treat the run as a partial:
# raw + summary go under results/raw/ (gitignored) so the canonical baseline
# at results/<date>-routing-<model>.json is never silently overwritten by a
# subset run. (Provider filtering by --model is NOT a partial run — it's a
# full single-model eval.)
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
  raw_json="${tests_dir}/results/raw/${date_tag}-${time_tag}-routing-${model}.partial.full.json"
  summary_json="${tests_dir}/results/raw/${date_tag}-${time_tag}-routing-${model}.partial.json"
else
  raw_json="${tests_dir}/results/raw/${date_tag}-routing-${model}.full.json"
  summary_json="${tests_dir}/results/${date_tag}-routing-${model}.json"
fi

cd "${tests_dir}"
echo "Running promptfoo eval against ${model}"
if (( partial )); then
  echo "(partial run detected — summary will go to results/raw/, not the canonical baseline)"
fi
# promptfoo exits non-zero when assertions fail; that's a normal eval outcome.
# Capture the code, always run the summary, then re-emit it so CI can detect
# regressions while still committing the slim summary.
set +e
promptfoo eval --output "${raw_json}" "${forwarded[@]}"
eval_rc=$?
set -e

# Build a slim summary that's safe to commit. Strips full model responses /
# raw prompts; keeps per-case verdicts, failed-assertion details, totals.
python3 "${script_dir}/_summarize.py" \
  --raw "${raw_json}" \
  --model "${model}" \
  --out "${summary_json}"

echo
echo "Raw:     ${raw_json}"
echo "Summary: ${summary_json}"
exit "${eval_rc}"
