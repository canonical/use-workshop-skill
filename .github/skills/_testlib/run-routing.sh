#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Shared driver for the routing evals. Invoked via each suite's
# scripts/run-routing.sh wrapper, which exports:
#
#   EVAL_TESTS_DIR            the suite's tests/ directory (required)
#   EVAL_DEFAULT_LANE         'openrouter' or 'subscription' — what a bare
#                             invocation runs
#   EVAL_DEFAULT_PROVIDER     the declared provider id a bare invocation
#                             targets when the default lane is 'openrouter'
#   EVAL_HTTP_CONFIG          abs path of the HTTP-lane promptfooconfig
#                             (empty = this suite has no HTTP lane)
#   EVAL_SUBSCRIPTION_CONFIG  abs path of the subscription-lane config
#
# Lanes:
#   HTTP (OpenRouter): candidate + judge over HTTP APIs. Needs
#     OPENROUTER_API_KEY. Deterministic via --filter-providers against a
#     DECLARED provider (config block preserved: temperature 0, max_tokens,
#     backend pinning).
#   Subscription: candidate = provider-routing-cli.js (local `claude` CLI on
#     the subscription login, tool-less, $0), judge = provider-judge-cli.js
#     (same CLI). No API keys — they are unset for the run so nothing can
#     bill. Concurrency defaults to 2 (EVAL_ROUTING_CONCURRENCY overrides).
#
# Common behavior (both lanes):
# - Regenerates skill-bundle.md first, so the eval reflects current content.
# - Writes raw JSON to tests/results/raw/ (gitignored); a slim summary to
#   tests/results/<date>-routing-<tag>.json (committed) — unless the run is
#   partial (--filter-pattern etc.) or errored, in which case the summary is
#   quarantined under results/raw/ so a canonical baseline is never
#   overwritten by a subset or a broken run.
#
# Usage (via wrapper):
#   scripts/run-routing.sh                                  # suite default lane
#   scripts/run-routing.sh --subscription                   # $0 confirmation lane
#   scripts/run-routing.sh --provider openrouter:z-ai/glm-5.1   # any declared provider
#   scripts/run-routing.sh --filter-pattern foo             # passes through to promptfoo
#
# --model was the retired Anthropic-HTTP selector and now errors: the Sonnet
# confirmation run is `--subscription` (make eval-routing-subscription).
#
# Exit contract:
#   0 = all assertions passed
#   1 = assertion failures (a normal eval outcome; the result is recorded)
#   2 = run-level errors (judge/API/auth/credits/not-logged-in — the run says
#       nothing about the skill; sweeps abort on this, see run-sweep.sh)

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tests_dir="$(cd "${EVAL_TESTS_DIR:?wrapper must export EVAL_TESTS_DIR}" && pwd)"
default_lane="${EVAL_DEFAULT_LANE:-openrouter}"
http_config="${EVAL_HTTP_CONFIG:-}"
subscription_config="${EVAL_SUBSCRIPTION_CONFIG:-}"

# Preflight: fail with a clear message instead of a mid-run command-not-found.
for cmd in promptfoo python3; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "error: '${cmd}' not found on PATH" >&2
    [[ "${cmd}" == promptfoo ]] && echo "install it with: npm install -g promptfoo" >&2
    exit 1
  fi
done

# Always regenerate the bundle so the eval reflects current skill content.
bash "${tests_dir}/scripts/regenerate-bundle.sh"

# Parse our own flags out of $@; everything else is forwarded to promptfoo.
subscription=0
provider_override=""
forwarded=()
while (( $# > 0 )); do
  case "$1" in
    --subscription)
      subscription=1
      shift
      ;;
    --model|--model=*)
      echo "error: --model targeted the retired Anthropic HTTP tiers." >&2
      echo "       The Sonnet confirmation run is the subscription lane now:" >&2
      echo "       scripts/run-routing.sh --subscription  (make eval-routing-subscription, \$0)" >&2
      exit 64
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

if (( subscription )) && [[ -n "${provider_override}" ]]; then
  echo "error: --subscription and --provider are mutually exclusive" >&2
  exit 64
fi
if (( ! subscription )) && [[ -z "${provider_override}" && "${default_lane}" == "subscription" ]]; then
  subscription=1
fi

# --filter-providers takes a REGEX, and provider ids are interpolated into it.
# An unescaped id is a latent footgun: `z-ai/glm-5.2`'s dot matches any
# character, and a future slug containing `+` would match nothing at all —
# which promptfoo reports as a clean 0-case run, silently overwriting a
# canonical baseline with an empty summary. Escape literally.
re_escape() { python3 -c 'import re, sys; print(re.escape(sys.argv[1]))' "$1"; }

