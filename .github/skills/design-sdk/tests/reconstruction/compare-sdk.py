#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
"""Deterministic scorecard: generated SDK repo vs a reference SDK's shape.

Called by provider-design-cli.js after the agent run. Unlike the sibling
onboard-workshop comparator, the candidate here starts from an EMPTY
directory and a needs-phrased brief — so the gates come from a calibrated
expectations file, not from diffing the ground truth line by line. The
parked reference tree is still used for overlap metrics and for the
llm-rubric (which sees both trees in the provider output).

Gates are functional, not textual: interfaces compare by (interface,
endpoint) rather than plug/slot names; part plugins pass by any-of groups
(a rust build and a release-binary dump of the same tool are both valid
designs); mount targets are recorded, not gated. Every expectations file is
calibrated so the reference repo itself passes its own scorecard (checked
in this suite's calibration dry-run).

Output: one JSON object on stdout. Exit 0 always (the verdict lives in the
JSON); non-zero only on harness misuse.
"""

import argparse
import glob
import json
import os
import re
import sys

import yaml

HOOK_NAMES = {
    "setup-base",
    "setup-project",
    "check-health",
    "save-state",
    "restore-state",
}

RESERVED_NAMES = {"agent", "system", "sketch"}
RESERVED_PREFIXES = ("try-", "project-")


def read_text(path):
    try:
        with open(path, errors="replace") as fh:
            return fh.read()
    except Exception:
        return ""


def load_sdk_repo(root):
    """Parse an SDK repo tree into a comparable snapshot."""
    snap = {
        "root": root,
        "sdkcraft_path": None,
        "sdkcraft": None,
        "sdkcraft_error": None,
        "hooks": {},
        "service_units": [],
        "version_file": os.path.isfile(os.path.join(root, "VERSION")),
        "readme": os.path.isfile(os.path.join(root, "README.md")),
        "spread": os.path.isfile(os.path.join(root, "tests", "spread.yaml")),
        "renovate": None,
        "renovate_error": None,
        "ci_workflows": [],
    }
    for cand in ("sdkcraft.yaml", ".sdkcraft.yaml"):
        p = os.path.join(root, cand)
        if os.path.isfile(p):
            snap["sdkcraft_path"] = cand
            try:
                with open(p) as fh:
                    data = yaml.safe_load(fh)
                snap["sdkcraft"] = data if isinstance(data, dict) else {}
                if not isinstance(data, dict):
                    snap["sdkcraft_error"] = "not a mapping"
            except yaml.YAMLError as exc:
                snap["sdkcraft"] = {}
                snap["sdkcraft_error"] = str(exc)
            break
    hdir = os.path.join(root, "hooks")
    if os.path.isdir(hdir):
        for h in sorted(os.listdir(hdir)):
            hp = os.path.join(hdir, h)
            if os.path.isfile(hp):
                snap["hooks"][h] = {
                    "executable": os.access(hp, os.X_OK),
                    "text": read_text(hp),
                }
    snap["service_units"] = sorted(
        os.path.relpath(p, root)
        for p in glob.glob(os.path.join(root, "**", "*.service"), recursive=True)
        if "/.claude/" not in p and "/.git/" not in p
    )
    rp = os.path.join(root, "renovate.json")
    if os.path.isfile(rp):
        try:
            with open(rp) as fh:
                snap["renovate"] = json.load(fh)
        except json.JSONDecodeError as exc:
            snap["renovate"] = {}
            snap["renovate_error"] = str(exc)
    snap["ci_workflows"] = sorted(
        os.path.basename(p)
        for p in glob.glob(os.path.join(root, ".github", "workflows", "*.y*ml"))
    )
    return snap


def interfaces(sdkcraft):
    """(side, interface, endpoint) triples; endpoint is '' when n/a."""
    out = set()
    for side in ("plugs", "slots"):
        for _, spec in (sdkcraft.get(side) or {}).items():
            if isinstance(spec, dict):
                iface = str(spec.get("interface") or "")
            else:
                iface = str(spec or "")
            endpoint = ""
            if isinstance(spec, dict) and spec.get("endpoint") is not None:
                endpoint = str(spec.get("endpoint"))
            if iface:
                out.add((side, iface, endpoint))
    return out


