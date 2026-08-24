#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Thin wrapper: run this suite's routing eval via the shared driver in
# ../../_testlib/. Suite configuration lives here; the logic lives there.
#
# This suite's routing gate IS the subscription lane from day one: Sonnet
# 4.6 as the candidate via the local claude CLI login, the local claude
# judge for llm-rubric grading — $0, no API keys, the same pair as the
# sibling gates so rates stay comparable across suites. There is no HTTP
# lane here.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVAL_TESTS_DIR="$(cd "${script_dir}/.." && pwd)"
export EVAL_TESTS_DIR
export EVAL_DEFAULT_LANE="subscription"
export EVAL_HTTP_CONFIG=""
export EVAL_SUBSCRIPTION_CONFIG="${EVAL_TESTS_DIR}/promptfooconfig.yaml"

exec bash "${EVAL_TESTS_DIR}/../../_testlib/run-routing.sh" "$@"
