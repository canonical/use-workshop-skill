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
SWEEP_SH     := scripts/run-sweep.sh
AGENTIC_SH   := scripts/run-agentic.sh
BUNDLE_SH    := scripts/regenerate-bundle.sh
DOC_PATHS_SH := scripts/check-doc-paths.sh
SOURCE_DOCS_SH := scripts/check-source-docs.sh
YAML_KEYS_PY := scripts/check-yaml-keys.py
MANIFEST_SH  := scripts/update-docs-manifest.sh

.PHONY: help check check-yaml check-yaml-keys check-shell check-doc-paths check-source-docs \
        update-docs-manifest eval-bundle eval-routing eval-routing-all-models \
        eval-routing-openrouter eval-routing-openrouter-all \
        eval-routing-minimax eval-routing-minimax-all \
        eval-routing-kimi-all eval-routing-deepseek-all eval-routing-mimo-all \
        eval-routing-gptoss-all eval-routing-nemotron-all eval-routing-gemma-all \
        eval-routing-llama-all eval-routing-mistral-all \
        eval-agentic eval-all eval-clean

help:
	@echo "use-workshop eval targets:"
	@echo "  check                    all free static checks: doc paths + source-docs + bundle regen + YAML parse + YAML keys + shellcheck (CI entry point)"
	@echo "  check-doc-paths          assert all reference/cli/ doc paths map to the 4 combined pages (fast, no API)"
	@echo "  check-source-docs        assert every cited upstream doc path exists in docs-manifest.txt (offline)"
	@echo "  check-yaml-keys          lint skill YAML snippets/templates against the upstream schema key allowlists (offline)"
	@echo "  update-docs-manifest     regenerate docs-manifest.txt + allowed-keys.json from a Workshop checkout (needs WORKSHOP_REPO; maintainer-only)"
	@echo "  eval-bundle              regenerate skill-bundle.md from current SKILL.md/refs/workflows"
	@echo "  eval-routing             run routing eval against Sonnet 4.6 (default)"
	@echo "  eval-routing-all-models  run routing eval against Sonnet 4.6 + Haiku 4.5 + Opus 4.7"
	@echo "  eval-routing-openrouter         run routing eval against GLM-5 via OpenRouter (needs OPENROUTER_API_KEY)"
	@echo "  eval-routing-openrouter-all     run routing eval against the GLM family (4.7-flash + 5 + 5.2) via OpenRouter"
	@echo "  eval-routing-minimax            run routing eval against MiniMax-M2 via OpenRouter (needs OPENROUTER_API_KEY)"
	@echo "  eval-routing-minimax-all        run routing eval against MiniMax-M1 + MiniMax-M2 + MiniMax-M3 via OpenRouter"
	@echo "  eval-routing-<family>-all       run routing eval across an open-weight family's tiers via OpenRouter;"
	@echo "                                  <family> in {kimi,deepseek,mimo,gptoss,nemotron,gemma,llama,mistral}"
	@echo "  eval-agentic             run agentic E2E suite against Sonnet 4.6 (slow, real LXD)"
	@echo "  eval-all                 routing-all-models + agentic"
	@echo "  eval-clean               remove the generated skill-bundle.md and raw/ outputs"

# All free static checks in one entry point, shared by CI and local runs.
check: check-doc-paths check-source-docs eval-bundle check-yaml check-yaml-keys check-shell
	@test -s skill-bundle.md || { echo "error: skill-bundle.md is empty" >&2; exit 1; }
	@echo "ok: all static checks passed"

check-yaml:
	@python3 -c "import glob, yaml; \
files = sorted(glob.glob('scenarios/*.yaml') + glob.glob('../templates/*.yaml') + glob.glob('agentic/tasks/*.yaml')); \
[yaml.safe_load(open(f)) for f in files]; \
print('ok: %d YAML file(s) parsed' % len(files))"

check-yaml-keys:
	python3 $(YAML_KEYS_PY)

