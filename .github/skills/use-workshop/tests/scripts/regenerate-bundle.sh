#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.
#
# Thin wrapper: regenerate this suite's skill-bundle.md via the shared
# implementation in ../../_testlib/. Suite-specific configuration lives here;
# the logic lives there.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_root="$(cd "${script_dir}/../.." && pwd)"

exec bash "${skill_root}/../_testlib/regenerate-bundle.sh" --skill-root "${skill_root}" "$@"
