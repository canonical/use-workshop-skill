#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
"""Deterministic scorecard: generated workshop definition vs ground truth.

Called by provider-onboard-cli.js after the agent run. Parses every
definition file in the sandboxed repo (root workshop.yaml/.workshop.yaml,
.workshop/*.yaml, in-project .workshop/*/sdk.yaml + hooks) and the parked
ground truth, computes structure-aware metrics, and — when an expectations
file for the repo exists under expectations/ — a pass/fail verdict against
the recorded thresholds. Output: one JSON object on stdout. Exit 0 always
(the verdict lives in the JSON; the caller asserts on it), non-zero only on
harness misuse.

Metrics are functional, not textual: an action named docs-build wrapping
`make -C docs/ html` matches a ground-truth docs-html action via shared
command tokens; SDK channels compare by track only.
"""

import argparse
import glob
import json
import os
import sys

import yaml

# The only file names Workshop treats as hooks; anything else under hooks/ is
# data those hooks read.
HOOK_NAMES = {
    "setup-base",
    "setup-project",
    "check-health",
    "save-state",
    "restore-state",
}


def load_definitions(root):
    """Return (defs, sdk_yamls, hooks) found under a repo-like tree."""
    defs = {}
    sdk_yamls = {}
    hooks = {}
    for cand in ("workshop.yaml", ".workshop.yaml"):
        p = os.path.join(root, cand)
        if os.path.isfile(p):
            defs[cand] = safe_yaml(p)
    wsdir = os.path.join(root, ".workshop")
    if os.path.isdir(wsdir):
        for p in sorted(glob.glob(os.path.join(wsdir, "*.yaml"))):
            defs[os.path.relpath(p, root)] = safe_yaml(p)
        for sdkdir in sorted(glob.glob(os.path.join(wsdir, "*", ""))):
            sy = os.path.join(sdkdir, "sdk.yaml")
            if os.path.isfile(sy):
                sdk_yamls[os.path.relpath(sy, root)] = safe_yaml(sy)
            hdir = os.path.join(sdkdir, "hooks")
            if os.path.isdir(hdir):
                for h in sorted(os.listdir(hdir)):
                    hp = os.path.join(hdir, h)
                    if os.path.isfile(hp):
                        hooks[os.path.relpath(hp, root)] = {
                            "executable": os.access(hp, os.X_OK),
                            "text": read_text(hp),
                        }
    return defs, sdk_yamls, hooks


def safe_yaml(path):
    try:
        with open(path) as fh:
            data = yaml.safe_load(fh)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def read_text(path):
    try:
        with open(path, errors="replace") as fh:
            return fh.read()
    except Exception:
        return ""


def store_sdks(definition):
    """name -> channel for Store SDKs (skips system/project-/try- entries)."""
    out = {}
    for entry in definition.get("sdks") or []:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "")
        if not name or name == "system" or name.startswith(("project-", "try-")):
            continue
        out[name] = str(entry.get("channel") or "")
    return out


def has_in_project(definition):
    return any(
        isinstance(e, dict) and str(e.get("name") or "").startswith("project-")
        for e in definition.get("sdks") or []
    )


def track(channel):
    return str(channel).split("/", 1)[0].strip('"')


def all_yaml_text(defs, sdk_yamls):
    return "\n".join(
        yaml.safe_dump(d) for d in list(defs.values()) + list(sdk_yamls.values()) if d
    )


def actions_text(defs):
    chunks = []
    for d in defs.values():
        for name, body in (d.get("actions") or {}).items():
            chunks.append(f"{name}\n{body}")
    return "\n".join(chunks)


def interface_endpoints(defs, sdk_yamls, interface):
    """Collect endpoint strings for plugs/slots of a given interface."""
    found = {"plugs": [], "slots": []}

    def scan(container, side):
        for _, spec in (container or {}).items():
            if isinstance(spec, dict) and spec.get("interface") == interface:
                found[side].append(str(spec.get("endpoint", "")))

    for d in list(defs.values()) + list(sdk_yamls.values()):
        scan(d.get("plugs"), "plugs")
        scan(d.get("slots"), "slots")
        for entry in d.get("sdks") or []:
            if isinstance(entry, dict):
                scan(entry.get("plugs"), "plugs")
                scan(entry.get("slots"), "slots")
    return found