def platform_archs(sdkcraft):
    """Distinct target architectures across every platform spelling."""
    archs = set()
    for key, spec in (sdkcraft.get("platforms") or {}).items():
        key = str(key)
        if ":" in key:  # multi-base form ubuntu@24.04:amd64
            archs.add(key.rsplit(":", 1)[1])
        elif key != "all":
            archs.add(key)
        if isinstance(spec, dict):
            bf = spec.get("build-for") or []
            if isinstance(bf, str):
                bf = [bf]
            for a in bf:
                if str(a) != "all":
                    archs.add(str(a))
    return sorted(archs)


def yaml_text(sdkcraft):
    return yaml.safe_dump(sdkcraft) if sdkcraft else ""


def datasources(renovate):
    out = []
    for mgr in (renovate or {}).get("customManagers") or []:
        if isinstance(mgr, dict) and mgr.get("datasourceTemplate"):
            out.append(str(mgr["datasourceTemplate"]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-dir", required=True, help="generated SDK repo after the agent run")
    ap.add_argument("--ground-truth", help="parked reference repo tree (overlap metrics only)")
    ap.add_argument("--expectations", required=True, help="calibrated expectations JSON")
    ap.add_argument(
        "--allowed-keys",
        default=os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..", "..", "..", "use-workshop", "tests", "allowed-keys.json",
        ),
        help="shared allowed-keys.json (sdkcraft top-level key allowlist)",
    )
    args = ap.parse_args()

    with open(args.expectations) as fh:
        exp = json.load(fh)
    with open(args.allowed_keys) as fh:
        allowed = set(json.load(fh)["sdkcraft"])

    gen = load_sdk_repo(args.repo_dir)
    gt = load_sdk_repo(args.ground_truth) if args.ground_truth else None

    failures = []
    sc = gen["sdkcraft"] or {}
    text = yaml_text(sc)
    hooks_text = "\n".join(h["text"] for h in gen["hooks"].values())

    # --- The definition itself -------------------------------------------
    if gen["sdkcraft_path"] is None:
        failures.append("sdkcraft.yaml: missing")
    elif gen["sdkcraft_error"]:
        failures.append(f"sdkcraft.yaml: unparseable ({gen['sdkcraft_error']})")
    else:
        bad_keys = sorted(set(sc) - allowed)
        if bad_keys:
            failures.append(f"sdkcraft.yaml: unknown top-level keys {bad_keys}")

        name = str(sc.get("name") or "")
        want_names = exp.get("name_any", [])
        if want_names and name not in want_names:
            failures.append(f"name: expected one of {want_names}, got '{name}'")
        if name in RESERVED_NAMES or name.startswith(RESERVED_PREFIXES):
            failures.append(f"name: '{name}' is reserved")

        # Version wiring: adopt-info + a VERSION read somewhere in the yaml.
        # The VERSION file itself lives on version branches in the reference
        # repos (main is the template branch), so its presence is a metric,
        # not a gate.
        if "adopt-info" not in sc:
            failures.append("version wiring: no adopt-info (hardcoded version?)")
        elif "VERSION" not in text:
            failures.append("version wiring: adopt-info present but nothing reads VERSION")

        parts = sc.get("parts") or {}
        for pname, pbody in parts.items():
            if isinstance(pbody, dict):
                if pbody.get("stage-packages") is not None:
                    failures.append(f"part '{pname}': stage-packages is rejected by sdkcraft")
                if pbody.get("stage-snaps") is not None:
                    failures.append(f"part '{pname}': stage-snaps is rejected by sdkcraft")

        for group in exp.get("part_plugin_groups", []):
            plugins = sorted(
                str(p.get("plugin")) for p in parts.values() if isinstance(p, dict)
            )
            if not any(pl in group["any"] for pl in plugins):
                failures.append(
                    f"parts: no part uses a '{group['name']}' plugin from {group['any']} (got {plugins})"
                )

        gen_ifaces = interfaces(sc)
        iface_kinds = {(side, iface) for side, iface, _ in gen_ifaces}
        for req in exp.get("required_interfaces", []):
            side, iface = req["side"], req["interface"]
            endpoint = req.get("endpoint")
            if endpoint is not None:
                hit = any(
                    s == side and i == iface and e == str(endpoint)
                    for s, i, e in gen_ifaces
                )
                if not hit:
                    failures.append(
                        f"interface: no {side[:-1]} of type '{iface}' with endpoint {endpoint}"
                    )
            elif (side, iface) not in iface_kinds:
                failures.append(f"interface: no {side[:-1]} of type '{iface}'")

        if exp.get("min_platform_archs"):
            archs = platform_archs(sc)
            if len(archs) < exp["min_platform_archs"]:
                failures.append(
                    f"platforms: expected >= {exp['min_platform_archs']} architectures, got {archs}"
                )

    # --- Hooks -----------------------------------------------------------
    unknown_hooks = sorted(set(gen["hooks"]) - HOOK_NAMES)
    if unknown_hooks:
        failures.append(f"hooks: unknown hook names {unknown_hooks}")
    for h in exp.get("required_hooks", []):
        if h not in gen["hooks"]:
            failures.append(f"hooks: required '{h}' missing")

    # --- Repo shape ------------------------------------------------------
    if exp.get("require_service_unit") and not gen["service_units"]:
        failures.append("services: no systemd unit file generated")
    if exp.get("require_spread") and not gen["spread"]:
        failures.append("tests: tests/spread.yaml missing")
    if not gen["readme"]:
        failures.append("README.md: missing")

    if gen["renovate"] is None:
        failures.append("renovate.json: missing")
    elif gen["renovate_error"]:
        failures.append(f"renovate.json: unparseable ({gen['renovate_error']})")
    else:
        ds = datasources(gen["renovate"])
        want_ds = exp.get("datasource_any", [])
        if want_ds and not any(d in want_ds for d in ds):
            failures.append(
                f"renovate: no custom manager with a datasource in {want_ds} (got {ds})"
            )

    min_ci = exp.get("min_ci_workflows", 0)
    if len(gen["ci_workflows"]) < min_ci:
        failures.append(
            f"ci: expected >= {min_ci} workflow files, got {gen['ci_workflows']}"
        )

    for group in exp.get("anywhere_token_groups", []):
        blob = "\n".join([text, hooks_text])
        if not any(tok in blob for tok in group["any"]):
            failures.append(f"none of {group['any']} present for '{group['name']}'")

    # --- Metrics (recorded, never gated) ---------------------------------
    metrics = {
        "sdkcraft_path": gen["sdkcraft_path"],
        "name": (sc.get("name") if sc else None),
        "top_level_keys": sorted(sc) if sc else [],
        "interfaces": sorted(interfaces(sc)) if sc else [],
        "platform_archs": platform_archs(sc) if sc else [],
        "hooks": {h: v["executable"] for h, v in gen["hooks"].items()},
        "service_units": gen["service_units"],
        "version_file_present": gen["version_file"],
        "spread_present": gen["spread"],
        "ci_workflows": gen["ci_workflows"],
        "renovate_datasources": datasources(gen["renovate"]),
    }
    if gt is not None and gt["sdkcraft"]:
        gt_ifaces = interfaces(gt["sdkcraft"])
        gen_ifaces = interfaces(sc) if sc else set()
        metrics["reference_overlap"] = {
            "interfaces_shared": sorted(gt_ifaces & gen_ifaces),
            "interfaces_reference_only": sorted(gt_ifaces - gen_ifaces),
            "interfaces_generated_only": sorted(gen_ifaces - gt_ifaces),
            "hooks_shared": sorted(set(gt["hooks"]) & set(gen["hooks"])),
            "hooks_reference_only": sorted(set(gt["hooks"]) - set(gen["hooks"])),
        }

    print(json.dumps({
        "overall_pass": not failures,
        "failures": failures,
        "expectations_file": args.expectations,
        "metrics": metrics,
    }, indent=2))


if __name__ == "__main__":
    main()
