#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Run the routing eval for the use-workshop skill.
#
# - Regenerates skill-bundle.md from current SKILL.md/references/workflows.
# - Bridges ANTHROPIC_API_TOKEN to ANTHROPIC_API_KEY (promptfoo's anthropic
#   provider expects the latter). OpenRouter providers read OPENROUTER_API_KEY.
# - Invokes `promptfoo eval` against tests/promptfooconfig.yaml, scoped to a
#   single declared provider via --filter-providers (so its config block, and
#   thus temperature 0, is preserved — the run stays deterministic).
# - Writes raw JSON to tests/results/raw/ (gitignored, ~MB-scale).
# - Writes a slim summary to tests/results/<date>-routing-<tag>.json
#   (committed, ~KB-scale; one row per case + meta totals).
#
# Usage:
#   scripts/run-routing.sh                                  # default: Anthropic Sonnet 4.6
#   scripts/run-routing.sh --model claude-haiku-4-5         # scope to one Anthropic tier
#   scripts/run-routing.sh --provider openrouter:z-ai/glm-4.5    # any declared provider
#   scripts/run-routing.sh --filter-pattern foo             # passes through to promptfoo
#
# --model and --provider are mutually exclusive. A --provider id must be
# declared in promptfooconfig.yaml (undeclared -> hard error).

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tests_dir="$(cd "${script_dir}/.." && pwd)"

# Preflight: fail with a clear message instead of a mid-run command-not-found.
for cmd in promptfoo python3; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "error: '${cmd}' not found on PATH" >&2
    [[ "${cmd}" == promptfoo ]] && echo "install it with: npm install -g promptfoo" >&2
    exit 1
  fi
done

# Bridge token names. promptfoo's anthropic provider reads ANTHROPIC_API_KEY.
# (The OpenRouter provider reads OPENROUTER_API_KEY natively — no bridge needed.)
# The actual key REQUIREMENT is enforced after flag parsing, once we know which
# provider this run targets.
if [[ -z "${ANTHROPIC_API_KEY:-}" && -n "${ANTHROPIC_API_TOKEN:-}" ]]; then
  export ANTHROPIC_API_KEY="${ANTHROPIC_API_TOKEN}"
fi

# Always regenerate the bundle so the eval reflects current skill content.
bash "${script_dir}/regenerate-bundle.sh"

# Parse our own --model / --provider flags out of $@; everything else is
# forwarded to promptfoo.
model_override=""
provider_override=""
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
    --provider)
      provider_override="$2"
      shift 2
      ;;
    --provider=*)
      provider_override="${1#--provider=}"
      shift
      ;;
    *)
      forwarded+=("$1")
      shift
      ;;
  esac
done

# Resolve the effective provider for this run. Selection is always by
# `--filter-providers` against a provider DECLARED in promptfooconfig.yaml, so
# the provider's config block (temperature 0, max_tokens) is preserved and the
# run stays deterministic.
#
#   --model <m>     : the Anthropic <m> tier (back-compat).
#   --provider <id> : any declared provider id (e.g. openrouter:z-ai/glm-4.5).
#   neither         : the Sonnet 4.6 baseline. NOTE this deliberately does not
#                     run every declared provider — that would sweep the
#                     OpenRouter rows too (and demand OPENROUTER_API_KEY).
if [[ -n "${model_override}" && -n "${provider_override}" ]]; then
  echo "error: --model and --provider are mutually exclusive" >&2
  exit 1
fi

