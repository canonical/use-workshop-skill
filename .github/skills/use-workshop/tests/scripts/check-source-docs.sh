#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Offline guard: every upstream doc path the skill cites must still exist.
#
# The skill points at the canonical Workshop docs by relative path — in each
# file's <source_docs> block and in inline references. When upstream renames,
# merges, or deletes a page (as when the per-tool CLI explanations were folded
# into explanation/cli.md), those citations rot silently. This check extracts
# every backticked `<area>/…​.md|.json` token (plus `llms.txt`) from SKILL.md,
# references/, and workflows/, and fails if any is absent from the committed
# tests/docs-manifest.txt. The manifest is regenerated from a Workshop checkout
# by `make update-docs-manifest`; this check itself is API-free and offline, so
# it runs in the free CI gate. Generalizes check-doc-paths.sh (which guards only
# the four-page CLI reference shape) to the whole doc tree.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tests_dir="$(cd "${script_dir}/.." && pwd)"
skill_root="$(cd "${tests_dir}/.." && pwd)"

manifest="${tests_dir}/docs-manifest.txt"
if [[ ! -f "${manifest}" ]]; then
  echo "error: ${manifest} missing — run 'make update-docs-manifest' (needs WORKSHOP_REPO)." >&2
  exit 2
fi

MANIFEST="${manifest}" SKILL_ROOT="${skill_root}" python3 - <<'PY'
import glob, os, re, sys

skill_root = os.environ["SKILL_ROOT"]
manifest_path = os.environ["MANIFEST"]

valid = set()
with open(manifest_path) as fh:
    for line in fh:
        line = line.strip()
        if line and not line.startswith("#"):
            valid.add(line)

# Backticked doc-path tokens the skill is expected to keep in sync with upstream.
prefix = re.compile(r"^(explanation|how-to|reference|tutorial|release-notes|contributing)/.+\.(md|json)$")

def expand(tok):
    # Expand a single brace group, e.g. a/{b,c}-x.md -> a/b-x.md, a/c-x.md.
    m = re.match(r"^(.*)\{([^}]+)\}(.*)$", tok)
    if not m:
        return [tok]
    return [m.group(1) + part.strip() + m.group(3) for part in m.group(2).split(",")]

files = (
    ["SKILL.md"]
    + sorted(glob.glob(os.path.join(skill_root, "references", "*.md")))
    + sorted(glob.glob(os.path.join(skill_root, "workflows", "*.md")))
)
offenders = []
checked = 0
for entry in files:
    rel = os.path.relpath(entry, skill_root) if os.path.isabs(entry) else entry
    path = os.path.join(skill_root, rel)
    if not os.path.exists(path):
        continue
    for lineno, line in enumerate(open(path), 1):
        for tok in re.findall(r"`([^`]+)`", line):
            for cand in expand(tok):
                cand = cand.strip()
                if cand == "llms.txt" or prefix.match(cand):
                    checked += 1
                    if cand not in valid:
                        offenders.append(f"{rel}:{lineno}:{cand}")

if offenders:
    print("error: skill cites doc path(s) not in docs-manifest.txt.", file=sys.stderr)
    print("Either the path is stale (upstream renamed/removed it) or the manifest", file=sys.stderr)
    print("is behind — regenerate with 'make update-docs-manifest'. Offenders:", file=sys.stderr)
    for o in offenders:
        print(f"  {o}", file=sys.stderr)
    sys.exit(1)

print(f"ok: {checked} source-doc path(s) checked against docs-manifest.txt")
PY