check-shell:
	shellcheck scripts/*.sh

check-doc-paths:
	bash $(DOC_PATHS_SH)

check-source-docs:
	bash $(SOURCE_DOCS_SH)

# Maintainer-only: regenerates the committed docs-manifest.txt and
# allowed-keys.json from a local Workshop checkout. Not part of `check`.
update-docs-manifest:
	bash $(MANIFEST_SH)

eval-bundle:
	bash $(BUNDLE_SH)

eval-routing:
	bash $(ROUTING_SH)

# Multi-tier sweep targets delegate to run-sweep.sh, which CONTINUES past
# assertion failures (exit 1 — diagnostic outcome, remaining tiers still carry
# signal; the sweep re-exits 1 at the end) but ABORTS on run-level errors
# (exit 2 — judge/API/auth/credits; every later tier would hit the same wall).
eval-routing-all-models:
	bash $(SWEEP_SH) --model claude-sonnet-4-6 claude-haiku-4-5 claude-opus-4-7

# OpenRouter (open-weight) routing eval. Requires OPENROUTER_API_KEY.
# GLM tiers mirror the Haiku/Sonnet/Opus diagnostic roles.
eval-routing-openrouter:
	bash $(ROUTING_SH) --provider openrouter:z-ai/glm-5

eval-routing-openrouter-all:
	bash $(SWEEP_SH) --provider openrouter:z-ai/glm-4.7-flash openrouter:z-ai/glm-5 openrouter:z-ai/glm-5.2

# MiniMax (open-weight) routing eval. Requires OPENROUTER_API_KEY.
# Generational trio mirrors the Haiku/Sonnet/Opus diagnostic roles.
eval-routing-minimax:
	bash $(ROUTING_SH) --provider openrouter:minimax/minimax-m2

eval-routing-minimax-all:
	bash $(SWEEP_SH) --provider openrouter:minimax/minimax-m1 openrouter:minimax/minimax-m2 openrouter:minimax/minimax-m3

# Expanded open-weight matrix (one sweep target per family). Requires
# OPENROUTER_API_KEY. Each sweeps small/mid/large tiers.
eval-routing-kimi-all:
	bash $(SWEEP_SH) --provider openrouter:moonshotai/kimi-k2.5 openrouter:moonshotai/kimi-k2.6 openrouter:moonshotai/kimi-k2-thinking

eval-routing-deepseek-all:
	bash $(SWEEP_SH) --provider openrouter:deepseek/deepseek-v4-flash openrouter:deepseek/deepseek-v3.2 openrouter:deepseek/deepseek-r1

eval-routing-mimo-all:
	bash $(SWEEP_SH) --provider openrouter:xiaomi/mimo-v2-flash openrouter:xiaomi/mimo-v2.5 openrouter:xiaomi/mimo-v2.5-pro

eval-routing-gptoss-all:
	bash $(SWEEP_SH) --provider openrouter:openai/gpt-oss-20b openrouter:openai/gpt-oss-120b

eval-routing-nemotron-all:
	bash $(SWEEP_SH) --provider openrouter:nvidia/nemotron-nano-9b-v2 openrouter:nvidia/llama-3.3-nemotron-super-49b-v1.5 openrouter:nvidia/nemotron-3-super-120b-a12b

eval-routing-gemma-all:
	bash $(SWEEP_SH) --provider openrouter:google/gemma-3-4b-it openrouter:google/gemma-3-12b-it openrouter:google/gemma-3-27b-it

eval-routing-llama-all:
	bash $(SWEEP_SH) --provider openrouter:meta-llama/llama-3.1-8b-instruct openrouter:meta-llama/llama-3.3-70b-instruct openrouter:meta-llama/llama-4-maverick

eval-routing-mistral-all:
	bash $(SWEEP_SH) --provider openrouter:mistralai/ministral-3b-2512 openrouter:mistralai/ministral-8b-2512 openrouter:mistralai/mistral-small-3.2-24b-instruct

eval-agentic:
	bash $(AGENTIC_SH)

eval-all: eval-routing-all-models eval-agentic

eval-clean:
	rm -f skill-bundle.md
	rm -rf results/raw
