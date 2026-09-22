# 02 — Lesson content follows the plugin model

**What to build:** A learner working through a lesson gets the plugin's
pedagogy: within a Concept every MCQ offers the same three options, a wrong
answer names the belief behind the chosen option and shows the first paragraph
of the Card that corrects it, and the Wrap-up asks a Question the Checks never
showed. This means `lesson/v1` changes, the resolver changes, the demo lesson is
rewritten, and the learning shell renders the new feedback.

Adopt from the plugin's `lesson-schema.md`:

- A Concept owns one shared option set of exactly three options with stable
  option IDs. Every MCQ in that Concept uses that set and names its key.
- A Concept owns a misconception registry. Each misconception has a statement
  written as the belief itself and names the Card in the same Concept that
  corrects it.
- Each MCQ maps every non-key option to one misconception in its Concept and
  carries feedback for every option, including the key.
- Each Pool marks at least one Question `reserved`. Checks never draw a
  reserved Question. The Wrap-up draws reserved Questions first.
- A Card body is an array of paragraphs. The corrective view shows the first
  paragraph and folds the rest behind "Read the rest of this card".
- A numeric Question is never reserved.

Keep what the domain model already settles and the plugin lacks: short-answer
Questions with aliases, numeric tolerance and unit, structured sources,
provenance, UUIDv4 IDs, the Concept rail, and the Back and close controls.
Question and option order still come from the persisted attempt seed.

The rules that the plugin's `SKILL.md` lists under "Rules that are not yours to
relax" apply to the learning shell. Never show a score, streak, difficulty,
time estimate or the word mastery.

Also port the plugin validator's author-quality rules in the same slice, so the
resolution API and the downloaded validator return them as diagnostics. Each rule is a diagnostic with a stable code, a
JSON Pointer path and a severity:

- Card word count outside 120 to 200 (error). Count words after stripping
  inline HTML tags.
- Option length ratio within a Concept's set above 1.35 (error).
- Key is the longest option in more than one third of MCQs, lesson-wide
  (error). Never per Question; see the note in the plugin validator.
- Stem contains an unbound reference such as "the second", "the above" or
  "this approach" (error).
- Numeric answer appears in no Card of its Concept (error).
- Numeric Question has no tolerance (error).
- Fewer than three drawable Questions in a Pool (error).
- Single-paragraph Card (warning).

Warnings return with `valid: true`. Errors return `422` from the API.

Make validator parity a test: for every fixture, the generated validator file
and the shared resolver return byte-equivalent result JSON. Add adversarial
fixtures: the size limit, deep nesting, duplicate IDs, prototype-key names and
each new rule.

**Demo path:** On a phone viewport, start the demo lesson, pick a wrong option
in a Concept Check, and see the belief behind it plus the clamped correcting
Card. Continue to the Wrap-up and see a Question the Checks did not show. Reach
Learned. Then POST a lesson whose Card is 90 words and whose key is always
the longest option and get `422` with two diagnostics.

**Blocked by:** 01 — Split the browser app and server routes into domain modules.

**Status:** done 88c37e0

- [x] The resolver rejects a Concept with an option set that is not exactly
      three, an MCQ whose key is not in the set, a distractor with no
      misconception, a misconception that names a Card outside its Concept, a
      misconception no option uses, a Pool with no reserved Question, a
      reserved numeric Question, and a Card whose body is not a paragraph
      array. Each has its own diagnostic code and JSON Pointer path.
- [x] The demo lesson uses the new shape, passes the resolver, and its wrong
      answers name real misconceptions the Cards correct.
- [x] Wrong-answer feedback shows the option feedback, the belief statement and
      the correcting Card clamped to its first paragraph, with the action
      button above the Card so retrying needs no scroll.
- [x] Correct-answer feedback shows the key's feedback and never auto-advances.
- [x] The Concept Check never draws a reserved Question. The Wrap-up draws a
      reserved Question for every Concept.
- [x] Reloading during feedback restores the same feedback, belief and Card.
- [x] Every rule above has a diagnostic code, and a fixture that triggers only
      that rule.
- [x] Diagnostics are ordered deterministically: by path, then code.
- [x] A lesson with only warnings resolves `valid: true` and includes them.
- [x] The parity test runs the generated validator in a real subprocess from a
      temporary directory, with no network, and compares result JSON to the
      shared resolver byte for byte.
- [x] Adversarial fixtures for size, nesting, duplicate IDs and prototype keys
      are rejected without a crash or a hang.
- [x] `deno task tools:generate` leaves no diff, and the full check and test
      suites pass.
- [x] Unit tests cover the new resolver rules and the reserved-draw rule. The
      phone-sized browser happy path passes with the new demo lesson.

## Verification

```bash
deno task tools:generate && git diff --exit-code public/tools
deno task check && deno task test && deno task e2e
```