if (( subscription )); then
  # ---- Subscription lane ---------------------------------------------------
  if [[ -z "${subscription_config}" || ! -f "${subscription_config}" ]]; then
    echo "error: subscription-lane config not found (${subscription_config:-unset})" >&2
    exit 2
  fi
  if ! command -v claude >/dev/null 2>&1; then
    echo "error: 'claude' not found on PATH — the subscription lane shells the claude CLI" >&2
    exit 2
  fi

  # Nothing in this lane may bill an API key: unset them for the whole run
  # (candidate and judge providers also scrub their own child envs).
  unset ANTHROPIC_API_KEY ANTHROPIC_API_TOKEN
  export EVAL_AUTH=subscription

  model="${EVAL_ROUTING_MODEL:-claude-sonnet-4-6}"
  provider_meta="claude-cli"
  effective_provider="claude-cli:${model}"

  # Preflight the CLI login with one tiny tool-less probe: a not-logged-in or
  # rate-limited CLI otherwise surfaces as every case erroring mid-run.
  probe_out="$(printf 'ok' | claude -p --model "${model}" --tools "" \
      --setting-sources project --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
      --no-session-persistence --output-format json 2>&1)" || {
    echo "error: claude CLI preflight failed — is the CLI logged in (claude login)?" >&2
    printf '       %s\n' "$(printf '%s' "${probe_out}" | tail -c 400)" >&2
    exit 2
  }
  if printf '%s' "${probe_out}" | python3 -c 'import json,sys
d = json.loads(sys.stdin.read() or "{}")
sys.exit(1 if d.get("is_error") else 0)' 2>/dev/null; then :; else
    echo "error: claude CLI preflight reported an error:" >&2
    printf '       %s\n' "$(printf '%s' "${probe_out}" | tail -c 400)" >&2
    exit 2
  fi

  config_file="${subscription_config}"
  # Belt and braces: the config pins the local judge, and the flag pins it
  # again (the flag mechanism is the one the 2026-08-13 $0 reconstruction run
  # empirically proved takes effect on promptfoo 0.121.x).
  forwarded+=("--grader" "file://${script_dir}/provider-judge-cli.js")

  # Default concurrency 2: gentle on the subscription rate window; overrides
  # win (user -j flag or EVAL_ROUTING_CONCURRENCY).
  user_set_concurrency=0
  for arg in "${forwarded[@]}"; do
    case "${arg}" in
      -j|--max-concurrency|-j=*|--max-concurrency=*)
        user_set_concurrency=1
        ;;
    esac
  done
  if (( ! user_set_concurrency )); then
    forwarded=("-j" "${EVAL_ROUTING_CONCURRENCY:-2}" "${forwarded[@]}")
  fi
