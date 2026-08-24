#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Thin wrapper: run this suite's agentic E2E tasks via the shared driver in
# ../../_testlib/. Suite configuration lives here; the logic lives there.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVAL_TESTS_DIR="$(cd "${script_dir}/.." && pwd)"
export EVAL_TESTS_DIR

exec bash "${EVAL_TESTS_DIR}/../../_testlib/run-agentic.sh" "$@"
