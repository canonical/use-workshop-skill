#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Regenerate tests/skill-bundle.md from SKILL.md + references/*.md +
# workflows/*.md + the borrowed sibling files listed in
# scripts/bundle-extras.txt (onboard-workshop reads use-workshop references
# by relative path; the eval bundle must include them to simulate the
# "required reading satisfied" state).
#
# Also regenerates tests/skill-selection-context.md: ONLY the two skills'
# frontmatter blocks, used by scenarios/skill-selection.yaml to test which
# skill a model picks from descriptions alone.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_root="$(cd "${script_dir}/../.." && pwd)"
skills_dir="$(cd "${skill_root}/.." && pwd)"
out="${skill_root}/tests/skill-bundle.md"
selection_out="${skill_root}/tests/skill-selection-context.md"
extras="${script_dir}/bundle-extras.txt"

cd "${skill_root}"

for d in references workflows; do
  if [[ ! -d "${d}" ]]; then
    echo "error: expected directory '${d}/' missing under ${skill_root}" >&2
    exit 1
  fi
done

{
  echo "# Skill bundle: SKILL.md + references + workflows + borrowed sibling files"
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
  if [[ -f "${extras}" ]]; then
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

bytes=$(wc -c <"${out}")
echo "Wrote ${out} (${bytes} bytes)"
echo "Wrote ${selection_out} ($(wc -c <"${selection_out}") bytes)"
