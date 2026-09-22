---
name: lesson
description: Turn work just done in this session (a diff, a document, a repository, a conversation) into a retrieval-practice lesson on learn.joshhale.me. Use when the user asks to make a lesson, to be quizzed later on what was built, to save what they learned to their phone, or for a comprehension check they can take away. Authors lesson.json, validates it and creates a private draft with LEARN_TOKEN.
---

# Lesson

Author a lesson as data. Never author the interface.

The flow, the pedagogy and the layout live in the learn.joshhale.me app, which
Josh opens on his phone. Write only `lesson.json`, validate it with the site's
own validator, and create a private draft through the API. The rules the app
owns cannot be forgotten, because there is no code path in which to forget them.

Paths below are relative to this skill's directory, the folder holding this
`SKILL.md`. Inside the installed plugin that is
`${CLAUDE_PLUGIN_ROOT}/skills/lesson`. The scripts run under Node 20+ or Deno.

## Steps

### 1. Establish the source

A lesson needs material that can correct a wrong answer. Identify it before
writing anything:

- Code, a diff, a document, a repository, a conversation.
- If the user is asking about work an agent just did for them, the source is
  that work plus the reasoning behind it.
- If a learning history exists (past wrong answers, a learning record, notes on
  what confused them), read it. Misconceptions the learner actually held make
  far better distractors than invented ones.

Read the source fully. Never author from a summary. Record each source as an
entry in `sources` with a `type`, a `title` and a `locator` (a path, URL or
commit SHA), so the lesson can be traced back.

### 2. Read the authoring rules

Read `references/authoring.md` and `references/lesson-schema.md` before
writing. Keep `references/diagnostics.md` at hand for step 4.

The shared-option-set construction in `authoring.md` is not a style note. It is
what stops the lesson being solvable by picking the longest answer, and it is
the single most important thing on that page.

### 3. Write lesson.json

Three to five Concepts. Per Concept: one shared set of exactly 3 options,
the misconceptions those options encode, two to four Cards of 120 to
200 words each, and a Pool of at least 3 drawable Questions plus one
marked `"reserved": true`. Questions live at the top level and name their
Concept and its Pool. Every Concept, Pool, Card and Question ID is a fresh
UUIDv4; generate them once (`crypto.randomUUID()`, `uuidgen`) and keep them.

Fill `provenance` with `"status": "provided"` and all five fields: `client`
(the agent product, such as Claude Code), `harness` (the runtime it ran in,
such as Claude Code CLI or Cowork), `model` (the model identifier), `client_version`
(the output of `claude --version` when available) and `session_reference` (the
session ID when the harness exposes one). Write `"unknown"` for any field the
harness does not expose. Never omit provenance and never write the token into it.

Write the file to a working directory, not into the user's project, unless
they ask for the file.

### 3b. Attack your own draft

Do this as a separate pass, after the whole lesson exists and before you
validate. Re-read `references/authoring.md`, then go Question by Question and
try to break each one. Judgment defects survive a one-shot draft because the
same reasoning that produced a Question also justifies it; they only surface
when you come back to the finished thing and argue against it.

For every Question, answer out loud:

- **Could a learner who never read the Cards answer this?** If the stem already
  contains the substance of the key, names its parts, restates it in other
  words, or describes exactly the situation the key names, the Question is a
  matching exercise. Rewrite the stem to describe a *situation* and leave the
  *judgment* to the options. Beware synonyms: rewording the giveaway is not
  removing it. The test is whether the stem plus general reading comprehension
  is enough.
- **Does each distractor name a misconception the Cards actually correct?** Or
  did you attach the nearest available ID to fill the `map`?
- **Does the key move across the Concept's Questions?** Three Questions keying
  the same option is one question asked three times.
- **For numeric Questions: which of the two permitted kinds is this?** If you
  cannot name it as derived-from-mechanism or load-bearing-constant, it is
  incidental. Replace it.
- **For short-answer Questions: is there one canonical answer?** List every
  spelling a correct learner might type in `aliases`. If two different
  answers are both right, it is an MCQ.
