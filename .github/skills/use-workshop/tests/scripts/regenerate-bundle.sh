#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Regenerate tests/skill-bundle.md from SKILL.md + references/*.md + workflows/*.md.
#
# The bundle is the system prompt for the routing eval. It simulates the
# mid-conversation state where Claude has loaded the skill and satisfied its
# <required_reading> directives. Regenerate any time SKILL.md or one of the
# references/workflows files changes.

set -euo pipefail

# Resolve skill root regardless of where this is invoked from.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_root="$(cd "${script_dir}/../.." && pwd)"
out="${skill_root}/tests/skill-bundle.md"

cd "${skill_root}"

{
  echo "# Skill bundle: SKILL.md + references + workflows concatenated for eval"
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
} > "${out}"

bytes=$(wc -c <"${out}")
echo "Wrote ${out} (${bytes} bytes)"
