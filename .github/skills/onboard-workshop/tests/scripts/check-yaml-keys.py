#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
"""Offline guard: YAML this skill shows must use only real definition keys.

Same contract as the use-workshop copy, with two differences:
- The allowlist is SHARED — read from ../use-workshop/tests/allowed-keys.json
  so one `make update-docs-manifest` run keeps both skills honest.
- Templates are globbed recursively (templates/**/*.yaml) and a template file
  named `sdk.yaml` is classified under the sdk allowlist (this skill ships an
  in-project SDK template tree, which the sibling does not).
"""

import glob
import json
import os
import re
import sys

import yaml

script_dir = os.path.dirname(os.path.abspath(__file__))
tests_dir = os.path.dirname(script_dir)
skill_root = os.path.dirname(tests_dir)
skills_dir = os.path.dirname(skill_root)

keys_path = os.path.join(skills_dir, "use-workshop", "tests", "allowed-keys.json")
if not os.path.exists(keys_path):
    sys.exit(
        f"error: shared {keys_path} missing — run 'make update-docs-manifest' "
        "in use-workshop/tests (needs WORKSHOP_REPO)."
    )

with open(keys_path) as fh:
    allowed = json.load(fh)

WORKSHOP_KEYS = set(allowed["workshop"])
SDK_KEYS = set(allowed["sdk"])
FRAGMENT_KEYS = WORKSHOP_KEYS | {"plugs", "slots"}

FENCE_OPEN = re.compile(r"^(\s*)```ya?ml\s*$")
FENCE_CLOSE = re.compile(r"^\s*```\s*$")
PATH_COMMENT = re.compile(r"^#\s*(\S+\.yaml)\b")


def classify(block_lines, source_file):
    """Return (kind, allowlist) for a YAML block."""
    if source_file.endswith(".yaml"):  # a templates/ YAML file
        if os.path.basename(source_file) == "sdk.yaml":
            return "sdk", SDK_KEYS
        return "workshop", WORKSHOP_KEYS
    for line in block_lines:
        stripped = line.strip()
        if not stripped:
            continue
        m = PATH_COMMENT.match(stripped)
        if m:
            path = m.group(1)
            if path.endswith("sdk.yaml"):
                return "sdk", SDK_KEYS
            if path.endswith("workshop.yaml") or re.search(r"\.workshop/[^/]+\.yaml$", path):
                return "workshop", WORKSHOP_KEYS
        break  # only the first non-blank line decides
    return "fragment", FRAGMENT_KEYS


def iter_blocks(path):
    """Yield (start_lineno, [block lines]) for each fenced yaml block."""
    lines = open(path).read().split("\n")
    i = 0
    while i < len(lines):
        if FENCE_OPEN.match(lines[i]):
            start = i + 1
            body = []
            j = i + 1
            while j < len(lines) and not FENCE_CLOSE.match(lines[j]):
                body.append(lines[j])
                j += 1
            yield start + 1, body  # 1-indexed line of first body line
            i = j + 1
        else:
            i += 1


def check_file(rel, offenders):
    path = os.path.join(skill_root, rel)
    if not os.path.exists(path):
        return
    blocks = (
        [(1, open(path).read().split("\n"))]
        if rel.startswith("templates/")
        else list(iter_blocks(path))
    )
    for lineno, body in blocks:
        kind, allowlist = classify(body, rel)
        text = "\n".join(body)
        try:
            data = yaml.safe_load(text)
        except yaml.YAMLError as exc:
            offenders.append(f"{rel}:{lineno}: YAML snippet ({kind}) failed to parse: {exc}")
            continue
        if not isinstance(data, dict):
            # A bare list/scalar has no top-level keys to police.
            continue
        for key in data:
            if key not in allowlist:
                offenders.append(
                    f"{rel}:{lineno}: yaml block ({kind}) uses unknown top-level key '{key}'"
                )


def main():
    files = (
        ["SKILL.md"]
        + sorted(glob.glob(os.path.join(skill_root, "references", "*.md")))
        + sorted(glob.glob(os.path.join(skill_root, "workflows", "*.md")))
        + sorted(glob.glob(os.path.join(skill_root, "templates", "**", "*.yaml"), recursive=True))
    )
    rels = [os.path.relpath(f, skill_root) if os.path.isabs(f) else f for f in files]

    offenders = []
    count = 0
    for rel in rels:
        check_file(rel, offenders)
        count += 1
    if offenders:
        print("error: skill YAML uses keys outside the upstream schema allowlists.", file=sys.stderr)
        print("Allowlists come from the SHARED use-workshop/tests/allowed-keys.json", file=sys.stderr)
        print("(generated from the upstream JSON schemas). Fix the key, or regenerate", file=sys.stderr)
        print("the allowlist there if the schema genuinely changed. Offenders:", file=sys.stderr)
        for o in offenders:
            print(f"  {o}", file=sys.stderr)
        sys.exit(1)
    print(f"ok: YAML snippets in {count} file(s) checked against schema key allowlists")


if __name__ == "__main__":
    main()
