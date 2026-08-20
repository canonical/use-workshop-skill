#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Guinea-pig reconstruction eval: can the onboard-workshop skill re-derive a
# real repo's workshop definition from the repo's own toolchain evidence?
#
# For each repo in GUINEA_REPOS — either a local checkout path or a pinned
# remote `owner/repo@<sha>` (also accepts a full github.com URL):
#   1. Clean-room copy: a detached `git worktree` checkout of <rev>, tar-copied
#      into .work/<run>/<dir>/repo without `.git` (NOT `git archive` — archive
#      honours `export-ignore`, which silently drops build evidence; see the
#      staging step below). No commit history reaches the sandbox.
#   2. Hide the ground truth: park the definition artifacts (.workshop/*.yaml
#      and .workshop/<sdk>/ dirs, root workshop.yaml/.workshop.yaml) at
#      .work/<run>/<dir>/ground-truth/; relocate any NON-definition files that
#      lived under .workshop/ to scripts/ (they are project tooling, not
#      workshop config) and rewrite references to them; delete .workshop.lock;
#      park CI workflow files that drive the workshop CLI; then scrub-repo.py
#      redacts every remaining file that mentions Workshop. Scrubbing is
#      approximate by design — see README.md here.
#   3. Install BOTH skills (minus tests/) into repo/.claude/skills/.
#   4. Generate .work/tests.yaml (one case per repo) and run promptfoo with
#      provider-onboard-cli.js, which runs the agent, captures generated
#      files vs ground truth, and appends the compare-definition.py scorecard.
#
# Tiers:
#   default (offline): the agent is told to STOP before launching — no LXD,
#     and it picks the workshop name itself (naming is part of what we score).
#   --tier full: the agent launches and proves actions (slow, real LXD), and
#     the name is forced to recon-<dir> so teardown-by-prefix is safe.
#
# Auth (RECON_AUTH):
#   api (default)  — `claude --bare` + ANTHROPIC_API_KEY; billed per token.
#   subscription   — drops --bare (its auth is strictly ANTHROPIC_API_KEY;
#                    OAuth and keychain are never read) and unsets the API
#                    key/token so the local CLI login is used instead.
#
# Judge (RECON_JUDGE):
#   openai (default) — the pinned gpt-5.5 rubric judge; needs OPENAI_API_KEY.
#   local            — the shared _testlib/provider-judge-cli.js, the same
#                      local CLI as the agent.
#
# Requires: promptfoo, python3+yaml, claude CLI, git.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skills_dir="$(cd "${script_dir}/../../.." && pwd)"
# Unique staging path per run: the workshop daemon keys project state by
# absolute path, so reusing a path across runs lets a previous run's
# half-launched workshop block the next launch ("stale daemon state").
# tests.yaml stays at the stable path promptfooconfig.yaml references.
work_root="${script_dir}/.work"
work="${work_root}/run-$(date -u +%Y%m%d%H%M%S)"
# Clones live OUTSIDE the staging area, which is wiped on every run.
cache_root="${script_dir}/.cache"

tier="offline"
stage_only=0
while (( $# > 0 )); do
  case "$1" in
    --tier) tier="$2"; shift 2 ;;
    --tier=*) tier="${1#--tier=}"; shift ;;
    --stage-only) stage_only=1; shift ;;
    *) echo "error: unknown argument '$1' (--tier offline|full, --stage-only)" >&2; exit 1 ;;
  esac
done
if [[ "${tier}" != "offline" && "${tier}" != "full" ]]; then
  echo "error: --tier must be 'offline' or 'full'" >&2
  exit 1
fi

auth="${RECON_AUTH:-api}"
if [[ "${auth}" != "api" && "${auth}" != "subscription" ]]; then
  echo "error: RECON_AUTH must be 'api' or 'subscription'" >&2
  exit 1
fi
judge="${RECON_JUDGE:-openai}"
if [[ "${judge}" != "openai" && "${judge}" != "local" ]]; then
  echo "error: RECON_JUDGE must be 'openai' or 'local'" >&2
  exit 1
