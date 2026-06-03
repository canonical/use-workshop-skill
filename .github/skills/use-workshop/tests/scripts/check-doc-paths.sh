#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Structural guard for the use-workshop skill's CLI doc references.
#
# The Workshop CLI reference is published as four combined pages — one per
# tool, each subcommand a section within it. There are NO per-subcommand
# pages. This check fails if any SKILL.md / references / workflows file points
# a <source_docs> path at a `reference/cli/*` page outside that allowed set
# (e.g. a stale `reference/cli/workshop-launch.md` from before the pages were
# consolidated, or a typo). Cheap and API-free; run it before the routing eval.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_root="$(cd "${script_dir}/../.." && pwd)"
cd "${skill_root}"

# The only valid reference/cli/*.md basenames — one combined page per tool.
allowed_re='^(workshop|sdk|sdkcraft|workshopctl)\.md$'

# Collect every `reference/cli/<name>.md` reference as `file:line:path`.
matches="$(grep -rnoE 'reference/cli/[A-Za-z0-9_-]+\.md' \
  SKILL.md references workflows 2>/dev/null || true)"

offenders=""
while IFS= read -r entry; do
  [[ -z "${entry}" ]] && continue
  name="${entry##*reference/cli/}"   # -> <name>.md
  if [[ ! "${name}" =~ ${allowed_re} ]]; then
    offenders+="${entry}"$'\n'
  fi
done <<< "${matches}"

if [[ -n "${offenders}" ]]; then
  {
    echo "error: stale or unknown reference/cli/ doc path(s) found."
    echo "The CLI reference is four combined pages: workshop.md, sdk.md, sdkcraft.md, workshopctl.md (no per-subcommand pages)."
    echo "Offending file:line:path —"
    printf '%s' "${offenders}"
  } >&2
  exit 1
fi

count="$(printf '%s\n' "${matches}" | grep -c . || true)"
echo "ok: ${count} reference/cli/ doc path(s) checked; all map to the 4 combined pages."