- **Read every stem cold, out of order.** Does it still stand alone?

Fix what you find, then validate. Report what this pass caught. An adversarial
pass that found nothing is a pass you did not really run.

### 4. Validate

```bash
node scripts/validate.mjs lesson.json
```

Or, without Node: `deno run --allow-read scripts/validate.mjs lesson.json`.

The script runs the site's own resolver, bundled here as
`scripts/lesson-validator.js` and also served at https://learn-joshhale.legoguy32109.deno.net/tools/lesson-validator.js.
Its result is byte-identical to `POST https://learn-joshhale.legoguy32109.deno.net/api/v1/lesson-resolutions`;
`--remote` proves it against the live API. Every `FAIL` line names a diagnostic
code, its JSON Pointer path and the fix from `references/diagnostics.md`.

Fix every FAIL and re-run until clean. Do not rationalise a failure, and do not
report the lesson as ready while one stands. Warnings do not block a draft, but
fix them too unless you can say why not.

Expect failures on the first pass. Card word count is the usual one: a model
cannot count its own output while producing it, so any rule expressed as a
number is only evaluable after the fact. That is what this step is for.

### 5. Submit

The bearer token is the `LEARN_TOKEN` environment variable. If it is not set,
stop and tell the user to export it in the shell that runs the agent. Never ask
the user to paste the token into the chat, never print it, never write it into
the lesson, a log or a file, and never pass it on a command line.

```bash
node scripts/submit.mjs lesson.json
```

Or: `deno run --allow-read --allow-net --allow-env=LEARN_TOKEN,LEARN_BASE_URL scripts/submit.mjs lesson.json`.

The script resolves the document again, then `POST`s it to
https://learn-joshhale.legoguy32109.deno.net/api/v1/lessons and prints the created draft: its
`lessonId`, `revisionId`, fingerprint and the learning URL
`https://learn-joshhale.legoguy32109.deno.net/learn/<lessonId>`. Submitting the same document twice returns the
same revision, so a retry is safe. To add a revision to an existing lesson
instead of creating a new one, pass `--lesson <lessonId>`.

A `401` means the token is missing, invalid, expired or revoked. A `403` means
it lacks the `lessons:write` scope. A `422` means the server's resolver
rejected the document; the printed diagnostics say why. Never work around any
of them.

### 6. Report

Tell the user what the lesson covers, give the learning URL, and say briefly
what the adversarial pass and the validator each caught and what you changed.
Name anything you could not verify.

Never report a pass rate, a score, or a difficulty rating. The app does not
compute them and neither should the summary.

## Rules that are not yours to relax

These live in the site's resolver and in the app. If a user asks for one of them
to change, say it lives in learn.joshhale.me rather than quietly working around
it:

- Exactly 3 options, shared across a Concept, with the longest at most
  1.35 times the length of the shortest.
- Every distractor names a misconception corrected by a Card in the same Concept.
- Feedback on every option, including the key, delivered immediately.
- "I don't know" on every Question, no penalty and no reward.
- A wrong answer is re-asked from an unseen Question of the same Pool.
- Learned is earned only in the Wrap-up. Drill mode serves every Question,
  reserved ones included, but never earns it.
- A numeric Question is never reserved and its answer appears in a Card.
- No score, no streak, no difficulty, no time estimate, no partial credit, and
  never the word mastery. Say Retained, not Mastered.

## Discovery

The site describes itself at https://learn-joshhale.legoguy32109.deno.net/api/v1/capabilities. That
document links the JSON Schema (https://learn-joshhale.legoguy32109.deno.net/api/v1/schemas/lesson/v1), the
OpenAPI document (https://learn-joshhale.legoguy32109.deno.net/openapi.json), the diagnostics
catalog (https://learn-joshhale.legoguy32109.deno.net/api/v1/diagnostics) and the human
documentation (https://learn-joshhale.legoguy32109.deno.net/docs/api-v1.md). The texts in this plugin
are generated from the same sources, so they agree with the server; when in
doubt, the served documents win.
