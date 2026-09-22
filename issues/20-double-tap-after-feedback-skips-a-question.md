# 20 — A double tap on the action after feedback skips an unseen Question

**What to build:** Action handlers must be idempotent against a second tap
that lands before the first re-render. Every handler in `public/js/learn.js`
and `public/js/drill.js` awaits IndexedDB writes before `nav.refresh()`
replaces the DOM, so the old button stays clickable for tens of milliseconds.
A second tap on "Try another from this concept" runs `advance()` against the
already-advanced flow, whose `feedback` is now `null`; `advance` treats a
missing feedback as a wrong answer and drops another Question from the queue.
The learner never sees that Question, and with one Question left the second
tap ends the Check or the Wrap-up outright.

Guard the handlers: ignore actions while one is in flight, or make each action
carry the flow it was rendered from and drop it if the flow has moved. The same
guard protects Continue on a Card, where a second tap would record `card_seen`
for a Card the learner never saw (the audit's card double tap happened to pass
because the second tap advanced on the same flow, but the code path is
unguarded).

**Reproduction:** `deno task audit:phone`. Failing check:

- `double-tap · Try another after feedback moves to exactly the next unseen
  Question` — `expect(after.queue.length).toBe(before.queue.length - 1)`
  expected `2`, received `1`.

The probe answers the first Concept Check wrongly, then dispatches two
`click()` calls on `[data-action="advance"]` in one task. Manual: on a phone,
double-tap "Try another from this concept" and count the Questions asked.

**Blocked by:** None.

**Status:** done (see commit below)

- [x] Two taps within one render cycle on any learning or drill action have
      the effect of one tap.
- [x] A unit or e2e test dispatches two synchronous clicks on the feedback
      action and asserts the queue shrank by exactly one.
- [x] The audit check above passes in `deno task audit:phone`; `deno task
      check`, `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task audit:phone
deno task check && deno task test && deno task e2e
```

## Report

### What changed

`public/js/learn.js` and `public/js/drill.js` wrap every bound action and
answer in `once()`: a module-level in-flight flag drops any tap that lands while
a handler is still awaiting IndexedDB writes and the re-render, and each render
also captures the flow it was rendered from (`live()`), so a click on a button
from a DOM that has since been replaced does nothing. The guard covers Continue,
Answer, I don't know, MCQ options, Try another / Continue after feedback, the
corrective detour, Return, Back and Close in both shells. No handler or flow
function changed; `advance()` is never reached with a moved flow.

Test: `tests/e2e/double_tap_test.ts` dispatches two synchronous clicks on
Continue (one Card forward, one `card_seen`), on the feedback action after a
wrong answer (checkpoint queue shrinks by exactly one, feedback cleared, a
different Question on screen) and on an MCQ option (exactly one more
`question_answered`).

### Ticket checks

```
- double-tap · Try another after feedback moves to exactly the next unseen Question   PASS
- double-tap · Continue on Card 1 advances one Card and marks only Card 1 Seen        PASS
```
### Verification

`deno task audit:phone` (both audit tests still exit non-zero because of checks
owned by tickets 18, 19, 22, 23 and 24; every check named by this ticket passes):

```
Adversarial probes: 18 passed, 3 failed, 4 observations
  Failed (other tickets): keyboard · Enter in the answer field submits the answer (24);
    wrap-up · a missed Concept is never re-asked immediately (22);
    options · MCQs in one Concept Check attempt do not all share one option permutation (23)
Learning loop walk: 305 passed, 8 failed, 5 observations
  Failed (other tickets): 6 × visual · … · bottom safe-area padding (18);
    2 × visual · overview … · every control is at least 44px (19, "Back to shelf" is 29px)
```

```
deno task check   -> ok (exit 0)
deno task test    -> ok | 110 passed | 0 failed
deno task e2e     -> ok | 8 passed | 0 failed
```

### Audit helper fix (asked for by the coordinator)

`tests/audit/support.ts` `projection()` looked up records by the bare ids
`checkpoint` and `progress`, but since ticket 08 the app keys projections per
revision and epoch (`checkpoint:<revisionId>:<epoch>`). Every projection read
returned null, which made seven walk checks vacuous or fail with "Cannot read
properties of null". The helper now matches the bare name as a prefix and takes
the newest epoch. Making the helper real exposed two audit expectations that
compared derived projections across a projection-clearing reload on the shelf,
where no lesson session exists to rebuild them: `reloadSame` now skips the
checkpoint comparison on the shelf, and the two drill snapshot checks compare
the immutable event streams byte for byte and the projections whenever the
earlier snapshot had them (`expectSameEvidence`). Nothing in the app changed
for these; the checkpoint is rebuilt from `navigation_events` when the lesson
opens, exactly as before.
