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

**Status:** ready-for-agent

- [ ] Back on the correcting Card in the learning shell returns to the
      interrupted Question.
- [ ] On every other screen Back either moves to a documented prior surface or
      is not rendered as an enabled control.
- [ ] The five audit checks above pass or are updated to the documented
      behaviour in `deno task audit:phone`.

## Verification

```bash
deno task audit:phone
deno task check && deno task test && deno task e2e
```