def has_interface(defs, sdk_yamls, interface):
    text = all_yaml_text(defs, sdk_yamls)
    return f"interface: {interface}" in text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-dir", required=True, help="sandboxed repo after the agent run")
    ap.add_argument("--ground-truth", required=True, help="parked original definition tree")
    ap.add_argument("--expectations", help="expectations JSON for this repo (optional)")
    args = ap.parse_args()

    gen_defs, gen_sdk_yamls, gen_hooks = load_definitions(args.repo_dir)
    gt_defs, gt_sdk_yamls, _ = load_definitions(args.ground_truth)

    if not gt_defs:
        sys.exit("error: no ground-truth definition found under " + args.ground_truth)

    # Single primary definition each side: prefer a file that actually looks
    # like a workshop definition (has `base:`) — agents sometimes leave stray
    # YAML under .workshop/, and alphabetical-first would mis-pick it.
    def primary(defs):
        for d in defs.values():
            if isinstance(d, dict) and d.get("base"):
                return d
        return next(iter(defs.values())) if defs else {}

    gt_primary = primary(gt_defs)
    gen_primary = primary(gen_defs)

    gt_store = store_sdks(gt_primary)
    gen_store = store_sdks(gen_primary)
    shared = sorted(set(gt_store) & set(gen_store))

    def definition_names(defs):
        return sorted(
            str(d.get("name")) for d in defs.values()
            if isinstance(d, dict) and d.get("name")
        )

    metrics = {
        "generated_definitions": sorted(gen_defs),
        "ground_truth_definitions": sorted(gt_defs),
        # Naming is scored by hand in the comparison report, not gated here:
        # offline runs let the skill pick the name, so a divergence from the
        # maintainers' `dev` / `store-jammy` is a data point, not a failure.
        "generated_names": definition_names(gen_defs),
        "ground_truth_names": definition_names(gt_defs),
        "base_match": bool(gen_defs) and gen_primary.get("base") == gt_primary.get("base"),
        "generated_base": gen_primary.get("base"),
        "ground_truth_base": gt_primary.get("base"),
        "sdk_recall": (len(shared) / len(gt_store)) if gt_store else 1.0,
        "sdk_precision": (len(shared) / len(gen_store)) if gen_store else (1.0 if not gt_store else 0.0),
        "missing_sdks": sorted(set(gt_store) - set(gen_store)),
        "extra_sdks": sorted(set(gen_store) - set(gt_store)),
        "channel_track_match": {
            n: track(gen_store[n]) == track(gt_store[n]) for n in shared if gt_store[n]
        },
        "in_project_sdk": {
            "ground_truth": has_in_project(gt_primary),
            "generated": has_in_project(gen_primary),
            "generated_sdk_yamls": sorted(gen_sdk_yamls),
            "generated_hooks": {
                p: h["executable"] for p, h in gen_hooks.items()
            },
        },
        "gitignore_lock": ".workshop.lock" in read_text(os.path.join(args.repo_dir, ".gitignore")),
    }

    failures = []
    exp = None
    if args.expectations and os.path.isfile(args.expectations):
        with open(args.expectations) as fh:
            exp = json.load(fh)

    if exp:
        # `base` may be a single string or a list of acceptable values: the
        # LTS-vs-current call is a judgment the evidence rarely settles.
        want_base = exp.get("base")
        if want_base:
            allowed = want_base if isinstance(want_base, list) else [want_base]
            if metrics["generated_base"] not in allowed:
                failures.append(
                    f"base: expected one of {allowed}, got {metrics['generated_base']}"
                )

        min_defs = exp.get("min_definitions")
        if min_defs and len(gen_defs) < min_defs:
            failures.append(
                f"definitions: expected at least {min_defs}, got {len(gen_defs)} ({sorted(gen_defs)})"
            )

        for req in exp.get("required_sdks", []):
            name, want_track = req["name"], req.get("track")
            if name not in gen_store:
                failures.append(f"sdk: required '{name}' missing")
            elif want_track and track(gen_store[name]) != want_track:
                failures.append(
                    f"sdk: '{name}' channel track expected {want_track}, got '{gen_store[name]}'"
                )

        if exp.get("in_project_sdk_required") and not metrics["in_project_sdk"]["generated"]:
            failures.append("in-project SDK: required but none generated")
        if metrics["in_project_sdk"]["generated"]:
            # Advisory by default. Workshop runs hooks as bash scripts rather
            # than exec'ing them, so an in-project hook at 0644 still runs —
            # mir, subiquity and creusot all ship theirs that way. The bit is
            # house style (and a real requirement only for sdkcraft-packed
            # SDKs), so it is recorded, not gated, unless a repo opts in.
            # Only the five real hooks are considered either way: a hooks/ dir
            # may also hold data files the hooks read (packages.list,
            # snaps.list), which are legitimately 0644.
            bad = [
                p for p, ok in metrics["in_project_sdk"]["generated_hooks"].items()
                if not ok and os.path.basename(p) in HOOK_NAMES
            ]
            metrics["in_project_sdk"]["hooks_not_executable"] = bad
            if bad and exp.get("hooks_executable_required"):
                failures.append(f"hooks not executable: {bad}")

        # Advisory tunnels: recorded, never gated. For a repo whose port map
        # lives only in the hidden ground truth (services cloned on demand),
        # demanding the ports would score information the sandbox never had.
        advisory = bool(exp.get("tunnels_advisory"))
        eps_all = interface_endpoints(gen_defs, gen_sdk_yamls, "tunnel")
        metrics["tunnel_endpoints_generated"] = eps_all
        for port in exp.get("tunnel_endpoints", []):
            # The workshop-side SLOT must expose the service's real port; the
            # host-side PLUG may be remapped (e.g. 8000→8001 when the host
            # port is taken), so any tunnel plug counts as the pair's host end.
            slot_hit = any(port in e for e in eps_all["slots"])
            plug_hit = bool(eps_all["plugs"])
            metrics.setdefault("tunnels", {})[port] = {
                "slot": slot_hit,
                "host_plug_present": plug_hit,
                "advisory": advisory,
            }
            if not (slot_hit and plug_hit) and not advisory:
                failures.append(
                    f"tunnel: no slot with endpoint {port} paired with a host-side plug"
                )

        if exp.get("desktop_plug_required") and not has_interface(gen_defs, gen_sdk_yamls, "desktop"):
            failures.append("desktop interface: required but absent")

        # Generic interface presence. `interfaces_required` gates;
        # `interfaces_advisory` only records — use the latter where the
        # construct is a judgement call the scrubbed tree doesn't force.
        for iface in exp.get("interfaces_required", []):
            present = has_interface(gen_defs, gen_sdk_yamls, iface)
            metrics.setdefault("interfaces", {})[iface] = present
            if not present:
                failures.append(f"interface '{iface}': required but absent")
        for iface in exp.get("interfaces_advisory", []):
            metrics.setdefault("interfaces", {})[iface] = has_interface(
                gen_defs, gen_sdk_yamls, iface
            )

        gen_actions = actions_text(gen_defs)
        hook_text = "\n".join(h["text"] for h in gen_hooks.values())
        satisfied = []
        for group in exp.get("action_token_groups", []):
            if any(tok in gen_actions for tok in group["any"]):
                satisfied.append(group["name"])
        metrics["action_groups_satisfied"] = satisfied
        need = exp.get("min_action_groups", len(exp.get("action_token_groups", [])))
        if len(satisfied) < need:
            failures.append(
                f"actions: {len(satisfied)}/{need} required token groups satisfied ({satisfied})"
            )

        gen_all_text = "\n".join(
            [gen_actions, hook_text, all_yaml_text(gen_defs, gen_sdk_yamls)]
        )
        for tok in exp.get("anywhere_tokens", []):
            if tok not in gen_all_text:
                failures.append(f"token '{tok}' absent from generated actions/hooks/yaml")

        # Any-of variant: a repo's entry point may legitimately be reached by
        # more than one route (wrapping `make install_deps` wholesale, or
        # decomposing it into its apt half and its git half across two hooks).
        # Demanding one literal spelling scores phrasing, not capability.
        satisfied_groups = []
        for group in exp.get("anywhere_token_groups", []):
            if any(tok in gen_all_text for tok in group["any"]):
                satisfied_groups.append(group["name"])
            else:
                failures.append(
                    f"none of {group['any']} present for '{group['name']}'"
                )
        metrics["anywhere_groups_satisfied"] = satisfied_groups

        if exp.get("gitignore_lock") and not metrics["gitignore_lock"]:
            failures.append(".gitignore does not cover .workshop.lock")

        overall = not failures
    else:
        overall = None  # no thresholds recorded for this repo; rubric-only

    print(json.dumps({
        "overall_pass": overall,
        "failures": failures,
        "expectations_file": args.expectations if exp else None,
        "metrics": metrics,
    }, indent=2))


if __name__ == "__main__":
    main()
