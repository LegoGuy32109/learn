---
name: quiz
description: Build an interactive retrieval-practice quiz on a topic, rendered through a fixed interface. Use when the user asks to quiz them, test their understanding, check what they retained, make a lesson or flashcards on a subject, or asks for a comprehension check on code or a document an agent produced.
---

# Quiz

Author a lesson as data. Never author the interface.

The flow, the pedagogy and the layout live in a fixed renderer that ships with
this skill. Write only `lesson.json`, validate it, build it, then render it in
the chat. The rules the renderer owns cannot be forgotten, because there is no
code path in which to forget them.

## Steps

### 1. Establish the source

A quiz needs material that can correct a wrong answer. Identify it before
writing anything:

- Code, a document, a repository, a lesson, a conversation.
- If the user is asking about work an agent just did for them, the source is
  that work plus the reasoning behind it.
- If a learning history exists (past wrong answers, a learning record, notes on
  what confused them), read it. Misconceptions the learner actually held make
  far better distractors than invented ones.

Read the source fully. Never author from a summary.

### 2. Read the authoring rules

Read `${CLAUDE_PLUGIN_ROOT}/skills/quiz/references/authoring.md` and
`${CLAUDE_PLUGIN_ROOT}/skills/quiz/references/lesson-schema.md` before writing.

The shared-option-set construction in `authoring.md` is not a style note. It is
what stops the quiz being solvable by picking the longest answer, and it is the
single most important thing on that page.

### 3. Write lesson.json

Three to five concepts. Per concept: one shared set of exactly three options,
the misconceptions those options encode, two to four cards of 120 to 200 words
each, and a pool of at least three drawable items plus one marked
`"reserved": true`.

Write it to a working directory, not into the user's project, unless they ask
for the file.

### 3b. Attack your own draft

Do this as a separate pass, after the whole lesson exists and before you
validate. Re-read `references/authoring.md`, then go item by item and try to
break each one. Judgment defects survive a one-shot draft because the same
reasoning that produced an item also justifies it; they only surface when you
come back to the finished thing and argue against it.

For every item, answer out loud:

- **Could a learner who never read the cards answer this?** If the stem already
  contains the substance of the key — names its parts, restates it in other
  words, or describes exactly the situation the key names — the item is a
  matching exercise. Rewrite the stem to describe a *situation* and leave the
  *judgment* to the options. Beware synonyms: rewording the giveaway is not
  removing it. The test is whether the stem plus general reading comprehension
  is enough.
- **Does each distractor name a misconception the cards actually correct?** Or
  did you attach the nearest available slug to fill the `map`?
- **Does the key move across the concept's items?** Three items keying the same
  option is one question asked three times.
- **For numeric items: which of the two permitted kinds is this?** If you cannot
  name it as derived-from-mechanism or load-bearing-constant, it is incidental.
  Replace it.
- **Read every stem cold, out of order.** Does it still stand alone?

Fix what you find, then validate. Report what this pass caught — an adversarial
pass that found nothing is a pass you did not really run.

### 4. Validate

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/quiz/scripts/validate.mjs lesson.json
```

Fix every FAIL and re-run until clean. Do not rationalise a failure, and do not
report the quiz as ready while one stands.

Expect failures on the first pass. Card word count is the usual one: a model
cannot count its own output while producing it, so any rule expressed as a
number is only evaluable after the fact. That is what this step is for.

### 5. Build

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/quiz/scripts/build.mjs lesson.json ./out
```

This writes `out/fragment.html` (the thing to render) and `out/preview.html`
(a standalone page for testing).

### 6. Render

Read `out/fragment.html` and pass its contents as the widget code to whatever
inline-rendering tool the session offers (`show_widget` in Cowork). Read the
built file — never retype the renderer from memory.

If the session has no inline renderer, deliver `preview.html` as a file instead.

No browser test is needed per lesson. The renderer is fixed and was verified
once, and `build.mjs` injects the lesson with `JSON.stringify`, which cannot
emit a raw newline, an unterminated string, or an early `</script`. A lesson
therefore cannot break the shell — the only thing content can get wrong is
content, and the validator already covers that.

That guarantee holds only while the shell is untouched. See **Changing the
renderer** below.

## Reporting

Tell the user what the quiz covers and, briefly, what the adversarial pass and
the validator each caught and what you changed. Name anything you could not
verify.

Never report a pass rate, a score, or a difficulty rating. The quiz does not
compute them and neither should the summary.

## Changing the renderer

Editing `assets/renderer.html` is a different activity from authoring a lesson,
and it reinstates the browser test. Nothing about a JSON payload can break the
shell, but an edit to the shell can break every lesson at once.

After any change to the renderer, drive `preview.html` with Playwright, with
`pageerror` and `console` listeners attached, and walk the whole path: intro,
cards, a deliberately wrong answer, the re-ask, every concept, into the wrap-up,
to the final screen. Confirm a reserved item renders in the wrap-up.

```js
const { chromium } = require("playwright");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
```

A script error renders as a blank panel and looks like nothing happened. A
syntax check is not a substitute: the failures that matter are silent ones, such
as a phase that is never reachable.

Changing the flow also means changing what the plugin promises. Read the rules
below before editing.

## Rules that are not yours to relax

These live in the renderer and in the validator. If a user asks for one of them
to change, say it lives in the plugin rather than quietly working around it:

- Exactly three options, shared across a concept.
- Every distractor names a misconception corrected by a card in the same concept.
- Feedback on every option, including the key, delivered immediately.
- "I don't know" on every item, no penalty and no reward.
- A wrong answer is re-asked from an unseen instance.
- Learned is earned only in the wrap-up. Drill mode never earns it: the intro's
  "Skip to every question" button serves every item in every pool, reserved ones
  included, with full feedback and the correcting card, but it does not mark any
  concept Learned. It exists so an author can review every item in one pass and a
  returning learner can re-test without rereading cards.
- No score, no streak, no difficulty, no time estimate, no partial credit, and
  never the word mastery.
