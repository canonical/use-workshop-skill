#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
"""Repo-wide Workshop scrub for the reconstruction eval's clean-room sandbox.

Called by run-reconstruction.sh AFTER the ground truth has been parked. Walks
the staged repo, and for every text file that mentions Workshop:

  1. copies the original to <ground-truth>/redacted-originals/<relpath>,
  2. rewrites it in place — CLI usage, `.workshop/...` paths and WORKSHOP*
     identifiers are replaced token-wise; then any surviving line that still
     mentions "workshop" (case-insensitive) collapses to `redacted`, so the
     line's arguments (workshop names, SDK names, ports) cannot leak,
  3. appends a line to the scrub report.

JSON files are token-scrubbed only — collapsing lines there would break the
structure the agent reads as toolchain evidence.

Skipped: .git/, .claude/ (the skills we install on purpose), binaries, files
over --max-bytes, and the ground-truth tree itself.

Scrubbing is deliberately over-eager: a false positive costs the agent a few
lines of unrelated prose, a false negative leaks the answer.
"""

import argparse
import os
import re
import shutil
import sys

SKIP_DIRS = {".git", ".claude", "node_modules", "__pycache__", ".mypy_cache"}

CLI_VERBS = (
    "launch|run|exec|shell|connect|disconnect|refresh|init|info|list|start|"
    "stop|remove|changes|tasks|purge|sketch-sdk"
)


def is_probably_text(path, sniff=8192):
    try:
        with open(path, "rb") as fh:
            chunk = fh.read(sniff)
    except OSError:
        return False
    if b"\x00" in chunk:
        return False
    return True


def redact(text, is_json):
    """Token-level scrub, then whole-line collapse for non-JSON."""
    text = re.sub(rf"workshop[ .]({CLI_VERBS})\b", "redacted", text)
    text = re.sub(r"launch-workshop", "redacted", text)
    text = re.sub(r"\.workshop[\w./-]*", "redacted", text)
    text = re.sub(r"\bWORKSHOP\w*\b", "REDACTED", text)
    if is_json:
        # Structure-preserving: scrub plug/slot refs (their arguments carry
        # ground-truth workshop/SDK/plug names) and the bare word.
        text = re.sub(r"\b[\w-]+/[\w-]+:[\w-]+\b", "redacted", text)
        return re.sub(r"(?i)workshop", "redacted", text)
    return "\n".join(
        "redacted" if re.search(r"(?i)workshop|REDACTED", line) else line
        for line in text.split("\n")
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="staged clean-room repo")
    ap.add_argument("--ground-truth", required=True, help="parked ground-truth tree")
    ap.add_argument("--report", required=True, help="scrub report to append to")
    ap.add_argument("--max-bytes", type=int, default=2_000_000)
    args = ap.parse_args()

    originals = os.path.join(args.ground_truth, "redacted-originals")
    scrubbed = 0

    with open(args.report, "a") as report:
        report.write("\n## Redacted files (mentioned Workshop)\n")
        for dirpath, dirnames, filenames in os.walk(args.repo):
            dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
            for filename in sorted(filenames):
                path = os.path.join(dirpath, filename)
                if os.path.islink(path):
                    continue
                try:
                    size = os.path.getsize(path)
                except OSError:
                    continue
                if size > args.max_bytes or not is_probably_text(path):
                    continue
                with open(path, errors="replace") as fh:
                    text = fh.read()
                if not re.search(r"(?i)workshop", text):
                    continue

                rel = os.path.relpath(path, args.repo)
                backup = os.path.join(originals, rel)
                os.makedirs(os.path.dirname(backup), exist_ok=True)
                shutil.copy2(path, backup)

                new_text = redact(text, path.endswith(".json"))
                mode = os.stat(path).st_mode
                with open(path, "w") as fh:
                    fh.write(new_text)
                os.chmod(path, mode)

                hits = len(re.findall(r"(?i)workshop", text))
                report.write(f"- {rel} ({hits} mention(s))\n")
                scrubbed += 1

        if not scrubbed:
            report.write("- (none)\n")

    print(f"   redacted {scrubbed} file(s) mentioning Workshop")
    return 0


if __name__ == "__main__":
    sys.exit(main())
