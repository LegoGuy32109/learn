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

**Status:** ready-for-agent

- [ ] Drill serves every Question in every Pool exactly once per run, in an
      order fixed by a persisted seed.
- [ ] Every answer gets feedback, and a wrong answer shows the belief and the
      clamped correcting Card, the same components as the learning flow.
- [ ] No learning event is written during drill. The shelf state and the
      learning checkpoint are identical before and after a full drill.
- [ ] Drill events and the drill checkpoint replay from their own stream after
      the projection is deleted.
- [ ] A phone-sized Playwright test completes a drill with a reload in the
      middle and asserts the shelf state did not change.
- [ ] `deno task check`, `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task e2e
```
