# 03 — Author-quality diagnostics ported from the plugin validator

**What to build:** An agent that submits a lesson gets back the same quality
checks the plugin's `validate.mjs` runs, as structured diagnostics, from both
the resolution API and the downloaded validator. These are the rules a model
violates while believing it complied, so they belong in the server, not in a
skill's prose.

Port every mechanical rule in the plugin validator as a diagnostic with a
stable code, a JSON Pointer path and a severity:

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

**Demo path:** POST a lesson whose Card is 90 words and whose key is always the
longest option. The response is `422` with two diagnostics that name the Card
and the lesson-wide rate. Download the validator, run it in a temporary
directory on the same file, and get the same JSON.

**Blocked by:** 02 — Lesson content follows the plugin model.

**Status:** ready-for-agent

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

## Verification

```bash
deno task tools:generate && git diff --exit-code public/tools
deno task check && deno task test
```
