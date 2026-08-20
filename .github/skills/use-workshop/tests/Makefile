# SPDX-License-Identifier: GPL-3.0-only
# Copyright 2026 Canonical Ltd.

# Convenience targets for the use-workshop eval suite.
#
# All targets delegate to the shell scripts under scripts/ so the underlying
# behaviour is identical whether you run `make eval-routing` or
# `bash scripts/run-routing.sh`. The scripts handle the bundle regen and
# slim-summary post-processing. See TESTING.md at the repo root for the
# three-lane doctrine (what runs when, and what each lane costs).

SHELL := /usr/bin/env bash

TESTLIB      := ../../_testlib
ROUTING_SH   := scripts/run-routing.sh
SWEEP_SH     := scripts/run-sweep.sh
AGENTIC_SH   := scripts/run-agentic.sh
BUNDLE_SH    := scripts/regenerate-bundle.sh
SOURCE_DOCS_SH := $(TESTLIB)/check-source-docs.sh
YAML_KEYS_PY := $(TESTLIB)/check-yaml-keys.py
MANIFEST_SH  := scripts/update-docs-manifest.sh

.PHONY: help check check-yaml check-yaml-keys check-shell check-source-docs \
        update-docs-manifest eval-bundle eval-routing eval-routing-sweep \
        eval-agentic eval-clean

help:
	@echo "use-workshop eval targets:"
	@echo "  check                    all free static checks: source-docs + bundle regen + YAML parse + YAML keys + shellcheck (CI entry point)"
	@echo "  check-source-docs        assert every cited upstream doc path exists in docs-manifest.txt (offline; subsumes the retired check-doc-paths)"
	@echo "  check-yaml-keys          lint skill YAML snippets/templates against the upstream schema key allowlists (offline)"
	@echo "  update-docs-manifest     regenerate docs-manifest.txt + allowed-keys.json from a Workshop checkout (needs WORKSHOP_REPO; maintainer-only)"
	@echo "  eval-bundle              regenerate skill-bundle.md from current SKILL.md/refs/workflows"
	@echo "  eval-routing             run routing eval against GLM-5.2 via OpenRouter — the pinned gate (needs OPENROUTER_API_KEY only)"
	@echo "  eval-routing-sweep       diagnostic sweep: GLM 4.7-flash + 5.1 + 5.2 and MiniMax-M2.7, the documented runner-up (needs OPENROUTER_API_KEY)"
	@echo "  eval-agentic             run agentic E2E suite (slow, real LXD)"
	@echo "  eval-clean               remove the generated skill-bundle.md and raw/ outputs"

# All free static checks in one entry point, shared by CI and local runs.
# (check-doc-paths was retired 2026-08-20: the shared manifest contains only
# the four combined CLI pages, so check-source-docs already rejects any other
# reference/cli/ path — the onboard suite reasoned this out first.)
check: check-source-docs eval-bundle check-yaml check-yaml-keys check-shell
	@test -s skill-bundle.md || { echo "error: skill-bundle.md is empty" >&2; exit 1; }
	@echo "ok: all static checks passed"

check-yaml:
	@python3 -c "import glob, yaml; \
files = sorted(glob.glob('scenarios/*.yaml') + glob.glob('../templates/*.yaml') + glob.glob('agentic/tasks/*.yaml')); \
[yaml.safe_load(open(f)) for f in files]; \
print('ok: %d YAML file(s) parsed' % len(files))"

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

eval-bundle:
	bash $(BUNDLE_SH)

# The pinned gate: GLM-5.2 via OpenRouter, judge routed through OpenRouter too,
# so this needs OPENROUTER_API_KEY and nothing else (measured ~$1.41/run).
eval-routing:
	bash $(ROUTING_SH)

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
