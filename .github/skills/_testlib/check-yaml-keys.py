#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
"""Offline guard: YAML a skill shows must use only real definition keys.

Every fenced ```yaml block in SKILL.md / references / workflows, plus every
templates/ YAML file, is classified and its top-level keys checked against an
allowlist derived from the upstream JSON schemas (allowed-keys.json, written
by update-docs-manifest.sh in use-workshop/tests and SHARED by both suites):

  sdk       - an in-project or sketch SDK sdk.yaml. Signalled by a first-line
              path comment ending in `sdk.yaml` (e.g. `# .workshop/<NAME>/sdk.yaml`),
              or (with --classify-sdk-template) by a template file named
              `sdk.yaml`. Allowlist: the sdk schema's top-level keys. It has NO
              `hooks` key, so a `hooks:` list/map in an in-project sdk.yaml
              fails here — the exact drift that shipped once already.
  workshop  - a full workshop definition. Signalled by a path comment ending in
              `workshop.yaml` or `.workshop/<name>.yaml`, or by being a
              templates/ YAML file. Allowlist: the workshop schema's keys.
  sdkcraft  - a publisher-side sdkcraft.yaml (design-sdk suite only). Signalled
              (with --classify-sdkcraft-template) by a path comment or template
              basename `sdkcraft.yaml`. Allowlist: the sdkcraft schema's keys.
  ci/spread - GitHub Actions workflow or spread files shown by design-sdk
              (path comments under `.github/workflows/`, or basenames
              `spread.yaml`/`task.yaml`). Neither has an upstream Workshop
              schema, so these are parse-checked but NOT key-checked — a
              deliberate, flag-gated policy widening; only the design-sdk
              suite passes --classify-sdkcraft-template, so the sibling suites
              keep the tight fragment allowlist.
  fragment  - anything else: a partial snippet rooted at a workshop-definition
              section (`sdks:`, `connections:`, `actions:`) or an interface
              `plugs:`/`slots:` block. Allowlist: the workshop keys plus
              `plugs`/`slots` (plus the sdkcraft keys when
              --classify-sdkcraft-template is set, since design-sdk references
              legitimately show snippets rooted at `parts:`/`platforms:`).

Only TOP-LEVEL keys are checked; placeholders like <NAME> only ever appear as
values, so snippets parse cleanly. A snippet that fails to parse is also an
error (templates are additionally parsed by `make check-yaml`). API-free and
offline — part of the free CI gate.

Usage:
  check-yaml-keys.py --skill-root <abs> --allowed-keys <abs>
                     [--templates-recursive] [--classify-sdk-template]
                     [--classify-sdkcraft-template]

--templates-recursive globs templates/**/*.yaml instead of templates/*.yaml;
--classify-sdk-template classifies a template basename `sdk.yaml` under the
sdk allowlist. Both are used by the onboard-workshop suite, which ships an
in-project SDK template tree the sibling does not.
--classify-sdkcraft-template (design-sdk suite) enables the sdkcraft
classification and the ci/spread parse-only kinds described above.
"""

import argparse
import glob
import json
import os
import re
import sys

import yaml

parser = argparse.ArgumentParser()
parser.add_argument("--skill-root", required=True)
parser.add_argument("--allowed-keys", required=True)
parser.add_argument("--templates-recursive", action="store_true")
parser.add_argument("--classify-sdk-template", action="store_true")
parser.add_argument("--classify-sdkcraft-template", action="store_true")
args = parser.parse_args()

skill_root = os.path.abspath(args.skill_root)
keys_path = os.path.abspath(args.allowed_keys)

if not os.path.exists(keys_path):
    sys.exit(
        f"error: shared {keys_path} missing — run 'make update-docs-manifest' "
        "in use-workshop/tests (needs WORKSHOP_REPO)."
    )

with open(keys_path) as fh:
    allowed = json.load(fh)

WORKSHOP_KEYS = set(allowed["workshop"])
SDK_KEYS = set(allowed["sdk"])
SDKCRAFT_KEYS = set(allowed.get("sdkcraft", ()))
FRAGMENT_KEYS = WORKSHOP_KEYS | {"plugs", "slots"}
if args.classify_sdkcraft_template:
    if not SDKCRAFT_KEYS:
        sys.exit(
            "error: --classify-sdkcraft-template needs an 'sdkcraft' list in "
            f"{keys_path} — regenerate it in use-workshop/tests."
        )
    FRAGMENT_KEYS |= SDKCRAFT_KEYS

FENCE_OPEN = re.compile(r"^(\s*)```ya?ml\s*$")
FENCE_CLOSE = re.compile(r"^\s*```\s*$")
PATH_COMMENT = re.compile(r"^#\s*(\S+\.ya?ml(?:\.in)?)\b")

# Kinds with no upstream Workshop schema: parse-checked, never key-checked.
PARSE_ONLY_BASENAMES = {"spread.yaml": "spread", "task.yaml": "spread"}


def classify(block_lines, source_file):
    """Return (kind, allowlist) for a YAML block; allowlist None = parse-only."""
    if source_file.endswith(".yaml"):  # a templates/ YAML file
        basename = os.path.basename(source_file)
        if args.classify_sdk_template and basename == "sdk.yaml":
            return "sdk", SDK_KEYS
        if args.classify_sdkcraft_template:
            if basename == "sdkcraft.yaml":
                return "sdkcraft", SDKCRAFT_KEYS
            if basename in PARSE_ONLY_BASENAMES:
                return PARSE_ONLY_BASENAMES[basename], None
        return "workshop", WORKSHOP_KEYS
    for line in block_lines:
        stripped = line.strip()
        if not stripped:
            continue
        m = PATH_COMMENT.match(stripped)
        if m:
            path = m.group(1)
            if args.classify_sdkcraft_template:
                if path.endswith("sdkcraft.yaml"):
                    return "sdkcraft", SDKCRAFT_KEYS
                if ".github/workflows/" in path:
                    return "ci", None
                if os.path.basename(path) in PARSE_ONLY_BASENAMES:
                    return PARSE_ONLY_BASENAMES[os.path.basename(path)], None
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
        if allowlist is None:
            # Parse-only kind (ci/spread): no Workshop-side schema to check.
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
    template_glob = (
        os.path.join(skill_root, "templates", "**", "*.yaml")
        if args.templates_recursive
        else os.path.join(skill_root, "templates", "*.yaml")
    )
    files = (
        ["SKILL.md"]
        + sorted(glob.glob(os.path.join(skill_root, "references", "*.md")))
        + sorted(glob.glob(os.path.join(skill_root, "workflows", "*.md")))
        + sorted(glob.glob(template_glob, recursive=args.templates_recursive))
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