fi
# Subscription runs share one account's rate limit: serialise by default.
if [[ "${auth}" == "subscription" ]]; then
  concurrency="${RECON_CONCURRENCY:-1}"
else
  concurrency="${RECON_CONCURRENCY:-4}"
fi

default_repos="${HOME}/Documents/workshop-akcano ${HOME}/Documents/vscode-workshop"
read -r -a repos <<< "${GUINEA_REPOS:-${default_repos}}"

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

rm -rf "${work_root}"
mkdir -p "${work}" "${cache_root}"

tests_yaml="${work_root}/tests.yaml"
{
  echo "# Generated by run-reconstruction.sh — do not commit."
} > "${tests_yaml}"

# Resolve a GUINEA_REPOS entry to a checkout path + revision. Prints
# "<path>\t<rev>". Remote entries are cached across runs.
resolve_source() {
  local spec="$1" slug sha owner repo dest
  if [[ -d "${spec}/.git" ]]; then
    printf '%s\t%s\n' "${spec}" "HEAD"
    return 0
  fi
  if [[ "${spec}" != *@* ]]; then
    echo "error: guinea-pig '${spec}' is neither a git checkout nor 'owner/repo@<sha>'." >&2
    return 1
  fi
  slug="${spec%@*}"
  sha="${spec##*@}"
  slug="${slug#https://github.com/}"
  slug="${slug#git@github.com:}"
  slug="${slug%.git}"
  owner="${slug%%/*}"
  repo="${slug##*/}"
  if [[ -z "${owner}" || -z "${repo}" || "${owner}" == "${slug}" ]]; then
    echo "error: cannot parse guinea-pig spec '${spec}' (want owner/repo@<sha>)." >&2
    return 1
  fi
  dest="${cache_root}/${owner}--${repo}"
  if [[ ! -d "${dest}/.git" ]]; then
    echo "== Cloning ${owner}/${repo} ==" >&2
    git clone --quiet --filter=blob:none "https://github.com/${owner}/${repo}.git" "${dest}" >&2
  fi
  if ! git -C "${dest}" cat-file -e "${sha}^{commit}" 2>/dev/null; then
    git -C "${dest}" fetch --quiet --filter=blob:none origin "${sha}" >&2 \
      || git -C "${dest}" fetch --quiet --filter=blob:none origin >&2
  fi
  printf '%s\t%s\n' "${dest}" "${sha}"
}

