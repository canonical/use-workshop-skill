#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
"""Assert every scenarios/*.yaml is registered in every promptfooconfig*.yaml.

promptfoo's `tests:` list names each scenario file explicitly, so a new
scenario file that nobody adds to the config is simply never run — the suite
stays green, the case count silently stays put, and a baseline gets re-pinned
against cases that were never graded. That happened once (the 0.9.7
`confinement.yaml` round); this check makes it impossible to repeat.

Offline and free; part of `make check`. Usage:

    python3 check-scenarios.py --tests-dir <suite>/tests
"""

import argparse
import glob
import os
import sys

import yaml


def registered_paths(config_path):
    with open(config_path) as fh:
        config = yaml.safe_load(fh) or {}
    entries = config.get("tests") or []
    names = set()
    for entry in entries:
        if isinstance(entry, str) and entry.startswith("file://"):
            names.add(os.path.basename(entry[len("file://"):]))
    return names


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tests-dir", required=True)
    args = parser.parse_args()

    tests_dir = os.path.abspath(args.tests_dir)
    scenarios = {
        os.path.basename(p)
        for p in glob.glob(os.path.join(tests_dir, "scenarios", "*.yaml"))
    }
    configs = sorted(glob.glob(os.path.join(tests_dir, "promptfooconfig*.yaml")))

    if not scenarios:
        print(f"error: no scenario files under {tests_dir}/scenarios", file=sys.stderr)
        return 2
    if not configs:
        print(f"error: no promptfooconfig*.yaml in {tests_dir}", file=sys.stderr)
        return 2

    failed = False
    for config in configs:
        listed = registered_paths(config)
        missing = sorted(scenarios - listed)
        unknown = sorted(listed - scenarios)
        for name in missing:
            print(
                f"error: {os.path.basename(config)} does not run scenarios/{name} "
                "— add it to the `tests:` list",
                file=sys.stderr,
            )
            failed = True
        for name in unknown:
            print(
                f"error: {os.path.basename(config)} lists scenarios/{name}, "
                "which does not exist",
                file=sys.stderr,
            )
            failed = True

    if failed:
        return 1
    print(
        f"ok: {len(scenarios)} scenario file(s) registered in "
        f"{len(configs)} promptfoo config(s)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
