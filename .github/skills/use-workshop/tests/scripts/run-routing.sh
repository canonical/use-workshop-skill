#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Thin wrapper: run this suite's routing eval via the shared driver in
# ../../_testlib/. Suite configuration lives here; the logic lives there.
#
# Lanes for this suite:
#   default / --subscription — Sonnet via the local claude CLI login, the
#                    gate since 2026-10-19 ($0; promptfooconfig-subscription.yaml)
#   --copilot      — gpt-5.6-sol via the local Copilot login, the cross-vendor
#                    run (same config, premium allowance)
#   --provider ... — any OpenRouter provider declared in promptfooconfig.yaml;
#                    SUSPENDED (no OpenRouter budget), kept runnable

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVAL_TESTS_DIR="$(cd "${script_dir}/.." && pwd)"
export EVAL_TESTS_DIR
export EVAL_DEFAULT_LANE="subscription"
export EVAL_DEFAULT_PROVIDER="openrouter:z-ai/glm-5.2"
export EVAL_HTTP_CONFIG="${EVAL_TESTS_DIR}/promptfooconfig.yaml"
export EVAL_SUBSCRIPTION_CONFIG="${EVAL_TESTS_DIR}/promptfooconfig-subscription.yaml"

exec bash "${EVAL_TESTS_DIR}/../../_testlib/run-routing.sh" "$@"