## Report

Implementation commit: `88c37e0`.

### Verification output

```text
$ deno task tools:generate && git diff --exit-code public/tools
Task tools:generate deno run --allow-read --allow-write scripts/generate-tools.ts
Generated public/tools/lesson-validator.js and lesson-validator.d.ts
(no diff)
$ deno task check
Task check deno check main.ts src/app.ts public/js/*.js src/shared/**/*.js src/client/**/*.js src/server/**/*.ts scripts/*.ts
$ deno task test
ok | 46 passed | 0 failed (380ms)
$ deno task e2e
ok | 3 passed | 0 failed (5s)
$ deno task test:db
ok | 2 passed (10 steps) | 0 failed (12s)
```

The e2e suite was also run six more times to confirm the randomized Check order
does not make it flaky.

### What changed

- `lesson/v1` (`src/shared/authoring/resolver.js`): Concepts own `options`
  (exactly three `{ id, text }`), `misconceptions`
  (`{ id, statement, correctingCardId }`) and Cards with paragraph-array
  bodies. Questions stay top-level with `conceptId` and `poolId` and gain
  `reserved`. MCQs carry `key`, `map` and per-option `feedback`. Every rule in
  the ticket has its own code and JSON Pointer path; diagnostics are sorted by
  path (numeric segments numerically), then code. Warnings resolve
  `valid: true`; errors return `422` from the API. The normalized lesson is
  rebuilt from a whitelist of contract fields, so unknown keys, including
  `__proto__`, never reach the fingerprint or the database.
- Adversarial handling: depth is measured with an explicit stack before any
  recursion (`document.nesting`, limit 32), then size (`document.size`,
  1,000,000 bytes). Option and misconception IDs must match
  `^[A-Za-z0-9_-]{1,64}$` and may not be `__proto__`, `constructor` or
  `prototype`. Lookups use `Map` and `Object.hasOwn`.
- Learning shell: Checks draw only drawable Questions; the Wrap-up draws a
  reserved Question per Concept (falling back to any only when a Pool has
  none, which the resolver forbids). Feedback carries `text`, `belief` and
  `cardId`, so a reload restores the same view from the checkpoint. The
  clamped correcting Card renders under the action row with a
  "Read the rest of this card" disclosure; the corrective detour still opens
  the full Card. Correct feedback never auto-advances. The shell shows no
  score, streak, difficulty, time estimate or the word mastery (asserted in
  the happy path).
- Demo lesson rewritten: three Concepts, two Cards each of 130 to 148 words in
  three paragraphs, one shared option set and misconception registry per
  Concept, four Questions per Pool (three drawable plus one reserved), with
  MCQ, numeric and short types. The key is the longest option in 1 of 6 MCQs.
- Fixtures: `fixtures/authoring/manifest.json` lists 27 fixtures. Each
  structural and author-quality rule has a fixture that triggers only that
  rule (asserted by a test). Adversarial fixtures cover duplicate Concept,
  Card and Question IDs, prototype-key names and deep nesting; the oversized
  document and a 50,000-level nesting document are generated at test time
  rather than committed.
- Parity: `tests/server/validator_parity_test.ts` downloads
  `/tools/lesson-validator.js` through the app, writes it and every fixture to
  a temporary directory, runs it with
  `deno run --no-remote --deny-net --allow-read=<tmp>` and compares each
  result's JSON string byte for byte with the shared resolver.

### Decisions

- Option and misconception IDs are short local identifiers rather than
  UUIDv4, matching the plugin's letter and slug keys and keeping `map` and
  `feedback` readable for authors. Concept, Card, Pool and Question IDs stay
  UUIDv4.
- Questions remain a top-level array with `conceptId` and `poolId` rather
  than nesting the Pool inside the Concept, to keep what the domain model and
  the existing storage already settle.
- `numeric.tolerance.missing` fires for a missing tolerance and for zero,
  as the plugin validator does. The domain model text was updated to say
  non-zero.
- `correctingCardId` stays required on every Question and must now be in the
  Question's Concept. For a chosen MCQ distractor the misconception's Card is
  shown; `correctingCardId` is used for I don't know and for numeric and
  short answers.
- `deno.json` `test` task gained `--allow-write --allow-run=deno` so the
  parity subprocess can run under `deno task test`. This file is
  coordinator-owned; the change is limited to those two flags.
- E2e servers now bind an ephemeral port (`port: 0`) because port 8002 was
  held by another worktree's session on this machine.
- The `lessonSchema` skeleton was left for ticket 03, except `questions`
  `minItems` moved from 3 to 4.

### Not done

Nothing left out. Ticket 03's schema, OpenAPI and diagnostics-reference work
is not part of this slice beyond the diagnostics table added to
`docs/api-v1.md`.
