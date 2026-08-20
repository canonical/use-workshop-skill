#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Regenerate a suite's tests/skill-bundle.md from SKILL.md + references/*.md +
# workflows/*.md (+ optional borrowed sibling files).
#
# The bundle is the system prompt for the routing eval. It simulates the
# mid-conversation state where Claude has loaded the skill and satisfied its
# <required_reading> directives. Regenerate any time SKILL.md or one of the
# references/workflows files changes.
#
# Usage:
#   regenerate-bundle.sh --skill-root <abs path>
#                        [--extras <file>] [--selection-out <file>]
#
# --extras: a file of paths (relative to the skill root; # comments allowed)
#   appended to the bundle — used by onboard-workshop, which reads sibling
#   use-workshop references by relative path.
# --selection-out: also write a skill-selection context file holding ONLY the
#   two skills' frontmatter blocks, used by scenarios/skill-selection.yaml to
#   test which skill a model picks from descriptions alone.

set -euo pipefail

skill_root=""
extras=""
selection_out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill-root)    skill_root="$2";    shift 2 ;;
    --extras)        extras="$2";        shift 2 ;;
    --selection-out) selection_out="$2"; shift 2 ;;
    *) echo "error: unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ -n "${skill_root}" ]] || {
  echo "usage: $0 --skill-root <abs path> [--extras <file>] [--selection-out <file>]" >&2
  exit 2
}

skill_root="$(cd "${skill_root}" && pwd)"
skills_dir="$(cd "${skill_root}/.." && pwd)"
out="${skill_root}/tests/skill-bundle.md"

cd "${skill_root}"

# A missing source dir would otherwise surface as a raw `cat` glob error.
for d in references workflows; do
  if [[ ! -d "${d}" ]]; then
    echo "error: expected directory '${d}/' missing under ${skill_root}" >&2
    exit 1
  fi
done

{
  if [[ -n "${extras}" ]]; then
    echo "# Skill bundle: SKILL.md + references + workflows + borrowed sibling files"
  else
    echo "# Skill bundle: SKILL.md + references + workflows concatenated for eval"
  fi
  echo
  echo "============================================================"
  echo "# SKILL.md"
  echo "============================================================"
  cat SKILL.md
  for f in references/*.md workflows/*.md; do
    echo
    echo "============================================================"
    echo "# ${f}"
    echo "============================================================"
    cat "${f}"
  done
  if [[ -n "${extras}" ]]; then
    if [[ ! -f "${extras}" ]]; then
      echo "error: extras file not found: ${extras}" >&2
      exit 1
    fi
    while IFS= read -r rel; do
      [[ -z "${rel}" || "${rel}" == \#* ]] && continue
      if [[ ! -f "${rel}" ]]; then
        echo "error: bundle-extras entry not found: ${rel}" >&2
        exit 1
      fi
      echo
      echo "============================================================"
      echo "# ${rel} (borrowed from sibling skill)"
      echo "============================================================"
      cat "${rel}"
    done < "${extras}"
  fi
} > "${out}"

if [[ -n "${selection_out}" ]]; then
  # Skill-selection context: frontmatter (--- ... ---) of both skills only.
  {
    # REUSE-IgnoreStart — emitted header for the GENERATED file, not this script's.
    echo "<!-- SPDX-License-Identifier: GPL-3.0-only -->"
    echo "<!-- Copyright 2026 Canonical Ltd. -->"
    # REUSE-IgnoreEnd
    echo "Two skills are installed. Their metadata:"
    for s in use-workshop onboard-workshop; do
      echo
      echo "## Skill: ${s}"
      awk '/^---$/{n++; next} n==1{print} n>=2{exit}' "${skills_dir}/${s}/SKILL.md"
    done
    echo
    echo "Answer with the single skill name that should handle the user's request, then one sentence of reasoning."
  } > "${selection_out}"
fi

bytes=$(wc -c <"${out}")
echo "Wrote ${out} (${bytes} bytes)"
if [[ -n "${selection_out}" ]]; then
  echo "Wrote ${selection_out} ($(wc -c <"${selection_out}") bytes)"
fi
