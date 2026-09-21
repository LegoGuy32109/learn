# 13 — Spaced review: due Concepts on the shelf, review flow, Retained

**What to build:** A few days after Josh learns a lesson, his shelf shows a
"Due today" section with a count. He taps it and answers one Question per due
Concept, drawn from that Concept's Pool, unseen first. A correct answer on a
due review marks the Concept Retained and pushes its next review out. A wrong
answer or "I don't know" pulls the next review in, and nothing moves backward.
When every Concept in a lesson has a `retained_at`, the lesson is Retained.
Review works offline and syncs like everything else.

Follow the settled rules in `docs/domain-model.md` and the interview:

- The FSRS unit is a Concept, not a Card or a Question.
- Correct maps to Good. Incorrect and "I don't know" map to Again. Hard and
  Easy are never exposed.
- Retained is set by the first successful review that was actually due. Later
  successes update `retained_at`. A failed review keeps the timestamp.
- A lesson's `retained_at` is the oldest current `retained_at` across its
  Concepts.
- Scheduling stops for an outdated revision.
- Store the algorithm version with every scheduling update.

One deterministic scheduler module, shared by browser and server, pure
JavaScript, default parameters, no training. Decide between vendoring the
`ts-fsrs` build as a browser module and writing a minimal FSRS implementation
against its published formulas. Record the decision and its reasoning in the
ticket report. The scheduling state is a projection over `question_answered`
events with a `review` flow kind, so deleting it and replaying reproduces it.

**Demo path:** Learn the demo lesson. Move the clock forward with a test hook.
See three due Concepts on the shelf. Answer two right and one wrong. See two
Concepts Retained, the third due sooner, and the lesson not yet Retained.

**Blocked by:** 09 — Mine shelf lists the account's lessons and caches them on
open; 12 — Client progress sync.

**Status:** ready-for-agent

- [ ] The scheduler module produces the same next-due date in the browser and
      on the server for the same inputs. A unit test asserts that.
- [ ] Review draws an unseen Question for the Concept when one exists, and
      otherwise the least recently asked.
- [ ] The shelf shows a Due today count and a review entry point only when a
      Concept is due. A lesson with no due Concepts shows none.
- [ ] Retained follows the rules above, including that a failure never clears
      `retained_at` and a not-yet-due success never sets it.
- [ ] Review events sync through the outbox from ticket 12 and both devices
      compute the same schedule after merge.
- [ ] Deleting the scheduling projection and replaying events reproduces it.
- [ ] A phone-sized Playwright test passes the demo path with the clock hook.
- [ ] `deno task check`, `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task e2e
```
