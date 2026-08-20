#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Thin wrapper: run this suite's routing eval via the shared driver in
# ../../_testlib/. Suite configuration lives here; the logic lives there.
#
# This suite's routing gate IS the subscription lane: Sonnet 4.6 as the
# candidate via the local claude CLI login, the local claude judge for
# llm-rubric grading — $0, no API keys. (The 2026-08-13 GLM-5.2 diagnostic
# measured 50/53 and the OpenRouter migration was rejected — see BASELINE.md;
# the Anthropic+OpenAI API path this replaced cost ~$4/run and two keys.)
# There is no HTTP lane here.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVAL_TESTS_DIR="$(cd "${script_dir}/.." && pwd)"
export EVAL_TESTS_DIR
export EVAL_DEFAULT_LANE="subscription"
export EVAL_HTTP_CONFIG=""
export EVAL_SUBSCRIPTION_CONFIG="${EVAL_TESTS_DIR}/promptfooconfig.yaml"

exec bash "${EVAL_TESTS_DIR}/../../_testlib/run-routing.sh" "$@"
