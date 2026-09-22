# 09 — Every-question drill mode that never awards Learned

**What to build:** From a lesson's overview, Josh chooses "Every question" and
answers every Question in every Pool, reserved ones included, in a random
order, with full feedback and the correcting Card on each. Nothing he does in
drill changes Seen, Learned or the resume checkpoint. This is the plugin's
"Skip to every question" mode. It serves an author reviewing a lesson and a
returning learner re-testing without rereading Cards.

Drill records its own evidence stream, separate from learning events, so a
later publication-verification feature can read it. Its checkpoint is
replayable like the learning checkpoint: reloading mid-drill returns to the
same Question with the same order and the same feedback state. Leaving drill
returns to the overview with the learning checkpoint untouched.

The summary screen lists each Concept with what happened in drill and repeats
that drill does not earn Learned. No score, no percentage.

**Demo path:** Learn nothing, open the demo overview, choose Every question,
answer all nine, reload halfway and resume, finish, and see the shelf still
say Not started.

**Blocked by:** 02 — Lesson content follows the plugin model.

**Status:** done 8ef0dd7

- [x] Drill serves every Question in every Pool exactly once per run, in an
      order fixed by a persisted seed.
- [x] Every answer gets feedback, and a wrong answer shows the belief and the
      clamped correcting Card, the same components as the learning flow.
- [x] No learning event is written during drill. The shelf state and the
      learning checkpoint are identical before and after a full drill.
- [x] Drill events and the drill checkpoint replay from their own stream after
      the projection is deleted.
- [x] A phone-sized Playwright test completes a drill with a reload in the
      middle and asserts the shelf state did not change.
- [x] `deno task check`, `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task e2e
```

## Report

Implemented at 8ef0dd7 on `ticket/09`.

### Verification output

`deno task check` passed for every file (per-file `Check` lines omitted).
`deno task test` and `deno task e2e` output, trimmed to task headers, drill
tests and totals:

```text
Task check deno check main.ts src/app.ts public/js/*.js src/shared/**/*.js src/client/**/*.js src/server/**/*.ts scripts/*.ts
Task test deno test --allow-read --allow-write --allow-run=deno tests/shared tests/client tests/server
running 3 tests from ./tests/client/drill_flow_test.ts
a drill run starts on the first Question of the seeded order over every Question ... ok (945µs)
drill asks each Question once, wrong or not, and ends on the summary ... ok (597µs)
a wrong drill answer carries the belief and the correcting Card, and the detour returns to the same Question ... ok (394µs)
running 5 tests from ./tests/shared/drill_test.ts
the drill queue holds every Question in every Pool exactly once, reserved ones included ... ok (1ms)
the drill order is fixed by the seed and differs between seeds ... ok (124µs)
the drill checkpoint replays from the drill stream and a null checkpoint ends the run ... ok (6ms)
drill outcomes describe each Concept for one run without a score ... ok (305µs)
drill answers never move learning progress ... ok (197µs)
ok | 57 passed | 0 failed (487ms)
Task e2e deno test --allow-all tests/e2e
running 1 test from ./tests/e2e/drill_test.ts
drill asks every Question, resumes after a reload, and leaves the shelf Not started ... ok (2s)
ok | 4 passed | 0 failed (7s)
```

### What was built

- `src/shared/learning/drill.js`: pure `drillQueue` (every Question once,
  seeded), `reduceDrillCheckpoint`, `reduceDrill` (per-Concept outcomes for
  one run) and `describeOutcome`. `reduceCheckpoint` now takes the event type,
  defaulting to `navigation_checkpointed`, so both streams share one reducer.
- `src/client/learning/drill-flow.js`: `startDrill`, `advanceDrill`,
  `drillPosition`. Answering, feedback, belief and the corrective detour reuse
  `submitAnswer`, `buildFeedback`, `enterCorrective` and `leaveCorrective`
  from the learning flow unchanged.
- `src/client/storage/repository.js`: IndexedDB version 2 adds the
  `drill_events` store; the upgrade creates only missing stores.
- `src/client/learning/session.js`: drill events, drill flow and drill
  checkpoint are loaded and written beside the learning ones. `saveDrillCheckpoint`
  appends a `drill_checkpointed` event and the `drill_checkpoint` projection;
  `endDrill` appends a null checkpoint. Nothing in drill calls `recordEvent`
  or `saveCheckpoint`.
- `public/js/drill.js`: the drill surface at `/learn/<lesson-id>/drill`, using
  the shell header, a drill rail, `regionView`, `feedbackView`,
  `clampedCardView` and `footerView`. The summary lists each Concept.
- `public/js/overview.js`: the plugin's copy plus a quiet **Every question**
  action, reading **Resume every question** when a run is open.
- `public/js/app.js`: routes the drill surface and resumes it from its own
  checkpoint on boot. This is the only change outside the learning surfaces
  and shared modules; it adds one surface branch and one boot branch.
- `docs/domain-model.md`: a short Drill section.
- Tests: `tests/shared/drill_test.ts` (5), `tests/client/drill_flow_test.ts`
  (3) and `tests/e2e/drill_test.ts` (phone viewport, reload halfway with every
  projection deleted, shelf and learning stores compared before and after).

### Decisions

- The demo lesson has twelve Questions (three drawable and one reserved per
  Concept), so a drill asks twelve, not the nine the ticket text mentions. The
  ticket rule "every Question in every Pool, reserved ones included" wins.
- Closing an unfinished drill keeps its checkpoint, so the overview offers
  **Resume every question**. Finishing the run and leaving the summary writes
  a null drill checkpoint, which closes the run. Reloading at the drill URL
  with no open run falls back to the normal overview or learning resume.
- The summary line per Concept reads like "4 questions · 3 retrieved, 1 missed"
  or "... 1 unknown". These are outcome counts in words; no total, score or
  percentage is shown, and the e2e test asserts the word score and the percent
  sign are absent.
- Drill answer events carry `runId`, `conceptId`, `poolId`, `questionId`,
  `answer`, `idk` and `correct` so a later publication-verification feature can
  read a perfect randomized run from this stream.
- The Back control on a drill Question leaves for the overview; on the
  correcting Card it returns to the Question. Browser Back from drill returns
  to the overview.

### Not done

Nothing left out. No external service was needed.