else
  # ---- HTTP lane -----------------------------------------------------------
  if [[ -z "${http_config}" || ! -f "${http_config}" ]]; then
    echo "error: this suite has no HTTP routing lane (its routing gate is the" >&2
    echo "       subscription lane — run without --provider, or see TESTING.md)" >&2
    exit 64
  fi
  config_file="${http_config}"

  if [[ -n "${provider_override}" ]]; then
    # Validate the id is declared. An undeclared id makes --filter-providers
    # match nothing — promptfoo then exits 0 with 0 cases, which would clobber
    # a canonical baseline with an empty summary. Fail loudly instead.
    mapfile -t declared < <(awk '
      /^[[:space:]]*-[[:space:]]*id:[[:space:]]*/ {
        sub(/^[[:space:]]*-[[:space:]]*id:[[:space:]]*/, "")
        sub(/[[:space:]]+$/, "")
        print
      }' "${config_file}")
    found=0
    for d in "${declared[@]}"; do
      if [[ "${d}" == "${provider_override}" ]]; then
        found=1
        break
      fi
    done
    if (( ! found )); then
      echo "error: provider '${provider_override}' is not declared in ${config_file##*/}" >&2
      echo "declared providers:" >&2
      printf '  %s\n' "${declared[@]}" >&2
      exit 1
    fi
    effective_provider="${provider_override}"
  else
    effective_provider="${EVAL_DEFAULT_PROVIDER:?wrapper must export EVAL_DEFAULT_PROVIDER for the openrouter default lane}"
  fi
  provider_meta="${effective_provider%%:*}"   # e.g. "openrouter"
  model="${effective_provider#*:}"            # e.g. "z-ai/glm-5.1"
  forwarded+=("--filter-providers" "^$(re_escape "${effective_provider}")$")

  # Provider-aware key requirement.
  if [[ "${effective_provider}" == openrouter:* ]]; then
    if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
      echo "error: set OPENROUTER_API_KEY for OpenRouter provider '${effective_provider}'" >&2
      exit 1
    fi
  fi

  # Preflight the llm-rubric judge. The grading model is pinned in the config
  # (defaultTest.options.provider); a dead judge (bad key, exhausted credits)
  # otherwise surfaces only as per-case errors mid-run, wasting the
  # candidate-model spend and quarantining the whole run — that is not
  # hypothetical, it cost a full sweep once (see BASELINE.md, "Judge-outage
  # incident"). Both OpenAI and OpenRouter report credit exhaustion as a
  # generic 429, so probe with a real call and fail fast with the API error.
  #
  # Read the id with a real YAML parse rather than a grep: the pin may be a
  # bare string or an object, and a pattern that only matches one form
  # silently skips the preflight on the other.
  judge="$(python3 -c '
import sys, yaml
cfg = yaml.safe_load(open(sys.argv[1]))
p = ((cfg.get("defaultTest") or {}).get("options") or {}).get("provider")
if isinstance(p, dict):
    p = p.get("id")
print(p if isinstance(p, str) else "")
' "${config_file}")"

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
    file:*)
      # Local JS judge (claude CLI) — no HTTP endpoint to probe; its own
      # spawn-time errors are loud.
      judge_url=""
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
    # max_completion_tokens must leave room for reasoning models (e.g.
    # gpt-5.x): a tiny cap is consumed entirely by reasoning, and the API then
    # returns an `error` rather than an empty completion, which would fail
    # this preflight even though the key/credits are fine.
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
fi

# Filesystem-safe tag for result filenames (e.g. openrouter-z-ai-glm-5.2,
# claude-cli-claude-sonnet-4-6).
tag="${effective_provider//:/-}"
tag="${tag//\//-}"

# When any filter / partial-run flag is present, treat the run as a partial:
# raw + summary go under results/raw/ (gitignored) so the canonical baseline
# at results/<date>-routing-<tag>.json is never silently overwritten by a
# subset run. (Scoping by lane / --provider is NOT a partial run — it's a
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
echo "Running promptfoo eval against ${effective_provider} (config: ${config_file##*/})"
if (( partial )); then
  echo "(partial run detected — summary will go to results/raw/, not the canonical baseline)"
fi
# promptfoo exits non-zero when assertions fail; that's a normal eval outcome.
# Capture the code, always run the summary, then re-emit it so CI can detect
# regressions while still committing the slim summary.
set +e
promptfoo eval -c "${config_file}" --output "${raw_json}" "${forwarded[@]}"
eval_rc=$?
set -e

# Distinguish run-level errors (auth/network/rate-limit) from ordinary
# assertion failures. An errored run says nothing about the skill, so it must
# never overwrite a canonical baseline — redirect its summary to results/raw/
# and force a non-zero exit. (Partial runs already write to results/raw/.)
# Use promptfoo's own stats.errors: a bare per-case `error` field also fires on
# ordinary assertion failures, so it cannot be counted directly.
#
# ALSO count judge-side API failures that promptfoo records as failed
# ASSERTIONS rather than case errors: a mid-run judge 402/429 (credits ran
# out after the preflight passed) puts "API error: …" into the component
# result's reason, stats.errors stays 0, and without this check the
# judge-starved run would overwrite a canonical baseline — observed on the
# 2026-08-20 CI dispatch (second judge-outage incident; see BASELINE.md).
if [[ -f "${raw_json}" ]]; then
  error_count="$(python3 -c 'import json,sys
res = json.load(open(sys.argv[1])).get("results") or {}
stats = res.get("stats") or {}
e = stats.get("errors")
if e is None:
    cases = res.get("results") or []
    e = sum(1 for c in cases
            if c.get("error") and not ((c.get("gradingResult") or {}).get("componentResults")))
judge_api_failures = 0
for c in (res.get("results") or []):
    for cr in ((c.get("gradingResult") or {}).get("componentResults") or []):
        reason = str((cr or {}).get("reason") or "")
        if not (cr or {}).get("pass") and reason.startswith("API error:"):
            judge_api_failures += 1
print((e or 0) + judge_api_failures)' "${raw_json}" 2>/dev/null || echo -1)"
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
python3 "${script_dir}/_summarize.py" \
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
