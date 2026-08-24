#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# SDK-reconstruction eval: given only a needs-phrased brief, does the
# design-sdk skill produce an SDK repo functionally equivalent to the
# reference the Workshop team actually shipped?
#
# Unlike the sibling onboard-workshop reconstruction there is no repo to
# scrub: the candidate starts in an EMPTY directory with the skills
# installed, and the whole reference repo is parked as hidden ground truth.
# Mapping need -> construct (a "reachable server" -> tunnel slot, "survives
# updates" -> mount plug, "background process" -> systemd user unit) is
# precisely what is being evaluated, so briefs never name mechanisms.
#
# For each SDK in DESIGN_SDKS (default: uv-sdk ollama-sdk claude-code-sdk):
#   1. Resolve a local clone: $DESIGN_SDK_ROOT/<name>-akcano or
#      $DESIGN_SDK_ROOT/<name>. Clones are used at whatever revision they
#      sit on; the HEAD SHA is recorded in the staging summary because the
#      clones are NOT SHA-pinned (re-runs should consider owner/repo@sha
#      specs — see README.md here).
#   2. Stage .work/run-<ts>/<name>/: repo/ (empty, plus .claude/skills for
#      design-sdk + use-workshop minus their tests/, plus project settings)
#      and ground-truth/ (detached-worktree copy, NOT git archive — archive
#      honours export-ignore and can silently drop files).
#   3. Emit one tests.yaml case with the SDK's brief.
# Then run promptfoo with provider-design-cli.js, which appends the
# generated tree, the reference tree, and the compare-sdk.py scorecard.
#
# One-off round note: this harness exists for the Sonnet 5 calibration
# round recorded in ../BASELINE.md. It is re-runnable but NOT part of CI
# and not part of the pinned baseline pairs.
#
# Knobs:
#   DESIGN_SDKS        space-separated SDK names (default: the three below)
#   DESIGN_SDK_ROOT    where the local clones live (default: ~/Documents/SDKs)
#   DESIGN_RECON_MODEL candidate model (default: claude-sonnet-5)
#   RECON_AUTH         subscription (default) | api
#   RECON_JUDGE        local (default) | openai
#   RECON_CONCURRENCY  promptfoo -j (default 1: subscription rate limits)
#
# Requires: promptfoo, python3+yaml, claude CLI, git.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skills_dir="$(cd "${script_dir}/../../.." && pwd)"
work_root="${script_dir}/.work"
work="${work_root}/run-$(date -u +%Y%m%d%H%M%S)"

stage_only=0
while (( $# > 0 )); do
  case "$1" in
    --stage-only) stage_only=1; shift ;;
    *) echo "error: unknown argument '$1' (--stage-only)" >&2; exit 1 ;;
  esac
done

auth="${RECON_AUTH:-subscription}"
if [[ "${auth}" != "api" && "${auth}" != "subscription" ]]; then
  echo "error: RECON_AUTH must be 'api' or 'subscription'" >&2
  exit 1
fi
judge="${RECON_JUDGE:-local}"
if [[ "${judge}" != "openai" && "${judge}" != "local" ]]; then
  echo "error: RECON_JUDGE must be 'openai' or 'local'" >&2
  exit 1
fi
concurrency="${RECON_CONCURRENCY:-1}"
model="${DESIGN_RECON_MODEL:-claude-sonnet-5}"
export RECON_MODEL_OVERRIDE="${model}"

sdk_root="${DESIGN_SDK_ROOT:-${HOME}/Documents/SDKs}"
read -r -a sdks <<< "${DESIGN_SDKS:-uv-sdk ollama-sdk claude-code-sdk}"

for cmd in promptfoo python3 claude git; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "error: '${cmd}' not found on PATH" >&2
    exit 1
  fi
done

