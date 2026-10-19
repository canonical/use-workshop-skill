// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
//
// Prompt handling shared by the local routing CANDIDATE providers
// (provider-routing-cli.js on the claude subscription login,
// provider-routing-copilot.js on the Copilot login). Both lanes must send the
// candidate the same text — the bundle plus the same harness note — so a
// difference between their rows is a difference between models, not between
// prompts.
//
// promptfoo renders prompt.json into a chat-JSON array string
// ([{role:"system",content:<bundle>},{role:"user",content:<case>}]) and hands
// it to callApi. Parsing that — rather than reading skill-bundle.md from disk —
// preserves per-test vars.skill overrides (scenarios/skill-selection.yaml swaps
// in skill-selection-context.md for its cases).

'use strict';

// Appended to every system prompt a routing provider sends. The claude CLI
// injects per-machine sections (cwd, env info, memory paths, git status) into
// the prompt and there is no flag to suppress them: as of 2.1.278
// --exclude-dynamic-system-prompt-sections only RELOCATES them into the first
// user message, and is ignored with a custom system prompt anyway. So a
// tool-less candidate sitting in an empty scratch dir sees an empty directory
// and, on repo-analysis prompts, answers about THAT instead of the scenario —
// "The working directory /tmp/routing-eval-XXXX is empty" rather than the
// routing decision under test. Measured 2026-09-22: five of six onboard
// failures were this, and the same effect cost the pre-0.9.7 tree four cases.
// The Copilot lane has no cwd injection (replace mode sends exactly this
// text), but gets the same note so both lanes measure the same prompt.
//
// Two drafts were needed. Saying "you have no repo access" made the candidate
// REPORT that instead ("I can't see the repository...") — the same derail in
// a different hat. The load-bearing part turned out to be the tool ban: with
// --tools "" the CLI still lets the model EMIT a tool call and hallucinate its
// result, so it would "list" the scratch dir, read back an empty listing it
// invented, and answer about that.
//
// Deliberately says nothing about HOW to route. It bans fabricated inspection
// and names the cwd as out of frame; whether a given case should answer, ask
// for context, or hand off stays the candidate's decision, which is the thing
// under measurement. A note that nudged that choice would inflate the verdict.
const HARNESS_NOTE = `

---

# How to answer here (harness note, not part of the skill)

You have no tools in this exchange. Do not emit tool calls or tool results,
and do not inspect or describe the current working directory — it is an empty
scratch directory created for this measurement, it is not the project under
discussion, and its contents are not evidence about anything.

Answer the user's message directly, from the skill content above, treating
their account of the situation as the ground truth.
`;

// The skill-SELECTION context (regenerate-bundle.sh --selection-out) is a
// different shape: ~2 KB of frontmatter that ends with its own instruction,
// "Answer with the single skill name ... then one sentence of reasoning."
// Appending the note there displaces that closing instruction and measurably
// breaks selection — A/B'd 2026-09-22 on design-sdk's "In-project SDK
// authoring picks use-workshop": 1/3 with the note, 3/3 without. Those cases
// have no cwd problem to solve anyway (the answer is one word), so the note is
// simply not appended to them.
const SELECTION_MARKER = 'skills are installed. Their metadata:';

function withHarnessNote(system) {
  const text = String(system);
  return text.includes(SELECTION_MARKER) ? text : text + HARNESS_NOTE;
}

function parseChatPrompt(prompt, vars) {
  let system = null;
  let user = null;
  try {
    const parsed = JSON.parse(String(prompt));
    if (Array.isArray(parsed)) {
      for (const msg of parsed) {
        if (msg && msg.role === 'system' && typeof msg.content === 'string') {
          system = msg.content;
        } else if (msg && msg.role === 'user' && typeof msg.content === 'string') {
          user = msg.content;
        }
      }
    }
  } catch (_) { /* fall through to vars */ }
  if (system === null && vars && typeof vars.skill === 'string') system = vars.skill;
  if (user === null && vars && typeof vars.user === 'string') user = vars.user;
  if (user === null) user = String(prompt);
  return { system, user };
}

module.exports = { HARNESS_NOTE, SELECTION_MARKER, withHarnessNote, parseChatPrompt };