staged=0
for spec in "${repos[@]}"; do
  IFS=$'\t' read -r src rev < <(resolve_source "${spec}")
  name="$(basename "${src}")"
  # A remote cache dir is owner--repo; the eval keys expectations off the repo.
  name="${name##*--}"
  # The sandbox path is visible to the agent (it is the cwd), so a repo whose
  # own name says "workshop" would leak through the prompt. Neutralise the
  # DIRECTORY name; repo_name (used to find expectations/) keeps the real one.
  dir_name="$(echo "${name}" | sed 's/[-_]*[Ww][Oo][Rr][Kk][Ss][Hh][Oo][Pp][-_]*/-/g; s/^-//; s/-$//')"
  [[ -n "${dir_name}" ]] || dir_name="guinea-$((staged + 1))"

  sandbox="${work}/${dir_name}"
  repo="${sandbox}/repo"
  gt="${sandbox}/ground-truth"
  mkdir -p "${repo}" "${gt}"
  report="${gt}/scrub-report.txt"
  {
    echo "# Scrub report for ${name}"
    echo "source: ${spec}"
    echo "revision: ${rev}"
    echo "sandbox dir: ${dir_name}"
  } > "${report}"

  echo "== Staging ${name} (${rev}) =="
  # A real checkout, NOT `git archive`: archive honours `export-ignore`, and
  # repos that ship release tarballs use it heavily (mir marks debian/,
  # .github/ and .gitignore export-ignore), which would silently delete the
  # very build evidence the agent is supposed to reason from. A detached
  # worktree gives the tree a developer would actually clone; copying it
  # without .git keeps the clean room (no history, no branch names).
  checkout="${sandbox}/.checkout"
  git -C "${src}" worktree prune
  git -C "${src}" worktree add --quiet --detach "${checkout}" "${rev}"
  tar -C "${checkout}" --exclude='./.git' -cf - . | tar -xf - -C "${repo}"
  git -C "${src}" worktree remove --force "${checkout}"

  # Park the ground truth: root definitions, .workshop/*.yaml, and any
  # .workshop/<dir>/ that carries an sdk.yaml.
  found_def=0
  echo >> "${report}"
  echo "## Parked as ground truth" >> "${report}"
  for f in workshop.yaml .workshop.yaml; do
    if [[ -f "${repo}/${f}" ]]; then
      mv "${repo}/${f}" "${gt}/${f}"
      echo "- ${f}" >> "${report}"
      found_def=1
    fi
  done
  if [[ -d "${repo}/.workshop" ]]; then
    mkdir -p "${gt}/.workshop"
    shopt -s nullglob
    for y in "${repo}/.workshop"/*.yaml "${repo}/.workshop"/*.yml; do
      mv "${y}" "${gt}/.workshop/"
      echo "- .workshop/$(basename "${y}")" >> "${report}"
      found_def=1
    done
    for d in "${repo}/.workshop"/*/; do
      if [[ -f "${d}sdk.yaml" || -f "${d}meta/sdk.yaml" ]]; then
        mv "${d}" "${gt}/.workshop/"
        echo "- .workshop/$(basename "${d}")/ (in-project SDK)" >> "${report}"
        found_def=1
      fi
    done

    # Whatever is left under .workshop/ is project tooling that merely lived
    # there (helper scripts). Relocating it to scripts/ keeps it as legitimate
    # evidence instead of deleting it with the definition.
    relocated=()
    echo >> "${report}"
    echo "## Relocated .workshop/* -> scripts/* (project tooling, not workshop config)" >> "${report}"
    for leftover in "${repo}/.workshop"/*; do
      rel="${leftover#"${repo}"/.workshop/}"
      mkdir -p "${repo}/scripts/$(dirname "${rel}")"
      mv "${leftover}" "${repo}/scripts/${rel}"
      relocated+=("${rel}")
      echo "- .workshop/${rel} -> scripts/${rel}" >> "${report}"
    done
    shopt -u nullglob
    (( ${#relocated[@]} )) || echo "- (none)" >> "${report}"
    # Rewrite references to the relocated files BEFORE the scrub, so their
    # call sites survive the whole-line collapse.
    for rel in "${relocated[@]+"${relocated[@]}"}"; do
      while IFS= read -r f; do
        sed -i "s#\.workshop/${rel}#scripts/${rel}#g" "${f}"
      done < <(grep -rl --binary-files=without-match -F ".workshop/${rel}" "${repo}" 2>/dev/null || true)
    done
    rmdir "${repo}/.workshop" 2>/dev/null || true
  fi
  rm -f "${repo}/.workshop.lock"
  if (( ! found_def )); then
    echo "error: ${name} has no workshop definition to reconstruct against" >&2
    exit 1
  fi

  # Park CI workflows that drive the workshop CLI (they would leak the
  # ground-truth action names), keep the rest as toolchain evidence.
  echo >> "${report}"
  echo "## Parked CI workflows (drove the workshop CLI)" >> "${report}"
  parked_ci=0
  if [[ -d "${repo}/.github/workflows" ]]; then
    mkdir -p "${gt}/ci"
    while IFS= read -r wf; do
      mv "${wf}" "${gt}/ci/$(basename "${wf}")"
      echo "   parked CI workflow: $(basename "${wf}")"
      echo "- .github/workflows/$(basename "${wf}")" >> "${report}"
      parked_ci=1
    done < <(grep -lE 'launch-workshop|workshop (launch|run|exec|refresh|init|connect)' \
               "${repo}/.github/workflows/"*.y*ml 2>/dev/null || true)
  fi
  (( parked_ci )) || echo "- (none)" >> "${report}"

  # Redact every remaining file that mentions Workshop (originals parked).
  python3 "${script_dir}/scrub-repo.py" \
    --repo "${repo}" --ground-truth "${gt}" --report "${report}"

  # Install both skills (minus their tests trees — also required because the
  # .work staging area lives under onboard-workshop/tests/, so a full copy
  # would recurse into itself).
  for skill in onboard-workshop use-workshop; do
    dst="${repo}/.claude/skills/${skill}"
    mkdir -p "${dst}"
    tar -C "${skills_dir}/${skill}" --exclude='./tests' -cf - . | tar -xf - -C "${dst}"
  done
  # Project-scoped settings so `--setting-sources project` has something to
  # load and the user's global hooks/plugins stay out of the sandbox.
  cat > "${repo}/.claude/settings.json" <<'JSON'
{
  "hooks": {},
  "enabledPlugins": {}
}
JSON

  if [[ "${tier}" == "full" ]]; then
    stop_clause="Then launch the workshop and prove every generated action and tunnel per the skill's verification loop."
    # The full tier's teardown deletes LXD containers by name prefix in the
    # user's workshop.<uid> project, so a generic name like `dev` could
    # collide with (and destroy) a real workshop's container. recon-* cannot.
    ws_name="recon-$(echo "${dir_name}" | tr -cs 'a-z0-9' '-' | sed 's/^-//;s/-$//' | cut -c1-30)"
    name_clause="Name the workshop exactly: ${ws_name}"
  else
    stop_clause="Do NOT launch the workshop or run any workshop lifecycle command other than workshop init — generate the definition files, then stop and report what you would verify."
    # Nothing is launched offline, so let the skill choose the name: naming is
    # part of what we compare against the maintainers' definition.
    ws_name=""
    name_clause="Choose the workshop name yourself and say why."
  fi

  {
    echo "- description: reconstruct ${name} (${tier})"
    echo "  vars:"
    echo "    sandbox: .work/$(basename "${work}")/${dir_name}"
    echo "    repo_name: ${name}"
    echo "    tier: ${tier}"
    echo "    workshop_name: ${ws_name}"
    echo "    task: |"
    echo "      Onboard this repository to Workshop. It has no workshop"
    echo "      definition yet. Analyze its build/test/debug toolchain from the"
    echo "      repo's own evidence, deliver your feasibility verdict, propose"
    echo "      the definition with explicit recommendations (assume I accept"
    echo "      every recommendation), and generate it."
    echo "      ${name_clause}"
    echo "      ${stop_clause}"
  } >> "${tests_yaml}"
  staged=$((staged + 1))
done

echo
if (( stage_only )); then
  echo "Staged ${staged} guinea pig(s) under ${work} (--stage-only; skipping promptfoo)"
  exit 0
fi
echo "Staged ${staged} guinea pig(s) under ${work}; running promptfoo (${tier} tier, ${auth} auth, ${judge} judge, -j ${concurrency})"
cd "${script_dir}"
# Timestamped so same-day runs don't overwrite each other's raw evidence, and
# model-tagged so two model passes over the same guinea pigs stay separable.
date_tag="$(date -u +%Y-%m-%d-%H%M%S)"
model_tag="${RECON_MODEL_OVERRIDE:-claude-sonnet-4-6}"
mkdir -p "${script_dir}/../results/raw"
raw_json="${script_dir}/../results/raw/${date_tag}-reconstruction-${tier}-${model_tag}.json"

promptfoo_args=(eval -c promptfooconfig.yaml --no-cache
                --output "${raw_json}" --max-concurrency "${concurrency}")
if [[ "${judge}" == "local" ]]; then
  promptfoo_args+=(--grader "file://${script_dir}/../../../_testlib/provider-judge-cli.js")
fi

set +e
promptfoo "${promptfoo_args[@]}"
rc=$?
set -e

echo
echo "Raw results: ${raw_json}"
echo "Per-repo scorecards are embedded in each case output (--- SCORECARD ---)."
echo "Scrub reports: ${work}/*/ground-truth/scrub-report.txt"
echo "Record outcomes in ../BASELINE.md (Reconstruction section)."
exit "${rc}"
