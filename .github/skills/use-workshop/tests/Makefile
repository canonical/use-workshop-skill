# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.

# Convenience targets for the use-workshop eval suite.
#
# All targets delegate to the shell scripts under scripts/ so the underlying
# behaviour is identical whether you run `make eval-routing` or
# `bash scripts/run-routing.sh`. The scripts handle the bundle regen, env
# bridging (ANTHROPIC_API_TOKEN -> ANTHROPIC_API_KEY), and slim-summary
# post-processing.

SHELL := /usr/bin/env bash

ROUTING_SH := scripts/run-routing.sh
AGENTIC_SH := scripts/run-agentic.sh
BUNDLE_SH  := scripts/regenerate-bundle.sh

.PHONY: help eval-bundle eval-routing eval-routing-all-models \
        eval-agentic eval-all eval-clean

help:
	@echo "use-workshop eval targets:"
	@echo "  eval-bundle              regenerate skill-bundle.md from current SKILL.md/refs/workflows"
	@echo "  eval-routing             run routing eval against Sonnet 4.6 (default)"
	@echo "  eval-routing-all-models  run routing eval against Sonnet 4.6 + Haiku 4.5 + Opus 4.7"
	@echo "  eval-agentic             run agentic E2E suite against Sonnet 4.6 (slow, real LXD)"
	@echo "  eval-all                 routing-all-models + agentic"
	@echo "  eval-clean               remove the generated skill-bundle.md and raw/ outputs"

eval-bundle:
	bash $(BUNDLE_SH)

eval-routing:
	bash $(ROUTING_SH)

eval-routing-all-models:
	bash $(ROUTING_SH) --model claude-sonnet-4-6
	bash $(ROUTING_SH) --model claude-haiku-4-5
	bash $(ROUTING_SH) --model claude-opus-4-7

eval-agentic:
	bash $(AGENTIC_SH)

eval-all: eval-routing-all-models eval-agentic

eval-clean:
	rm -f skill-bundle.md
	rm -rf results/raw
