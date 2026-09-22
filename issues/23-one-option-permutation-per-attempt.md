# 23 — Every MCQ in an attempt shows the Concept's options in the same order

**What to build:** Option display order is shuffled with `flow.seed`, which is
fixed for a whole Check attempt, a whole Wrap-up and a whole drill run. Every
MCQ of a Concept in that attempt therefore renders the three options in one
identical permutation. After a wrong answer, "Try another from this concept"
shows the same layout, and in drill all MCQs of a Concept line up the same
way for the entire run. The plugin renderer shuffles per Question (`sh(...)`
on each load). Derive the option order from the seed and the Question ID, or
from the seed and the queue position, so it is still deterministic and
survives reload but differs between Questions.

**Reproduction:** `deno task audit:phone`. Failing check:

- `options · MCQs in one Concept Check attempt do not all share one option
  permutation` — `expect(orders.size).toBeGreaterThan(1)` received `1`.

The probe builds `startCheck(lesson, cardsFlow(0), { seed: 7 })` and renders
`questionView` for each MCQ of Concept 1, collecting the `data-answer` order.
The browser drill in the walk recorded one distinct option order per Concept
across all of that Concept's MCQs, for all three Concepts. Code:
`src/client/learning/views.js` `answerForm()`.

**Blocked by:** None.

**Status:** done de1242e

- [x] Two MCQs of the same Concept in one attempt can render different option
      orders, and the order of each still survives a reload.
- [x] The audit check above passes in `deno task audit:phone`; every reload
      check in the same run still passes.

## Verification

```bash
deno task audit:phone
deno task test && deno task e2e
```

## Report

Changed `src/client/learning/views.js`: a new exported `optionOrder(concept, question, flow)`
shuffles the options with `(flow.seed + fnv1a(question.id)) >>> 0`, and `answerForm` uses it.
Seed and Question ID are both in the checkpoint, so the order survives a reload; the hash
makes it differ between a Concept's Questions. The hash lives in `views.js` rather than the
shared `shuffle.js` to keep this change out of files the other worker's imports touch.

New unit test in `tests/client/flow_test.ts`: Concept 1's MCQs render more than one order
under seed 7, the same Question renders the same order twice, and every order is a permutation
of the Concept's option set.

Passing in `deno task audit:phone`:

```
- options · MCQs in one Concept Check attempt do not all share one option permutation
- drill option order · Freshness and age: 2 distinct option order(s) across this Concept's MCQs in one run.
- drill option order · Cache directives and revalidation: 2 distinct option order(s) ...
```

Every `reload · ... · surface comes back` check that passed on the baseline still passes;
the reload checks that fail belong to ticket 17. `deno task test`: 109 passed. `deno task e2e`:
7 passed.

Audit run on this branch (`deno task audit:phone`, three runs, identical results): walk
307 passed / 11 failed, probes 7 passed / 7 failed. Every failure belongs to tickets
17, 20 and 21 (reload landing, double-tap, dead square Back), which another worker owns,
or to a stale audit helper: `projection()` in `tests/audit/support.ts` looks up the
projection id `checkpoint` / `progress`, but since the ticket 08 merge the keys are
`checkpoint:<revisionId>:<epoch>`, so the seven "Cannot read properties of null" walk
checks (Back inspection checkpoint, Try another queue, I don't know state, wrap-up
Learned 2 to 4, Learned summary) read null. That predates this branch and is outside
these tickets; I tried a prefix match and reverted it because it uncovered further stale
expectations, which need their own ticket.

`deno task check`: passes. `deno task test`: 109 passed, 0 failed. `deno task e2e`:
7 passed, 0 failed.