if [[ "${auth}" == "api" ]]; then
  if [[ -z "${ANTHROPIC_API_KEY:-}" && -n "${ANTHROPIC_API_TOKEN:-}" ]]; then
    export ANTHROPIC_API_KEY="${ANTHROPIC_API_TOKEN}"
  fi
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    echo "error: set ANTHROPIC_API_KEY (or ANTHROPIC_API_TOKEN), or use RECON_AUTH=subscription" >&2
    exit 1
  fi
else
  # `claude` prefers an API key over the CLI login, so it must be ABSENT.
  unset ANTHROPIC_API_KEY ANTHROPIC_API_TOKEN
  export RECON_AUTH="subscription"
fi
if [[ "${judge}" == "openai" && -z "${OPENAI_API_KEY:-}" ]]; then
  echo "error: set OPENAI_API_KEY (llm-rubric judge), or use RECON_JUDGE=local" >&2
  exit 2
fi

# The brief for one SDK: user needs only, never mechanisms.
brief_for() {
  case "$1" in
    uv-sdk)
      cat <<'EOF'
Design and build a publishable Workshop SDK named uv that packages uv, the
extremely fast Python package and project manager from Astral
(https://github.com/astral-sh/uv, plain semver release tags). Requirements,
phrased as user needs: uv and uvx must be available on every workshop
user's PATH; each project's Python environment must be shareable so other
SDKs (for example a notebook SDK) can use the same environment; uv's
package cache must survive workshop updates so reinstalls stay fast; users
who type pip out of habit should end up using uv's pip interface. Include
the repo release automation: upstream version tracking that opens update
PRs, and CI that builds on pull requests and uploads on release, tracking
only the latest upstream series.
EOF
      ;;
    ollama-sdk)
      cat <<'EOF'
Design and build a publishable Workshop SDK named ollama that packages
Ollama, the local large-language-model runtime
(https://github.com/ollama/ollama, release tags prefixed with v). The
upstream ships Linux release tarballs per architecture. Requirements,
phrased as user needs: the Ollama server must run in the background and be
reachable from tools on the host (its API listens on its standard port);
downloaded models must survive workshop updates — they are large and must
never be re-downloaded because the workshop was refreshed; the GPU must be
used for inference when the workshop has one; the workshop must not report
ready until the server actually answers. Include the repo release
automation: upstream version tracking that opens update PRs, and CI that
builds on pull requests and uploads on release, tracking only the latest
upstream series.
EOF
      ;;
    claude-code-sdk)
      cat <<'EOF'
Design and build a publishable Workshop SDK named claude-code that packages
the Claude Code CLI from Anthropic. The upstream publishes per-platform
Linux binaries with a versioned download manifest that includes checksums
(and also ships the CLI as the @anthropic-ai/claude-code npm package).
Requirements, phrased as user needs: the claude binary must be on every
workshop user's PATH, for both amd64 and arm64 workshops; the download must
be integrity-verified — a corrupted or tampered binary must fail the build,
never be installed; the user's agent configuration and credentials must
survive workshop updates; the workshop must report unhealthy if the CLI is
missing or not usable; include smoke tests that prove the CLI is present
and reports its version inside a workshop, runnable across the supported
bases. Include the repo release automation: upstream version tracking that
opens update PRs, and CI that builds on pull requests and uploads on
release, tracking only the latest upstream series.
EOF
      ;;
    *)
      echo "error: no brief recorded for '$1' (add one to run-sdk-reconstruction.sh)" >&2
      return 1
      ;;
  esac
}

rm -rf "${work_root}"
mkdir -p "${work}"

tests_yaml="${work_root}/tests.yaml"
{
  echo "# Generated by run-sdk-reconstruction.sh — do not commit."
} > "${tests_yaml}"

summary="${work}/staging-summary.txt"
{
  echo "# SDK-reconstruction staging summary"
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "model: ${model}"
  echo "auth: ${auth}  judge: ${judge}"
} > "${summary}"

