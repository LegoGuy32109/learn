# 21 — The square Back control does nothing on Questions, feedback, the correcting Card and later first Cards

**What to build:** `docs/first-milestone.md` says the square Back action moves
backward when a prior surface exists. In the learning shell it is rendered,
enabled and styled on every screen, but `stepBack()` only acts on
`screen === "card"` with `cardIndex > 0`. On these screens a tap changes
nothing and gives no feedback:

- an unanswered Concept Check or Wrap-up Question;
- wrong-answer or correct feedback;
- the correcting Card opened from feedback (the drill surface handles this
  case by returning to the Question; the learning surface does not);
- the first Card of Concept 2 and 3, where the prior surface is the previous
  Check's feedback or the previous Concept's Cards.

Decide the behaviour per screen and implement it, or do not render an
enabled Back where it cannot act. At minimum, Back on the correcting Card in
the learning shell must return to the Question, matching drill and the
"Return to questions" action.

**Reproduction:** `deno task audit:phone`. Failing checks:

- `back · unanswered Concept Check Question · the square Back control does something when a prior surface exists`
- `back · wrong-answer feedback · the square Back control does something when a prior surface exists`
- `back · correcting Card in the learning shell · the square Back control does something when a prior surface exists`
- `back · correcting Card · Back returns to the Question it interrupted, as it does in drill` — expected verdict `Not quite`, received `null`.
- `back · first Card of Concept 2 · the square Back control does something when a prior surface exists`

Each captures the DOM signature, taps `[data-action="back"]`, and asserts the
signature changed. Code: `src/client/learning/flow.js` `stepBack()`,
`public/js/learn.js` `goBack()`.

**Blocked by:** None.

**Status:** done 9d309ee

- [x] Back on the correcting Card in the learning shell returns to the
      interrupted Question.
- [x] On every other screen Back either moves to a documented prior surface or
      is not rendered as an enabled control.
- [x] The five audit checks above pass or are updated to the documented
      behaviour in `deno task audit:phone`.

## Verification

```bash
deno task audit:phone
deno task check && deno task test && deno task e2e
```

## Report

### Behaviour per screen (decided and implemented)

`src/client/learning/flow.js` `stepBack(lesson, flow)` now moves on every screen:

- **Correcting Card**: returns to the Question it interrupted, with its feedback,
  exactly as drill and "Return to questions" do (`leaveCorrective`).
- **Question, answered or not (Check and Wrap-up)**: looks back at the last Card
  of the Question's Concept. The look-back is a detour like the correcting Card:
  it remembers the flow it started from, Back keeps paging through that
  Concept's Cards, and Continue on the last Card returns to the Question (or the
  feedback) instead of opening a new Check. Progress never reverses.
- **First Card of Concept 2 or 3**: looks back at the last Card of the previous
  Concept the same way; Continue there returns to the first Card of the current
  Concept, so the previous Check is never re-run.
- **Card 2 and later**: the previous Card, as before.
- **First Card of Concept 1 and the Learned summary**: no prior surface inside
  the lesson; the shell leaves for the overview on the same history entry
  (`leavesShellOnBack`). The summary's Back was dead before.

Looking back is inspection: `goBack()` moves the flow in memory only and never
saves the checkpoint, so a reload comes back at the canonical position. A
look-back never nests (an open detour is kept), and it records no `card_seen`
because every Card it can reach was already seen. The look-back reuses the
ordinary Card screen (no "Correcting card" notice, footer is Back and
Continue), so `views.js`, `controls.js` and `app.css`, owned by the other
worker, were not touched.

Unit tests in `tests/client/flow_test.ts` cover every case above, including the
Wrap-up looking back at the Question's own Concept and feedback surviving a
look-back. The audit probe `deadBackControls` was extended to the documented
behaviour: after each Back it asserts the last Card of the Concept is shown,
taps Continue and asserts the signature is exactly what it was before Back, and
finally checks that looking back recorded no evidence and left the checkpoint
at Card 1 of Concept 2 with no detour.

### Ticket checks

```
- back · unanswered Concept Check Question · the square Back control does something …   PASS
- back · wrong-answer feedback · the square Back control does something …               PASS
- back · correcting Card in the learning shell · the square Back control does something PASS
- back · correcting Card · Back returns to the Question it interrupted, as it does in drill PASS
- back · first Card of Concept 2 · the square Back control does something …             PASS
+ 7 new checks: Back looks back at the last Card / Continue returns to where Back was tapped
  / looking back recorded no evidence and did not move the checkpoint                    PASS
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
