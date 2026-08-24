# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.

# Convenience targets for the design-sdk eval suite.
#
# Mirrors the sibling suites' contract: `make check` is the free CI entry
# point; eval-* targets are manual. Two shared artifacts are read from the
# use-workshop suite (one regeneration keeps all skills honest):
# ../use-workshop/tests/docs-manifest.txt and allowed-keys.json. This suite
# passes --classify-sdkcraft-template so sdkcraft.yaml templates and
# path-commented fenced blocks are checked against the schema's sdkcraft
# key list, and GitHub Actions / spread files are parse-only kinds.

SHELL := /usr/bin/env bash

TESTLIB           := ../../_testlib
ROUTING_SH        := scripts/run-routing.sh
BUNDLE_SH         := scripts/regenerate-bundle.sh
SOURCE_DOCS_SH    := $(TESTLIB)/check-source-docs.sh
YAML_KEYS_PY      := $(TESTLIB)/check-yaml-keys.py
RECONSTRUCTION_SH := reconstruction/run-sdk-reconstruction.sh
SIBLING_TESTS     := ../../use-workshop/tests

.PHONY: help check check-yaml check-yaml-keys check-shell check-source-docs \
        check-hooks-exec eval-bundle eval-routing eval-agentic \
        eval-reconstruction eval-clean eval-clean-all

help:
	@echo "design-sdk eval targets:"
	@echo "  check                all free static checks (CI entry point)"
	@echo "  check-source-docs    cited doc paths exist in the SHARED docs-manifest.txt (offline)"
	@echo "  check-yaml-keys      YAML snippets/templates against the SHARED schema allowlists (offline)"
	@echo "  check-hooks-exec     template hooks carry the executable bit — HARD failure here: sdkcraft"
	@echo "                       packs hooks for the Store, where +x is enforced at pack time (offline)"
	@echo "  eval-bundle          regenerate skill-bundle.md + skill-selection-context.md"
	@echo "  eval-routing         routing eval vs Sonnet 4.6 via the local claude CLI login + local judge (\$$0, no keys; slow)"
	@echo "  eval-agentic         agentic E2E tasks (slow; \$$0 on the claude CLI subscription login; heaviest task uses real LXD)"
	@echo "  eval-reconstruction  one-off SDK-reconstruction round vs local reference-SDK clones (\$$0 on the subscription login; not in CI)"
	@echo "  eval-clean           remove generated bundles and raw outputs"
	@echo "  eval-clean-all       eval-clean + reconstruction .work/ (safe; everything regenerates)"

# All free static checks in one entry point, shared by CI and local runs.
check: check-source-docs eval-bundle check-yaml check-yaml-keys check-shell \
       check-hooks-exec
	@test -s skill-bundle.md || { echo "error: skill-bundle.md is empty" >&2; exit 1; }
	@echo "ok: all static checks passed"

# Templates include .yml (GitHub Actions workflows) and workshop.yaml.in
# (spread's envsubst input) alongside .yaml — all must at least parse.
check-yaml:
	@python3 -c "import glob, yaml; \
files = sorted(glob.glob('scenarios/*.yaml') + glob.glob('../templates/**/*.yaml', recursive=True) + glob.glob('../templates/**/*.yml', recursive=True) + glob.glob('../templates/**/*.yaml.in', recursive=True) + glob.glob('agentic/tasks/*.yaml')); \
[yaml.safe_load(open(f)) for f in files]; \
print('ok: %d YAML file(s) parsed' % len(files))"

check-yaml-keys:
	python3 $(YAML_KEYS_PY) --skill-root $(CURDIR)/.. --allowed-keys $(CURDIR)/$(SIBLING_TESTS)/allowed-keys.json --templates-recursive --classify-sdkcraft-template

check-shell:
	shellcheck scripts/*.sh $(wildcard reconstruction/*.sh) $(TESTLIB)/*.sh

check-source-docs:
	bash $(SOURCE_DOCS_SH) --skill-root $(CURDIR)/.. --manifest $(CURDIR)/$(SIBLING_TESTS)/docs-manifest.txt

# HARD failure, unlike onboard-workshop's advisory check: these hooks are
# templates for sdkcraft-PACKED SDKs, where the executable bit is enforced
# at pack time (a 0644 hook fails the pack, not just house style).
check-hooks-exec:
	@fail=0; for f in ../templates/hooks/*; do \
	  [ -x "$$f" ] || { echo "error: $$f is not executable (sdkcraft pack enforces +x)" >&2; fail=1; }; \
	done; exit $$fail
	@echo "ok: template hook exec bits present"

eval-bundle:
	bash $(BUNDLE_SH)

eval-routing:
	bash $(ROUTING_SH)

eval-agentic:
	bash scripts/run-agentic.sh

eval-reconstruction:
	bash $(RECONSTRUCTION_SH)

eval-clean:
	rm -f skill-bundle.md skill-selection-context.md
	rm -rf results/raw

# Also drops the reconstruction staging dirs (safe — everything regenerates;
# ground truth is read from the local reference-SDK clones in place).
eval-clean-all: eval-clean
	rm -rf reconstruction/.work