staged=0
for sdk in "${sdks[@]}"; do
  src=""
  for cand in "${sdk_root}/${sdk}-akcano" "${sdk_root}/${sdk}"; do
    if [[ -d "${cand}/.git" ]]; then
      src="${cand}"
      break
    fi
  done
  if [[ -z "${src}" ]]; then
    echo "error: no local clone for '${sdk}' under ${sdk_root} (tried ${sdk}-akcano and ${sdk})" >&2
    exit 1
  fi
  sha="$(git -C "${src}" rev-parse HEAD)"

  sandbox="${work}/${sdk}"
  repo="${sandbox}/repo"
  gt="${sandbox}/ground-truth"
  mkdir -p "${repo}" "${gt}"

  echo "== Staging ${sdk} (${src} @ ${sha}) =="
  {
    echo
    echo "## ${sdk}"
    echo "clone: ${src}"
    echo "HEAD: ${sha}"
    echo "branch: $(git -C "${src}" branch --show-current || true)"
  } >> "${summary}"

  # Ground truth: a real checkout, NOT `git archive` (archive honours
  # export-ignore). Detached worktree, copied without .git.
  checkout="${sandbox}/.checkout"
  git -C "${src}" worktree prune
  git -C "${src}" worktree add --quiet --detach "${checkout}" "${sha}"
  tar -C "${checkout}" --exclude='./.git' -cf - . | tar -xf - -C "${gt}"
  git -C "${src}" worktree remove --force "${checkout}"

  # The candidate's working directory is EMPTY apart from the skills.
  for skill in design-sdk use-workshop; do
    dst="${repo}/.claude/skills/${skill}"
    mkdir -p "${dst}"
    tar -C "${skills_dir}/${skill}" --exclude='./tests' -cf - . | tar -xf - -C "${dst}"
  done
  cat > "${repo}/.claude/settings.json" <<'JSON'
{
  "hooks": {},
  "enabledPlugins": {}
}
JSON

  brief="$(brief_for "${sdk}")"
  {
    echo "- description: design-reconstruct ${sdk} (offline)"
    echo "  vars:"
    echo "    sandbox: .work/$(basename "${work}")/${sdk}"
    echo "    sdk_name: ${sdk}"
    echo "    task: |"
    printf '%s\n' "${brief}" | sed 's/^/      /'
    echo "      Work in the current directory. Make your recommendations and"
    echo "      proceed with them — assume I accept every recommendation."
    echo "      There is no network and no sdkcraft/workshop CLI here:"
    echo "      generate the complete SDK repo (definition, hooks, tests,"
    echo "      README, release automation), then stop and report what you"
    echo "      would verify with the try loop."
  } >> "${tests_yaml}"
  staged=$((staged + 1))
done

echo
if (( stage_only )); then
  echo "Staged ${staged} SDK brief(s) under ${work} (--stage-only; skipping promptfoo)"
  exit 0
fi
echo "Staged ${staged} SDK brief(s) under ${work}; running promptfoo (${auth} auth, ${judge} judge, ${model}, -j ${concurrency})"
cd "${script_dir}"
date_tag="$(date -u +%Y-%m-%d-%H%M%S)"
mkdir -p "${script_dir}/../results/raw"
raw_json="${script_dir}/../results/raw/${date_tag}-design-reconstruction-${model}.json"

promptfoo_args=(eval -c promptfooconfig.yaml --no-cache
                --output "${raw_json}" --max-concurrency "${concurrency}")
if [[ "${judge}" == "local" ]]; then
  promptfoo_args+=(--grader "file://${script_dir}/../../../_testlib/provider-judge-cli.js")
else
  promptfoo_args+=(--grader "openai:gpt-5.5-2026-04-23")
fi

set +e
promptfoo "${promptfoo_args[@]}"
rc=$?
set -e

echo
echo "Raw results: ${raw_json}"
echo "Per-SDK scorecards are embedded in each case output (--- SCORECARD ---)."
echo "Staging summary (clone SHAs): ${summary}"
echo "Record the round in ../BASELINE.md (one-off design-reconstruction section)."
exit "${rc}"
