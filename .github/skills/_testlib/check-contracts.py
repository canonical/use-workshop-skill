#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
"""Contract gate for the machine-readable hand-off blocks a skill emits.

A skill that hands structured state to the next stage (or to a scorer) does
it through a versioned JSON document with a JSON Schema next to the skill.
This script checks those documents cheaply — no LXD, no claude, no network —
so a broken schema or a broken example fails `make check` before any paid or
slow eval runs. Pattern borrowed from rascheel/scheel-skills'
`schema/validate_contracts.py` (bundled good/invalid examples, --self-test).

Stdlib only: CI installs nothing but PyYAML, so this implements the subset
of JSON Schema the repo's schemas use and REFUSES any other keyword (exit 2)
instead of silently ignoring it. Supported: type, enum, const, required,
properties, additionalProperties (bool), items (schema), minItems, maxItems,
minLength, allOf, if/then/else; annotations ($schema, $id, $comment, title,
description) are ignored. When the `jsonschema` package happens to be
installed, --self-test also cross-checks every example against it.

Modes (exit 0 ok, 1 contract findings, 2 setup/usage error):

    # validate instance files
    check-contracts.py --schema S.json --instance a.json [b.json ...]

    # every <dir>/valid/*.json must pass, every <dir>/invalid/*.json must fail
    check-contracts.py --schema S.json --self-test --examples <dir>

    # extract the LAST ```json <fence> block from a transcript and validate
    # it; always prints a one-line JSON result for a harness to embed:
    # {"verdict_valid": bool, "found": bool, "document": {...}|null, "errors": [...]}
    check-contracts.py --schema S.json --transcript T.txt --fence onboarding-verdict
"""

import argparse
import glob
import json
import os
import re
import sys

ANNOTATIONS = {"$schema", "$id", "$comment", "title", "description"}
SUPPORTED = ANNOTATIONS | {
    "type", "enum", "const", "required", "properties", "additionalProperties",
    "items", "minItems", "maxItems", "minLength", "allOf", "if", "then", "else",
}

TYPES = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "null": lambda v: v is None,
}


class SchemaError(Exception):
    """The schema uses something this validator does not implement."""


def check_schema(schema, where="#"):
    if not isinstance(schema, dict):
        raise SchemaError(f"{where}: schema must be an object")
    unknown = sorted(set(schema) - SUPPORTED)
    if unknown:
        raise SchemaError(f"{where}: unsupported keyword(s) {unknown}")
    for key in ("if", "then", "else", "items"):
        if key in schema:
            check_schema(schema[key], f"{where}/{key}")
    for name, sub in schema.get("properties", {}).items():
        check_schema(sub, f"{where}/properties/{name}")
    for i, sub in enumerate(schema.get("allOf", [])):
        check_schema(sub, f"{where}/allOf/{i}")
    ap = schema.get("additionalProperties", True)
    if not isinstance(ap, bool):
        raise SchemaError(f"{where}: additionalProperties must be a boolean")
    if "type" in schema:
        for t in (schema["type"] if isinstance(schema["type"], list) else [schema["type"]]):
            if t not in TYPES:
                raise SchemaError(f"{where}: unknown type {t!r}")


def _eq(a, b):
    # JSON equality: True != 1 here, unlike Python.
    return type(a) is type(b) and a == b if isinstance(a, bool) or isinstance(b, bool) else a == b


def validate(value, schema, path="$"):
    """Return a list of human-readable errors (empty when valid)."""
    errors = []
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(TYPES[t](value) for t in types):
            return [f"{path}: expected type {'/'.join(types)}, got {json.dumps(value)[:60]}"]
    if "const" in schema and not _eq(value, schema["const"]):
        errors.append(f"{path}: must be {json.dumps(schema['const'])}, got {json.dumps(value)[:60]}")
    if "enum" in schema and not any(_eq(value, e) for e in schema["enum"]):
        errors.append(f"{path}: {json.dumps(value)[:60]} not one of {json.dumps(schema['enum'])}")
    if isinstance(value, str) and "minLength" in schema and len(value) < schema["minLength"]:
        errors.append(f"{path}: shorter than {schema['minLength']}")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path}: needs at least {schema['minItems']} item(s), has {len(value)}")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: allows at most {schema['maxItems']} item(s), has {len(value)}")
        if "items" in schema:
            for i, item in enumerate(value):
                errors += validate(item, schema["items"], f"{path}[{i}]")
    if isinstance(value, dict):
        for req in schema.get("required", []):
            if req not in value:
                errors.append(f"{path}: missing required key '{req}'")
        props = schema.get("properties", {})
        for key, sub in props.items():
            if key in value:
                errors += validate(value[key], sub, f"{path}.{key}")
        if schema.get("additionalProperties", True) is False:
            for key in sorted(set(value) - set(props)):
                errors.append(f"{path}: unexpected key '{key}'")
    for sub in schema.get("allOf", []):
        errors += validate(value, sub, path)
    if "if" in schema:
        branch = "then" if not validate(value, schema["if"], path) else "else"
        if branch in schema:
            errors += validate(value, schema[branch], path)
    return errors


