# 12 — Verify the learning loop on a phone viewport

**What to do:** Audit the learning flow independently, the way the Codex
session audited the first milestone: drive the running app with Playwright at
390 by 844, do not reuse the implementers' tests, and try to break the
contract. Report every defect as a new ticket file in the `issues` directory with a
reproduction script. Do not fix anything.

Walk the whole path from a fresh browser: shelf, overview, every Card, a wrong
answer in every Concept Check, "I don't know" in one, the corrective Card and
Return to questions, Back and close at the first learning step, browser Back,
every Wrap-up Question including a wrong one that returns later, and Learned.
Reload at every distinct surface and confirm the exact position, Question,
option order, retry queue and feedback state come back. Then run drill mode
end to end with a reload in the middle and confirm shelf state never changed.

Check the plugin rules that are not the author's to relax, from the plugin
`SKILL.md`: exactly three shared options per Concept, feedback on every option,
"I don't know" on every Question with no penalty, wrong answers re-asked from
an unseen Question, Learned only in the Wrap-up, never a score, streak,
difficulty, time estimate or the word mastery anywhere in the DOM.

Check the visual contract in `docs/first-milestone.md`: every control at least
44 pixels on its shortest side, no horizontal overflow, safe-area padding,
light and dark schemes, and "I don't know" contained away from the screen edge.

Attach `pageerror` and `console` listeners for the whole run. A blank panel is
a failure.

**Blocked by:** 02 — Lesson content follows the plugin model; 09 —
Every-question drill mode.

**Status:** done PENDING_SHA

- [x] The audit script lives under the tests directory as a phone-sized
      Playwright suite that the swarm can rerun, separate from the happy path.
- [x] Every surface has a reload assertion.
- [x] Every forbidden word and metric is asserted absent from the DOM at every
      surface.
- [x] Every defect found has its own ticket file with a reproduction and the
      failing assertion. The report lists passes and failures with counts.
- [x] Screenshots of each surface in light and dark schemes are attached to
      the report.

## Verification

```bash
deno task audit:phone
```

## Report

Audited on 2026-09-21 and 2026-09-22 on `ticket/12` against `696154d` (main
with tickets 02 and 09 merged). Nothing was fixed. Eight defects filed as
tickets 17 to 24.

### Audit suite

`deno task audit:phone` runs `tests/audit/`, separate from the happy path in
`tests/e2e/`. Two Playwright tests at 390 by 844, Chromium headless, with
`pageerror` and `console` listeners attached for the whole run:

- `learning_loop_phone_test.ts`: the full walk from a fresh browser. Shelf,
  overview, every Card, a wrong answer in Concept Check 1 with the corrective
  detour and Return to questions, "I don't know" in Check 2, three wrong
  answers exhausting Check 3, square Back and close and browser Back at the
  first learning step, Back inspection on Card 2, every Wrap-up Question with
  the first one wrong, Learned, then a drill after Learned and a full drill
  from a second fresh context with a projection-deleting reload halfway and a
  browser Back out and Resume back in. Every distinct surface gets the same
  battery: forbidden words absent from the whole `#app` DOM, "Question" not
  "Item", every visible control at least 44px on its shortest side, no
  horizontal overflow, "I don't know" at least 24px from either edge, bottom
  safe-area padding on the container, a non-blank panel, and a reload with
  every projection deleted that must reproduce the DOM signature (surface,
  URL, stem, option order, feedback verdict and text, belief, correcting Card,
  footer controls, rail widths, field value) and the rebuilt checkpoint
  (screen, queues, seed, attempt, feedback, detour). Sixteen surfaces are
  screenshotted in light and dark.
- `adversarial_probes_test.ts`: fresh-context probes. Double tap on Continue
  and on the feedback action, Enter in the answer field, blank Answer tap,
  the square Back on every screen where it is rendered, browser Back
  mid-lesson, reload on the overview of a Learned lesson, and two pure-rule
  probes over `advanceWrapUp` and `questionView`.

Failing checks are collected, not thrown, so one defect does not hide the
next. Each test writes its report to `tests/audit/last-run.md` and
`tests/audit/last-probes.md` and fails at the end when any check failed. The
answer key is derived from `fixtures/lessons/browser-http-cache.json`, not
from the implementers' `tests/e2e/support/demo.ts`.

### Counts

| Suite | Passed | Failed | Observations |
| --- | --- | --- | --- |
| Learning loop walk | 306 | 12 | 5 |
| Adversarial probes | 3 | 11 | 4 |
| Total | 309 | 23 | 9 |

Two consecutive full runs gave identical counts. No `pageerror` and no console
error or warning occurred in either test. No panel was blank at any surface.

### Passed, in summary

