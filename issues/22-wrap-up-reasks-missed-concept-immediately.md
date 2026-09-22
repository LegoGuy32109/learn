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

**Status:** ready-for-agent

- [ ] With two or more Concepts remaining, the missed Concept is never the
      next Question.
- [ ] The unit test in `tests/shared/learning_test.ts` asserts the missed
      Question is last for several seeds.
- [ ] The audit check above passes in `deno task audit:phone`.

## Verification

```bash
deno task audit:phone
deno task test
```
