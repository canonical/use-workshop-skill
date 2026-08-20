#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Thin wrapper: run this suite's agentic E2E tasks via the shared driver in
# ../../_testlib/. Fixes the historical gap where this suite had no wrapper
# at all (`make eval-agentic` ran promptfoo raw, which is why its config
# needed a five-levels repo_root hack).

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVAL_TESTS_DIR="$(cd "${script_dir}/.." && pwd)"
export EVAL_TESTS_DIR

exec bash "${EVAL_TESTS_DIR}/../../_testlib/run-agentic.sh" "$@"
