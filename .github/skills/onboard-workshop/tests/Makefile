# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.

# Convenience targets for the onboard-workshop eval suite.
#
# Mirrors the use-workshop tests/Makefile contract: `make check` is the free
# CI entry point; eval-* targets cost API spend and are manual. Two shared
# artifacts are read from the SIBLING suite (one regeneration keeps both
# skills honest): ../use-workshop/tests/docs-manifest.txt and
# allowed-keys.json. There is no check-doc-paths here — the shared manifest
# only contains the four combined CLI pages, so check-source-docs already
# rejects per-subcommand CLI paths.

SHELL := /usr/bin/env bash

TESTLIB           := ../../_testlib
ROUTING_SH        := scripts/run-routing.sh
BUNDLE_SH         := scripts/regenerate-bundle.sh
SOURCE_DOCS_SH    := $(TESTLIB)/check-source-docs.sh
YAML_KEYS_PY      := $(TESTLIB)/check-yaml-keys.py
CATALOG_SH        := scripts/update-sdk-catalog.sh
RECONSTRUCTION_SH := reconstruction/run-reconstruction.sh
SIBLING_TESTS     := ../../use-workshop/tests

.PHONY: help check check-yaml check-yaml-keys check-shell check-source-docs \
        check-catalog-stamp check-hooks-exec eval-bundle eval-routing \
        eval-agentic eval-reconstruction eval-reconstruction-full \
        update-sdk-catalog eval-clean

help:
	@echo "onboard-workshop eval targets:"
	@echo "  check                     all free static checks (CI entry point)"
	@echo "  check-source-docs         cited doc paths exist in the SHARED docs-manifest.txt (offline)"
	@echo "  check-yaml-keys           YAML snippets/templates against the SHARED schema allowlists (offline)"
	@echo "  check-catalog-stamp       sdk-catalog.md markers + generation stamp intact (offline)"
	@echo "  check-hooks-exec          template hook stubs carry the executable bit (offline)"
	@echo "  eval-bundle               regenerate skill-bundle.md + skill-selection-context.md"
	@echo "  eval-routing              routing eval vs Sonnet 4.6 (paid; needs ANTHROPIC_API_KEY + OPENAI_API_KEY judge)"
	@echo "  eval-agentic              agentic E2E tasks (slow, real LXD; \$$0 on the claude CLI subscription login)"
	@echo "  eval-reconstruction       guinea-pig reconstruction, offline tier (paid ~\$$1-2/repo; needs sibling checkouts)"
	@echo "  eval-reconstruction-full  reconstruction incl. LXD launch + action proof (slow, manual)"
	@echo "  update-sdk-catalog        maintainer-only: refresh references/sdk-catalog.md stamp + show sources"
	@echo "  eval-clean                remove generated bundles and raw outputs"

# All free static checks in one entry point, shared by CI and local runs.
check: check-source-docs eval-bundle check-yaml check-yaml-keys check-shell \
       check-catalog-stamp check-hooks-exec
	@test -s skill-bundle.md || { echo "error: skill-bundle.md is empty" >&2; exit 1; }
	@echo "ok: all static checks passed"

check-yaml:
	@python3 -c "import glob, yaml; \
files = sorted(glob.glob('scenarios/*.yaml') + glob.glob('../templates/**/*.yaml', recursive=True) + glob.glob('agentic/tasks/*.yaml')); \
[yaml.safe_load(open(f)) for f in files]; \
print('ok: %d YAML file(s) parsed' % len(files))"

check-yaml-keys:
	python3 $(YAML_KEYS_PY) --skill-root $(CURDIR)/.. --allowed-keys $(CURDIR)/$(SIBLING_TESTS)/allowed-keys.json --templates-recursive --classify-sdk-template

check-shell:
	shellcheck scripts/*.sh reconstruction/*.sh $(TESTLIB)/*.sh

check-source-docs:
	bash $(SOURCE_DOCS_SH) --skill-root $(CURDIR)/.. --manifest $(CURDIR)/$(SIBLING_TESTS)/docs-manifest.txt

# The catalog table is curated; this guards its machine-readable envelope.
check-catalog-stamp:
	@grep -q '<!-- catalog:start -->' ../references/sdk-catalog.md && \
	 grep -q '<!-- catalog:end -->' ../references/sdk-catalog.md && \
	 grep -q '^Generated from canonical/reference-sdks @ ' ../references/sdk-catalog.md \
	 || { echo "error: sdk-catalog.md markers or stamp line missing" >&2; exit 1; }
	@echo "ok: sdk-catalog.md markers and stamp intact"

# Hooks that lose their executable bit fail at launch time, confusingly.
check-hooks-exec:
	@bad=0; for f in ../templates/in-project-sdk/hooks/*; do \
	  [ -x "$$f" ] || { echo "error: $$f is not executable" >&2; bad=1; }; \
	done; [ $$bad -eq 0 ]
	@echo "ok: template hook stubs are executable"

eval-bundle:
	bash $(BUNDLE_SH)

eval-routing:
	bash $(ROUTING_SH)

eval-agentic:
	bash scripts/run-agentic.sh

eval-reconstruction:
	bash $(RECONSTRUCTION_SH)

eval-reconstruction-full:
	bash $(RECONSTRUCTION_SH) --tier full

# Maintainer-only; not part of `check`.
update-sdk-catalog:
	bash $(CATALOG_SH)

eval-clean:
	rm -f skill-bundle.md skill-selection-context.md
	rm -rf results/raw
