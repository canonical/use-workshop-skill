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

ROUTING_SH   := scripts/run-routing.sh
AGENTIC_SH   := scripts/run-agentic.sh
BUNDLE_SH    := scripts/regenerate-bundle.sh
DOC_PATHS_SH := scripts/check-doc-paths.sh

.PHONY: help check-doc-paths eval-bundle eval-routing eval-routing-all-models \
        eval-routing-openrouter eval-routing-openrouter-all \
        eval-routing-minimax eval-routing-minimax-all \
        eval-routing-kimi-all eval-routing-deepseek-all eval-routing-mimo-all \
        eval-routing-gptoss-all eval-routing-nemotron-all eval-routing-gemma-all \
        eval-routing-llama-all eval-routing-mistral-all \
        eval-agentic eval-all eval-clean

help:
	@echo "use-workshop eval targets:"
	@echo "  check-doc-paths          assert all reference/cli/ doc paths map to the 4 combined pages (fast, no API)"
	@echo "  eval-bundle              regenerate skill-bundle.md from current SKILL.md/refs/workflows"
	@echo "  eval-routing             run routing eval against Sonnet 4.6 (default)"
	@echo "  eval-routing-all-models  run routing eval against Sonnet 4.6 + Haiku 4.5 + Opus 4.7"
	@echo "  eval-routing-openrouter         run routing eval against GLM-4.5 via OpenRouter (needs OPENROUTER_API_KEY)"
	@echo "  eval-routing-openrouter-all     run routing eval against GLM-4.5-Air + GLM-4.5 + GLM-4.6 via OpenRouter"
	@echo "  eval-routing-minimax            run routing eval against MiniMax-M2 via OpenRouter (needs OPENROUTER_API_KEY)"
	@echo "  eval-routing-minimax-all        run routing eval against MiniMax-M1 + MiniMax-M2 + MiniMax-M3 via OpenRouter"
	@echo "  eval-routing-<family>-all       run routing eval across an open-weight family's tiers via OpenRouter;"
	@echo "                                  <family> in {kimi,deepseek,mimo,gptoss,nemotron,gemma,llama,mistral}"
	@echo "  eval-agentic             run agentic E2E suite against Sonnet 4.6 (slow, real LXD)"
	@echo "  eval-all                 routing-all-models + agentic"
	@echo "  eval-clean               remove the generated skill-bundle.md and raw/ outputs"

check-doc-paths:
	bash $(DOC_PATHS_SH)

eval-bundle:
	bash $(BUNDLE_SH)

eval-routing:
	bash $(ROUTING_SH)

# Multi-tier sweep targets run EVERY tier even when one fails. run-routing.sh
# exits non-zero on assertion failures (so single-tier runs surface regressions),
# which would otherwise make `make` abort the sweep after the first tier. The loop
# keeps going, then re-exits non-zero if any tier failed so the signal isn't lost.
eval-routing-all-models:
	@rc=0; for m in claude-sonnet-4-6 claude-haiku-4-5 claude-opus-4-7; do \
		bash $(ROUTING_SH) --model $$m || rc=$$?; \
	done; exit $$rc

# OpenRouter (open-weight) routing eval. Requires OPENROUTER_API_KEY.
# GLM tiers mirror the Haiku/Sonnet/Opus diagnostic roles.
eval-routing-openrouter:
	bash $(ROUTING_SH) --provider openrouter:z-ai/glm-4.5

eval-routing-openrouter-all:
	@rc=0; for p in z-ai/glm-4.5-air z-ai/glm-4.5 z-ai/glm-4.6; do \
		bash $(ROUTING_SH) --provider openrouter:$$p || rc=$$?; \
	done; exit $$rc

# MiniMax (open-weight) routing eval. Requires OPENROUTER_API_KEY.
# Generational trio mirrors the Haiku/Sonnet/Opus diagnostic roles.
eval-routing-minimax:
	bash $(ROUTING_SH) --provider openrouter:minimax/minimax-m2

eval-routing-minimax-all:
	@rc=0; for p in minimax/minimax-m1 minimax/minimax-m2 minimax/minimax-m3; do \
		bash $(ROUTING_SH) --provider openrouter:$$p || rc=$$?; \
	done; exit $$rc

# Expanded open-weight matrix (one sweep target per family). Requires
# OPENROUTER_API_KEY. Each sweeps small/mid/large tiers via the loop pattern.
eval-routing-kimi-all:
	@rc=0; for p in moonshotai/kimi-k2.5 moonshotai/kimi-k2.6 moonshotai/kimi-k2-thinking; do \
		bash $(ROUTING_SH) --provider openrouter:$$p || rc=$$?; \
	done; exit $$rc

eval-routing-deepseek-all:
	@rc=0; for p in deepseek/deepseek-v4-flash deepseek/deepseek-v3.2 deepseek/deepseek-r1; do \
		bash $(ROUTING_SH) --provider openrouter:$$p || rc=$$?; \
	done; exit $$rc

eval-routing-mimo-all:
	@rc=0; for p in xiaomi/mimo-v2-flash xiaomi/mimo-v2.5 xiaomi/mimo-v2.5-pro; do \
		bash $(ROUTING_SH) --provider openrouter:$$p || rc=$$?; \
	done; exit $$rc

eval-routing-gptoss-all:
	@rc=0; for p in openai/gpt-oss-20b openai/gpt-oss-120b; do \
		bash $(ROUTING_SH) --provider openrouter:$$p || rc=$$?; \
	done; exit $$rc

eval-routing-nemotron-all:
	@rc=0; for p in nvidia/nemotron-nano-9b-v2 nvidia/llama-3.3-nemotron-super-49b-v1.5 nvidia/nemotron-3-super-120b-a12b; do \
		bash $(ROUTING_SH) --provider openrouter:$$p || rc=$$?; \
	done; exit $$rc

eval-routing-gemma-all:
	@rc=0; for p in google/gemma-3-4b-it google/gemma-3-12b-it google/gemma-3-27b-it; do \
		bash $(ROUTING_SH) --provider openrouter:$$p || rc=$$?; \
	done; exit $$rc

eval-routing-llama-all:
	@rc=0; for p in meta-llama/llama-3.1-8b-instruct meta-llama/llama-3.3-70b-instruct meta-llama/llama-4-maverick; do \
		bash $(ROUTING_SH) --provider openrouter:$$p || rc=$$?; \
	done; exit $$rc

eval-routing-mistral-all:
	@rc=0; for p in mistralai/ministral-3b-2512 mistralai/ministral-8b-2512 mistralai/mistral-small-3.2-24b-instruct; do \
		bash $(ROUTING_SH) --provider openrouter:$$p || rc=$$?; \
	done; exit $$rc

eval-agentic:
	bash $(AGENTIC_SH)

eval-all: eval-routing-all-models eval-agentic

eval-clean:
	rm -f skill-bundle.md
	rm -rf results/raw
