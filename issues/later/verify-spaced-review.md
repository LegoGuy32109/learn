# Later — Verify spaced review across simulated days

**What to do:** Drive the review system through weeks of simulated time and
try to make an achievement move backward or a due date disagree between
browser and server. Report defects as new ticket files. Do not fix anything.

Scenarios, using the clock hook ticket later/spaced-review adds:

- Learn the demo lesson. Nothing is due the same day. Advance to the first due
  date. Exactly the due Concepts appear, with a correct count.
- Answer a due review correctly. The Concept is Retained with `retained_at`
  equal to that answer's time. Advance and answer correctly again;
  `retained_at` moves forward, the interval grows.
- Answer a due review wrong. `retained_at` does not change, the next due date
  is sooner than before, and the shelf still shows the Concept Retained.
- Answer a review before it is due through a direct action if one exists. It
  does not set Retained.
- Retain two of three Concepts. The lesson is not Retained. Retain the third.
  The lesson's `retained_at` equals the oldest of the three.
- Publish a newer revision of the lesson. No new reviews are scheduled for
  the old one. Existing `retained_at` values remain.
- Review offline on one device, sync, and compute the schedule on another
  device and on the server. All three agree to the millisecond.
- Delete the scheduling projection and replay. Identical.

Confirm the review draw prefers unseen Questions and falls back to the least
recently asked. Confirm no Hard or Easy control exists in the DOM.

**Blocked by:** Later — Spaced review. Both are outside this stage.

**Status:** later — deferred with spaced review. Do not start.

- [ ] Every scenario is a rerunnable test with the clock hook.
- [ ] The browser-versus-server schedule comparison is asserted, not eyeballed.
- [ ] Every defect is a ticket file with a reproduction.
