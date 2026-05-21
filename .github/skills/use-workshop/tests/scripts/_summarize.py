#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
"""Reduce a promptfoo eval output JSON to a slim, commit-safe summary.

Drops full model outputs and prompts (multi-MB). Keeps:
  - meta: model, date, provider, totals, tokens, cost
  - cases: per-case description, pass/fail, failed-assertion details only
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def slim_assertion(component: dict) -> dict:
    """Reduce one assertion result to its essentials."""
    a = component.get("assertion") or {}
    return {
        "type": a.get("type"),
        "value": a.get("value"),
        "passed": bool(component.get("pass", False)),
        "reason": (component.get("reason") or "")[:500],
    }


def slim_case(result: dict) -> dict:
    tc = result.get("testCase") or {}
    grading = result.get("gradingResult") or {}
    components = grading.get("componentResults") or []
    passed = bool(result.get("success", False))

    out: dict = {
        "description": tc.get("description"),
        "passed": passed,
        "score": result.get("score"),
        "latency_ms": result.get("latencyMs"),
        "cost": round(result.get("cost") or 0, 6),
    }
    if not passed:
        # Only record assertion details when the case failed; reduces noise.
        out["failed_assertions"] = [
            slim_assertion(c) for c in components if not c.get("pass", True)
        ]
        out["failure_reason"] = (grading.get("reason") or "")[:500]
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--raw", required=True, help="Raw promptfoo JSON output path")
    p.add_argument("--model", required=True, help="Model id (for meta block)")
    p.add_argument("--out", required=True, help="Slim summary output path")
    args = p.parse_args()

    raw = json.loads(Path(args.raw).read_text())
    results_block = raw.get("results") or {}
    cases = results_block.get("results") or []

    stats = results_block.get("stats") or {}
    token_usage = stats.get("tokenUsage") or {}

    passed = sum(1 for c in cases if c.get("success"))
    failed = len(cases) - passed

    summary = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": args.model,
            "provider": "anthropic:messages",
            "total_cases": len(cases),
            "passed": passed,
            "failed": failed,
            "pass_rate": round(passed / len(cases), 4) if cases else 0,
            "tokens": {
                "total": token_usage.get("total"),
                "prompt": token_usage.get("prompt"),
                "completion": token_usage.get("completion"),
                "cached": token_usage.get("cached"),
            },
            "cost_usd": round(sum((c.get("cost") or 0) for c in cases), 4),
        },
        "cases": [slim_case(c) for c in cases],
    }

    Path(args.out).write_text(json.dumps(summary, indent=2) + "\n")
    print(
        f"Summary: {passed}/{len(cases)} passed "
        f"({summary['meta']['pass_rate'] * 100:.2f}%) "
        f"-> {args.out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
