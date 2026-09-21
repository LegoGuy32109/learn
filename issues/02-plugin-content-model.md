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

**Status:** ready-for-agent

- [ ] The resolver rejects a Concept with an option set that is not exactly
      three, an MCQ whose key is not in the set, a distractor with no
      misconception, a misconception that names a Card outside its Concept, a
      misconception no option uses, a Pool with no reserved Question, a
      reserved numeric Question, and a Card whose body is not a paragraph
      array. Each has its own diagnostic code and JSON Pointer path.
- [ ] The demo lesson uses the new shape, passes the resolver, and its wrong
      answers name real misconceptions the Cards correct.
- [ ] Wrong-answer feedback shows the option feedback, the belief statement and
      the correcting Card clamped to its first paragraph, with the action
      button above the Card so retrying needs no scroll.
- [ ] Correct-answer feedback shows the key's feedback and never auto-advances.
- [ ] The Concept Check never draws a reserved Question. The Wrap-up draws a
      reserved Question for every Concept.
- [ ] Reloading during feedback restores the same feedback, belief and Card.
- [ ] Every rule above has a diagnostic code, and a fixture that triggers only
      that rule.
- [ ] Diagnostics are ordered deterministically: by path, then code.
- [ ] A lesson with only warnings resolves `valid: true` and includes them.
- [ ] The parity test runs the generated validator in a real subprocess from a
      temporary directory, with no network, and compares result JSON to the
      shared resolver byte for byte.
- [ ] Adversarial fixtures for size, nesting, duplicate IDs and prototype keys
      are rejected without a crash or a hang.
- [ ] `deno task tools:generate` leaves no diff, and the full check and test
      suites pass.
- [ ] Unit tests cover the new resolver rules and the reserved-draw rule. The
      phone-sized browser happy path passes with the new demo lesson.

## Verification

```bash
deno task tools:generate && git diff --exit-code public/tools
deno task check && deno task test && deno task e2e
```
