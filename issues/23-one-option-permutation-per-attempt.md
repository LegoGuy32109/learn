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

**Status:** ready-for-agent

- [ ] Two MCQs of the same Concept in one attempt can render different option
      orders, and the order of each still survives a reload.
- [ ] The audit check above passes in `deno task audit:phone`; every reload
      check in the same run still passes.

## Verification

```bash
deno task audit:phone
deno task test && deno task e2e
```