if [[ -n "${provider_override}" ]]; then
  # Validate the id is declared. An undeclared id makes --filter-providers match
  # nothing — promptfoo then exits 0 with 0 cases, which would clobber a
  # canonical baseline with an empty summary. Fail loudly instead.
  mapfile -t declared < <(awk '
    /^[[:space:]]*-[[:space:]]*id:[[:space:]]*/ {
      sub(/^[[:space:]]*-[[:space:]]*id:[[:space:]]*/, "")
      sub(/[[:space:]]+$/, "")
      print
    }' "${tests_dir}/promptfooconfig.yaml")
  found=0
  for d in "${declared[@]}"; do
    if [[ "${d}" == "${provider_override}" ]]; then
      found=1
      break
    fi
  done
  if (( ! found )); then
    echo "error: provider '${provider_override}' is not declared in promptfooconfig.yaml" >&2
    echo "declared providers:" >&2
    printf '  %s\n' "${declared[@]}" >&2
    exit 1
  fi
  effective_provider="${provider_override}"
  provider_meta="${provider_override%%:*}"   # e.g. "openrouter"
  model="${provider_override#*:}"            # e.g. "z-ai/glm-4.5"
  forwarded+=("--filter-providers" "^${provider_override}$")
elif [[ -n "${model_override}" ]]; then
  effective_provider="anthropic:messages:${model_override}"
  provider_meta="anthropic:messages"
  model="${model_override}"
  forwarded+=("--filter-providers" "^anthropic:messages:${model_override}$")
else
  effective_provider="anthropic:messages:claude-sonnet-4-6"
  provider_meta="anthropic:messages"
  model="claude-sonnet-4-6"
  forwarded+=("--filter-providers" "^anthropic:messages:claude-sonnet-4-6$")
fi

# Filesystem-safe tag for result filenames (e.g. openrouter-z-ai-glm-4.5).
tag="${effective_provider//:/-}"
tag="${tag//\//-}"

# Provider-aware key requirement. The TOKEN->KEY bridge above already ran for
# the Anthropic case; OpenRouter's provider reads OPENROUTER_API_KEY directly.
if [[ "${effective_provider}" == openrouter:* ]]; then
  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    echo "error: set OPENROUTER_API_KEY for OpenRouter provider '${effective_provider}'" >&2
    exit 1
  fi
else
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    echo "error: set ANTHROPIC_API_KEY (or ANTHROPIC_API_TOKEN)" >&2
    exit 1
  fi
fi

# When any filter / partial-run flag is present, treat the run as a partial:
# raw + summary go under results/raw/ (gitignored) so the canonical baseline
# at results/<date>-routing-<tag>.json is never silently overwritten by a
# subset run. (Scoping by --model / --provider is NOT a partial run — it's a
# full single-provider eval.)
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
  raw_json="${tests_dir}/results/raw/${date_tag}-${time_tag}-routing-${tag}.partial.full.json"
  summary_json="${tests_dir}/results/raw/${date_tag}-${time_tag}-routing-${tag}.partial.json"
else
  raw_json="${tests_dir}/results/raw/${date_tag}-routing-${tag}.full.json"
  summary_json="${tests_dir}/results/${date_tag}-routing-${tag}.json"
fi

cd "${tests_dir}"
echo "Running promptfoo eval against ${effective_provider}"
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

# Distinguish run-level errors (auth/network/rate-limit) from ordinary
# assertion failures. An errored run says nothing about the skill, so it must
# never overwrite a canonical baseline — redirect its summary to results/raw/
# and force a non-zero exit. (Partial runs already write to results/raw/.)
# Use promptfoo's own stats.errors: a bare per-case `error` field also fires on
# ordinary assertion failures, so it cannot be counted directly.
if [[ -f "${raw_json}" ]]; then
  error_count="$(python3 -c 'import json,sys
res = json.load(open(sys.argv[1])).get("results") or {}
stats = res.get("stats") or {}
e = stats.get("errors")
if e is None:
    cases = res.get("results") or []
    e = sum(1 for c in cases
            if c.get("error") and not ((c.get("gradingResult") or {}).get("componentResults")))
print(e)' "${raw_json}" 2>/dev/null || echo -1)"
else
  error_count=-1
fi
if (( ! partial )) && (( error_count != 0 )); then
  echo >&2
  echo "warning: ${error_count} case(s) errored (API/auth/network, not assertion" >&2
  echo "         failures). Refusing to overwrite the canonical baseline; writing" >&2
  echo "         the summary under results/raw/ instead. Fix the cause and re-run." >&2
  summary_json="${tests_dir}/results/raw/${date_tag}-${time_tag}-routing-${tag}.errored.json"
  if (( eval_rc == 0 )); then eval_rc=1; fi
fi

# Build a slim summary that's safe to commit. Strips full model responses /
# raw prompts; keeps per-case verdicts, failed-assertion details, totals.
python3 "${script_dir}/_summarize.py" \
  --raw "${raw_json}" \
  --model "${model}" \
  --provider "${provider_meta}" \
  --out "${summary_json}"

echo
echo "Raw:     ${raw_json}"
echo "Summary: ${summary_json}"
exit "${eval_rc}"
