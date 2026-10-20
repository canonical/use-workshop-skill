# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.

# Convenience targets for the use-workshop eval suite.
#
# All targets delegate to the shell scripts under scripts/ so the underlying
# behaviour is identical whether you run `make eval-routing` or
# `bash scripts/run-routing.sh`. The scripts handle the bundle regen and
# slim-summary post-processing. See TESTING.md at the repo root for the
# lane doctrine (what runs when, and what each lane costs).

SHELL := /usr/bin/env bash

TESTLIB      := ../../_testlib
ROUTING_SH   := scripts/run-routing.sh
SWEEP_SH     := scripts/run-sweep.sh
AGENTIC_SH   := scripts/run-agentic.sh
BUNDLE_SH    := scripts/regenerate-bundle.sh
SOURCE_DOCS_SH := $(TESTLIB)/check-source-docs.sh
YAML_KEYS_PY := $(TESTLIB)/check-yaml-keys.py
SCENARIOS_PY := $(TESTLIB)/check-scenarios.py
MANIFEST_SH  := scripts/update-docs-manifest.sh
REPO_ROOT    := ../../../..

.PHONY: help check check-yaml check-yaml-keys check-scenarios check-shell check-source-docs \
        update-docs-manifest eval-deps eval-bundle eval-routing eval-routing-subscription \
        eval-routing-copilot eval-routing-glm eval-routing-sweep eval-agentic eval-clean

help:
	@echo "use-workshop eval targets:"
	@echo "  check                    all free static checks: source-docs + bundle regen + YAML parse + YAML keys + shellcheck (CI entry point)"
	@echo "  check-source-docs        assert every cited upstream doc path exists in docs-manifest.txt (offline; subsumes the retired check-doc-paths)"
	@echo "  check-scenarios          assert every scenarios/*.yaml is registered in every promptfooconfig*.yaml (offline)"
	@echo "  check-yaml-keys          lint skill YAML snippets/templates against the upstream schema key allowlists (offline)"
	@echo "  update-docs-manifest     regenerate docs-manifest.txt + allowed-keys.json from a Workshop checkout (needs WORKSHOP_REPO; maintainer-only)"
	@echo "  eval-deps                install the Copilot lane's npm dependency (repo-root package.json; once per checkout)"
	@echo "  eval-bundle              regenerate skill-bundle.md from current SKILL.md/refs/workflows"
	@echo "  eval-routing             the routing gate: Sonnet via the local claude CLI login + local judge (\$$0, no keys)"
	@echo "  eval-routing-subscription  alias of eval-routing"
	@echo "  eval-routing-copilot     cross-vendor run: gpt-6.1-sol via the local Copilot login + local claude judge (premium allowance)"
	@echo "  eval-routing-glm         SUSPENDED former gate: GLM-5.2 via OpenRouter (needs OPENROUTER_API_KEY)"
	@echo "  eval-routing-sweep       SUSPENDED diagnostic sweep over the OpenRouter tiers (needs OPENROUTER_API_KEY)"
	@echo "  eval-agentic             run agentic E2E suite (slow, real LXD)"
	@echo "  eval-clean               remove the generated skill-bundle.md and raw/ outputs"

# All free static checks in one entry point, shared by CI and local runs.
# (check-doc-paths was retired 2026-08-20: the shared manifest contains only
# the four combined CLI pages, so check-source-docs already rejects any other
# reference/cli/ path — the onboard suite reasoned this out first.)
check: check-source-docs eval-bundle check-yaml check-yaml-keys check-scenarios check-shell
	@test -s skill-bundle.md || { echo "error: skill-bundle.md is empty" >&2; exit 1; }
	@echo "ok: all static checks passed"

check-yaml:
	@python3 -c "import glob, yaml; \
files = sorted(glob.glob('scenarios/*.yaml') + glob.glob('../templates/*.yaml') + glob.glob('agentic/tasks/*.yaml')); \
[yaml.safe_load(open(f)) for f in files]; \
print('ok: %d YAML file(s) parsed' % len(files))"

check-scenarios:
	python3 $(SCENARIOS_PY) --tests-dir $(CURDIR)

check-yaml-keys:
	python3 $(YAML_KEYS_PY) --skill-root $(CURDIR)/.. --allowed-keys $(CURDIR)/allowed-keys.json

check-shell:
	shellcheck scripts/*.sh $(TESTLIB)/*.sh

check-source-docs:
	bash $(SOURCE_DOCS_SH) --skill-root $(CURDIR)/.. --manifest $(CURDIR)/docs-manifest.txt

# Maintainer-only: regenerates the committed docs-manifest.txt and
# allowed-keys.json from a local Workshop checkout. Not part of `check`.
update-docs-manifest:
	bash $(MANIFEST_SH)

# The Copilot lane's SDK, pinned in the repo-root package.json/package-lock.json
# (kept out of .github/skills: the SDK's runtime ships its own SKILL.md files).
eval-deps:
	npm ci --prefix $(REPO_ROOT) --no-audit --no-fund

eval-bundle:
	bash $(BUNDLE_SH)

# The gate since 2026-10-19: Sonnet via the local claude CLI login, local
# claude judge, no API keys, $0. One CLI spawn per case (~25-45 min).
eval-routing:
	bash $(ROUTING_SH)

eval-routing-subscription:
	bash $(ROUTING_SH) --subscription

# Cross-vendor run: a GPT model via the local Copilot login (Copilot SDK,
# replace-mode system prompt, no tools), graded by the same local claude judge.
# Draws on the account's monthly premium allowance; needs `make eval-deps`.
eval-routing-copilot:
	bash $(ROUTING_SH) --copilot

# SUSPENDED (no OpenRouter budget since 2026-10-19): the former pinned gate,
# GLM-5.2 via OpenRouter with the gpt-5.5 judge (~$1.41/run). Kept runnable so
# the lane can resume; see TESTING.md.
eval-routing-glm:
	bash $(ROUTING_SH) --provider openrouter:z-ai/glm-5.2

# SUSPENDED with eval-routing-glm (OpenRouter).
# Diagnostic sweep over every provider still declared in promptfooconfig.yaml:
# the GLM family plus MiniMax-M2.7 (the documented runner-up candidate, kept
# so a GLM deprecation has a measured fallback). run-sweep.sh CONTINUES past
# assertion failures (exit 1 — diagnostic outcome, remaining tiers still carry
# signal; the sweep re-exits 1 at the end) but ABORTS on run-level errors
# (exit 2 — judge/API/auth/credits; every later tier would hit the same wall).
# The 2026-06 multi-family matrix (Kimi, DeepSeek, MiMo, gpt-oss, Nemotron,
# Gemma, Llama, Mistral, Qwen3) was retired 2026-08-20; its results live in
# BASELINE.md and the provider blocks in git history.
eval-routing-sweep:
	bash $(SWEEP_SH) --provider openrouter:z-ai/glm-4.7-flash openrouter:z-ai/glm-5.1 openrouter:z-ai/glm-5.2 openrouter:minimax/minimax-m2.7

eval-agentic:
	bash $(AGENTIC_SH)

eval-clean:
	rm -f skill-bundle.md
	rm -rf results/raw
