# 22 — The Wrap-up can re-ask a missed Concept immediately

**What to build:** `docs/domain-model.md` and `docs/first-milestone.md` say a
missed Wrap-up Concept returns later in a shuffled queue. `advanceWrapUp` in
`src/shared/learning/transitions.js` appends the missed Question to the
remaining ones and then shuffles the whole list, so the missed Question lands
first in about a third of seeds with three Concepts and is asked again as the
very next Question, right after its own feedback. Keep the missed Concept
behind every remaining Concept: shuffle only the remaining ones, or shuffle
and then rotate the missed one to the end.

**Reproduction:** `deno task audit:phone`. Failing check:

- `wrap-up · a missed Concept is never re-asked immediately (200 seeds, three
  Concepts)` — `expect(immediate).toEqual([])` received 68 seeds, including
  3, 5, 6, 10 and 11.

Pure reproduction:

```js
import { advanceWrapUp } from "./src/shared/learning/transitions.js";
advanceWrapUp({ queue: ["missed", "b", "c"], correct: false, seed: 3 }).queue[0]; // "missed"
```

The browser walk in the same run recorded the missed Concept returning as
Wrap-up Question 2 of 4, directly after being missed as Question 1.

**Blocked by:** None.

**Status:** done de1242e

- [x] With two or more Concepts remaining, the missed Concept is never the
      next Question.
- [x] The unit test in `tests/shared/learning_test.ts` asserts the missed
      Question is last for several seeds.
- [x] The audit check above passes in `deno task audit:phone`.

## Verification

```bash
deno task audit:phone
deno task test
```

## Report

Changed `advanceWrapUp` in `src/shared/learning/transitions.js`: on a miss it shuffles only
`queue.slice(1)` with `seed + queue.length` and appends the missed Question after them. With
one Concept remaining the queue is `[remaining, missed]`; with none it is `[missed]`.

New unit test in `tests/shared/learning_test.ts`: for seeds 0 to 49 with four Questions the
missed one is last and the other three are a permutation of the remaining ones; the two- and
one-Question edge cases are asserted exactly. `deno task test`: 109 passed, 0 failed.

Passing in `tests/audit/last-probes.md`:

```
- wrap-up · a missed Concept is never re-asked immediately (200 seeds, three Concepts)
- wrap-up requeue: 0 of 200 seeds re-ask the missed Concept as the very next Question
```

The browser walk observed: "The missed Concept came back as Wrap-up Question 4 of 4".

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
