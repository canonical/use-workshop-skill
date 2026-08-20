#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Offline guard: every upstream doc path a skill cites must still exist.
#
# The skills point at the canonical Workshop docs by relative path — in each
# file's <source_docs> block and in inline references. When upstream renames,
# merges, or deletes a page (as when the per-tool CLI explanations were folded
# into explanation/cli.md), those citations rot silently. This check extracts
# every backticked `<area>/....md|.json` token (plus `llms.txt` and
# `llms-full.txt`) from SKILL.md, references/, and workflows/, and fails if any
# is absent from the manifest. The manifest is regenerated from a Workshop
# checkout by `make update-docs-manifest` in use-workshop/tests and is SHARED
# by both suites — do not add a second one. API-free and offline, so it runs
# in the free CI gate.
#
# Usage: check-source-docs.sh --skill-root <abs path> --manifest <abs path>

set -euo pipefail

skill_root=""
manifest=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill-root) skill_root="$2"; shift 2 ;;
    --manifest)   manifest="$2";   shift 2 ;;
    *) echo "error: unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ -n "${skill_root}" && -n "${manifest}" ]] || {
  echo "usage: $0 --skill-root <abs path> --manifest <abs path>" >&2
  exit 2
}

if [[ ! -f "${manifest}" ]]; then
  echo "error: manifest ${manifest} missing — run 'make update-docs-manifest' in use-workshop/tests (needs WORKSHOP_REPO)." >&2
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
                if cand in ("llms.txt", "llms-full.txt") or prefix.match(cand):
                    checked += 1
                    if cand not in valid:
                        offenders.append(f"{rel}:{lineno}:{cand}")

if offenders:
    print("error: skill cites doc path(s) not in the shared docs-manifest.txt.", file=sys.stderr)
    print("Either the path is stale (upstream renamed/removed it) or the manifest", file=sys.stderr)
    print("is behind — regenerate in use-workshop/tests with 'make update-docs-manifest'.", file=sys.stderr)
    print("Offenders:", file=sys.stderr)
    for o in offenders:
        print(f"  {o}", file=sys.stderr)
    sys.exit(1)

print(f"ok: {checked} source-doc path(s) checked against the shared docs-manifest.txt")
PY
