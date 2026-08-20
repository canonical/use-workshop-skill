#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Run the routing eval for the onboard-workshop skill.
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
# This suite stays on Sonnet 4.6 with the OpenAI-hosted judge (needs
# ANTHROPIC_API_KEY + OPENAI_API_KEY). The sibling use-workshop suite moved its
# gate to GLM-5.2 via OpenRouter on 2026-08-13; this one did NOT — see
# BASELINE.md "GLM-5.2 diagnostic" for the measurement that decided it. The
# provider plumbing below is shared with the sibling and handles either vendor,
# so switching later is a one-line change to the default branch.
#
# Usage:
#   scripts/run-routing.sh                                  # default: Anthropic Sonnet 4.6
#   scripts/run-routing.sh --model claude-haiku-4-5         # scope to one Anthropic tier
#   scripts/run-routing.sh --provider openrouter:z-ai/glm-5.2    # any declared provider
#   scripts/run-routing.sh --filter-pattern foo             # passes through to promptfoo
#
# --model and --provider are mutually exclusive. A --provider id must be
# declared in promptfooconfig.yaml (undeclared -> hard error).
#
# Exit contract:
#   0 = all assertions passed
#   1 = assertion failures (a normal eval outcome; the result is recorded)
#   2 = run-level errors (judge/API/auth/credits — the run says nothing about
#       the skill; a sweep driver should abort on this)

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
#   --provider <id> : any declared provider id (e.g. openrouter:z-ai/glm-5.2).
#   neither         : the Sonnet 4.6 baseline. NOTE this deliberately does not
#                     run every declared provider — that would sweep any
#                     OpenRouter rows too (and demand OPENROUTER_API_KEY).
if [[ -n "${model_override}" && -n "${provider_override}" ]]; then
  echo "error: --model and --provider are mutually exclusive" >&2
  exit 1
fi

# --filter-providers takes a REGEX, and provider ids are interpolated into it.
# An unescaped id is a latent footgun: `z-ai/glm-5.2`'s dot matches any
# character, and a future slug containing `+` would match nothing at all —
# which promptfoo reports as a clean 0-case run, silently overwriting a
# canonical baseline with an empty summary. Escape literally.
re_escape() { python3 -c 'import re, sys; print(re.escape(sys.argv[1]))' "$1"; }

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
  model="${provider_override#*:}"            # e.g. "z-ai/glm-5.1"
elif [[ -n "${model_override}" ]]; then
  effective_provider="anthropic:messages:${model_override}"
  provider_meta="anthropic:messages"
  model="${model_override}"
else
  effective_provider="anthropic:messages:claude-sonnet-4-6"
  provider_meta="anthropic:messages"
  model="claude-sonnet-4-6"
fi
forwarded+=("--filter-providers" "^$(re_escape "${effective_provider}")$")

# Filesystem-safe tag for result filenames (e.g. openrouter-z-ai-glm-5.2).
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

# Preflight the llm-rubric judge. The grading model is pinned in
# promptfooconfig.yaml (defaultTest.options.provider); a dead judge (bad key,
# exhausted credits) otherwise surfaces only as per-case errors mid-run,
# wasting the candidate-model spend and quarantining the whole run — that is
# not hypothetical, it cost a full sweep once (see BASELINE.md, "Judge-outage
# incident"). Both OpenAI and OpenRouter report credit exhaustion as a generic
# 429, so probe with a real call and fail fast with the actual API error.
#
# Read the id with a real YAML parse rather than a grep: the pin may be a bare
# string (`provider: openai:gpt-5.5`) or an object (`provider: {id: ..., config:
# ...}`), and a pattern that only matches one form silently skips the preflight
# on the other — losing the protection exactly when the config changes.
judge="$(python3 -c '
import sys, yaml
cfg = yaml.safe_load(open(sys.argv[1]))
p = ((cfg.get("defaultTest") or {}).get("options") or {}).get("provider")
if isinstance(p, dict):
    p = p.get("id")
print(p if isinstance(p, str) else "")
' "${tests_dir}/promptfooconfig.yaml")"

case "${judge}" in
  openrouter:*)
    judge_url="https://openrouter.ai/api/v1/chat/completions"
    judge_key="${OPENROUTER_API_KEY:-}"
    judge_key_name="OPENROUTER_API_KEY"
    judge_model="${judge#openrouter:}"
    ;;
  openai:*)
    judge_url="https://api.openai.com/v1/chat/completions"
    judge_key="${OPENAI_API_KEY:-}"
    judge_key_name="OPENAI_API_KEY"
    judge_model="${judge#openai:}"
    ;;
  "")
    judge_url=""
    ;;
  *)
    echo "warning: llm-rubric judge '${judge}' uses a scheme this script cannot" >&2
    echo "         preflight; a dead judge will surface as mid-run case errors." >&2
    judge_url=""
    ;;
esac

if [[ -n "${judge_url}" ]]; then
  if [[ -z "${judge_key}" ]]; then
    echo "error: ${judge_key_name} is not set — required for the llm-rubric judge (${judge})" >&2
    exit 2
  fi
  # max_completion_tokens must leave room for reasoning models (e.g. gpt-5.x):
  # a tiny cap is consumed entirely by reasoning, and the API then returns an
  # `error` ("max_tokens ... reached") rather than an empty completion, which
  # would fail this preflight even though the key/credits are fine.
  probe="$(curl -sS -m 30 "${judge_url}" \
    -H "Authorization: Bearer ${judge_key}" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"${judge_model}\",\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}],\"max_completion_tokens\":2000}" 2>&1)" || true
  if ! python3 -c 'import json,sys
d = json.loads(sys.argv[1])
sys.exit(1 if d.get("error") else 0)' "${probe}" 2>/dev/null; then
    echo "error: llm-rubric judge preflight failed for ${judge}:" >&2
    printf '       %s\n' "$(printf '%s' "${probe}" | head -c 400)" >&2
    echo "       Check ${judge_key_name} validity and account credits (both OpenAI and" >&2
    echo "       OpenRouter report credit exhaustion as '429 Too Many Requests')." >&2
    exit 2
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
errored_run=0
if (( ! partial )) && (( error_count != 0 )); then
  echo >&2
  echo "warning: ${error_count} case(s) errored (API/auth/network, not assertion" >&2
  echo "         failures). Refusing to overwrite the canonical baseline; writing" >&2
  echo "         the summary under results/raw/ instead. Fix the cause and re-run." >&2
  summary_json="${tests_dir}/results/raw/${date_tag}-${time_tag}-routing-${tag}.errored.json"
  errored_run=1
fi

# Build a slim summary that's safe to commit. Strips full model responses /
# raw prompts; keeps per-case verdicts, failed-assertion details, totals.
python3 "${script_dir}/../../../_testlib/_summarize.py" \
  --raw "${raw_json}" \
  --model "${model}" \
  --provider "${provider_meta}" \
  --out "${summary_json}"

echo
echo "Raw:     ${raw_json}"
echo "Summary: ${summary_json}"

# Normalize to the documented exit contract (see header).
if (( errored_run )); then
  exit 2
elif (( eval_rc != 0 )); then
  exit 1
fi
exit 0