def load_json(path):
    with open(path) as fh:
        return json.load(fh)


def extract_fenced(text, fence):
    """Last ```json <fence> ... ``` block in text, or None."""
    pattern = re.compile(
        r"^[ \t]*```[ \t]*json[ \t]+" + re.escape(fence) + r"[ \t]*\n(.*?)^[ \t]*```",
        re.MULTILINE | re.DOTALL,
    )
    blocks = pattern.findall(text)
    return blocks[-1] if blocks else None


def mode_instances(schema, paths):
    failed = False
    for p in paths:
        try:
            errs = validate(load_json(p), schema)
        except (OSError, json.JSONDecodeError) as exc:
            errs = [f"cannot load: {exc}"]
        for e in errs:
            print(f"error: {p}: {e}", file=sys.stderr)
        failed |= bool(errs)
    if failed:
        return 1
    print(f"ok: {len(paths)} instance(s) valid")
    return 0


def mode_self_test(schema, schema_path, examples):
    valid = sorted(glob.glob(os.path.join(examples, "valid", "*.json")))
    invalid = sorted(glob.glob(os.path.join(examples, "invalid", "*.json")))
    if not valid or not invalid:
        print(f"error: need both {examples}/valid/*.json and {examples}/invalid/*.json", file=sys.stderr)
        return 2
    try:
        import jsonschema  # optional cross-check; never required
    except ImportError:
        jsonschema = None
    failed = False
    for p, want_valid in [(p, True) for p in valid] + [(p, False) for p in invalid]:
        errs = validate(load_json(p), schema)
        if want_valid and errs:
            failed = True
            print(f"error: {p} should be valid: {errs}", file=sys.stderr)
        elif not want_valid and not errs:
            failed = True
            print(f"error: {p} should be rejected but passed", file=sys.stderr)
        if jsonschema is not None:
            ref_ok = jsonschema.Draft202012Validator(schema).is_valid(load_json(p))
            if ref_ok != (not errs):
                failed = True
                print(f"error: {p}: stdlib validator says {'valid' if not errs else 'invalid'}, "
                      f"jsonschema says {'valid' if ref_ok else 'invalid'}", file=sys.stderr)
    if failed:
        return 1
    xcheck = " (cross-checked with jsonschema)" if jsonschema is not None else ""
    print(f"ok: {os.path.basename(schema_path)}: {len(valid)} valid accepted, "
          f"{len(invalid)} invalid rejected{xcheck}")
    return 0


def mode_transcript(schema, transcript, fence):
    try:
        with open(transcript, errors="replace") as fh:
            text = fh.read()
    except OSError as exc:
        print(f"error: cannot read {transcript}: {exc}", file=sys.stderr)
        return 2
    raw = extract_fenced(text, fence)
    result = {"verdict_valid": False, "found": raw is not None, "document": None, "errors": []}
    if raw is None:
        result["errors"] = [f"no ```json {fence} block found"]
    else:
        try:
            doc = json.loads(raw)
            result["document"] = doc
            result["errors"] = validate(doc, schema)
            result["verdict_valid"] = not result["errors"]
        except json.JSONDecodeError as exc:
            result["errors"] = [f"block is not valid JSON: {exc}"]
    print(json.dumps(result))
    return 0 if result["verdict_valid"] else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--schema", required=True)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--instance", nargs="+")
    mode.add_argument("--self-test", action="store_true")
    mode.add_argument("--transcript")
    ap.add_argument("--examples", help="dir with valid/ and invalid/ (for --self-test)")
    ap.add_argument("--fence", default="onboarding-verdict", help="fence tag after ```json (for --transcript)")
    args = ap.parse_args()

    try:
        schema = load_json(args.schema)
        check_schema(schema)
    except (OSError, json.JSONDecodeError, SchemaError) as exc:
        print(f"error: schema {args.schema}: {exc}", file=sys.stderr)
        return 2

    if args.instance:
        return mode_instances(schema, args.instance)
    if args.self_test:
        if not args.examples:
            print("error: --self-test needs --examples", file=sys.stderr)
            return 2
        return mode_self_test(schema, args.schema, args.examples)
    return mode_transcript(schema, args.transcript, args.fence)


if __name__ == "__main__":
    sys.exit(main())