- Every reload at every surface (shelf, overview fresh, Card 1, Card 2,
  inspected Card 1 resuming at the canonical Card 2, unanswered Question,
  wrong feedback, corrective Card, retry Question, correct feedback, "I don't
  know" feedback, exhausted-Pool feedback, Wrap-up Questions 1 to 4, Wrap-up
  wrong and final feedback, Learned summary, shelf Learned, drill Question,
  drill wrong feedback, drill corrective Card, drill feedback and Question
  halfway, drill summary) reproduced the exact surface and the checkpoint
  rebuilt from the event stream after the projections were deleted, with the
  exceptions in ticket 17.
- Exactly three shared options on every MCQ, all from the Concept's set, with
  feedback keyed for all three; "I don't know" on every Question; "I don't
  know" recorded as `answer: null, correct: false`, shows the correct answer
  and the correcting Card, ends the Check and leaves progress state unchanged.
- Wrong answers re-asked from unseen Questions until the Pool was exhausted;
  Checks never drew a reserved Question; every Wrap-up Question was reserved
  and never shown by a Check; Learned awarded only by a correct Wrap-up
  answer; the missed Concept returned once more.
- `card_seen` recorded exactly once per Card; Back inspection recorded
  nothing and did not move the canonical checkpoint; the corrective detour
  recorded nothing; correct feedback never auto-advanced.
- Drill asked all twelve Questions once, reserved ones included, resumed the
  same Question after a projection-deleting reload and after browser Back
  plus Resume every question, summarised each Concept without a score or
  percent, and left learning events, navigation events, checkpoint and
  progress byte-identical from Not started and from Learned.
- No score, streak, difficulty, mastery, estimate or minutes anywhere in the
  `#app` DOM at any surface; no `%` in visible text; "Item" nowhere.
- Every control in the learning shell and drill at least 44px; no horizontal
  overflow at 390px anywhere; "I don't know" contained; light and dark render
  different backgrounds at every screenshotted surface; the action row sits
  above the clamped correcting Card on every wrong answer.

### Failed, mapped to tickets

| Ticket | Failing checks |
| --- | --- |
| 17 | reload · overview after Back from first Card; first step · reload after Back-to-overview; first step · browser Back leaves the URL at the shelf path; reload · shelf after browser Back from first Card; browser Back mid-lesson · URL names the surface; reload · overview of a Learned lesson |
| 18 | visual · bottom safe-area padding on page shelf (×4) and page overview (×2) |
| 19 | visual · overview · every control at least 44px (×2): "Back to shelf" is 30 by 29 |
| 20 | double-tap · Try another after feedback: queue shrank by 2 |
| 21 | back · unanswered Question, wrong feedback, correcting Card (×2), first Card of Concept 2 |
| 22 | wrap-up · a missed Concept is never re-asked immediately: 68 of 200 seeds |
| 23 | options · MCQs in one attempt do not all share one permutation |
| 24 | keyboard · Enter in the answer field submits |

### Observations, not filed

- The Learned summary shows "Concepts learned 3 of 3". It is a count that is
  always full at Learned, not a score, so it passed the forbidden-metric
  check. Worth a look if the wording is meant to avoid any numerator.
- Tapping Answer with a blank field is graded "Not quite" and recorded with
  `answer: ""`. The plugin renderer grades a blank field the same way, so it
  is parity, not a defect. A stray tap does cost an unseen Question.
- The overview of a Learned lesson offers "Resume", which reopens the Learned
  summary.
- The missed Wrap-up Concept is re-asked with the same reserved Question; a
  Pool reserves one, so no unseen Question exists for the Wrap-up retry. The
  domain model allows this.
- Browser Back from Card 2 twice leaves the learning shell on screen at `/`.
  Filed inside ticket 17.

### Screenshots

Thirty-two JPEGs in `tests/audit/screenshots/`, light and dark for each of:
shelf fresh, overview fresh, Card 1 of Concept 1, Check 1 unanswered Question,
Check 1 wrong feedback, Check 1 corrective Card, Check 1 correct feedback,
Check 2 "I don't know" feedback, Wrap-up Question 1, Wrap-up wrong feedback,
Learned summary, shelf Learned, drill Question 1, drill wrong feedback, drill
corrective Card, drill summary. They are regenerated on every run.

### Decisions

- Failures are collected rather than thrown so the whole path is walked in
  one run; the test still fails when any check failed, so the swarm can use
  it as a gate once the tickets land.
- The walk recovers after a reload lands on the wrong surface (ticket 17) so
  the remaining surfaces are still audited.
- The Wrap-up "returns later" rule is asserted deterministically over 200
  seeds in the probes rather than in the browser walk, because the browser
  seed is random and the browser assertion would be flaky either way.
- Option-order sharing is asserted at the `questionView` level for the same
  reason; the browser drill records it as an observation.
- One task, `audit:phone`, was added to `deno.json` so the suite can be rerun.
  No application file was changed.
- `issues/README.md` gained rows 17 to 24 in the order table.

### Not done

Nothing left out. No external service was needed.
