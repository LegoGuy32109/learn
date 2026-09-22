# 15 — Verify cross-device sync

**What to do:** Try to lose or duplicate progress. Use two or three isolated
browser contexts for one account against a local server on an ephemeral
`learn-test-<uuid>` database that you create and delete. Report defects as new
ticket files. Do not fix anything.

Scenarios:

- A learns online, B resumes at A's exact Card, then A's exact submitted
  feedback screen.
- A and B both offline complete different Concepts, reconnect in each order.
  The union has every event once and both show both Concepts.
- A and B both offline answer the same Wrap-up Question differently, reconnect.
  Learned is never lost. The checkpoint chosen is the one with the larger
  frontier, and the tie breaker is deterministic when frontiers are equal.
- A discards progress. B, offline with old-epoch events, reconnects. Its events
  are rejected and B shows the discard, not a resurrection.
- The server drops every request for a full lesson. The device finishes,
  shows Sync failed, and the outbox holds every event. The server returns and
  everything syncs once.
- A delayed stale checkpoint arrives after newer progress on both devices.
  Neither moves backward.
- Kill the tab mid-upload after the server has accepted the batch. Reopen. No
  duplicate on the server, nothing stuck in the outbox.

Inspect the database directly after each scenario: event counts, epochs, and
that no navigation event references a smaller frontier than the one chosen.

**Blocked by:** 10 — Client progress sync.

**Status:** done 29a4566

- [x] Every scenario is a Playwright test the swarm can rerun, with the
      database assertions inline.
- [x] The ephemeral database is created before and deleted after, including on
      failure, and the report shows its name and its deletion.
- [x] Every defect is a ticket file with a reproduction.

## Report

### What was built

`tests/db-sync/cross_device_sync_test.ts`: one `Deno.test` with a `t.step` per
ticket scenario (scenario 2 runs as two steps, one per reconnect order), plus
a final "invariant sweep" step. It is kept out of `tests/db/` (and out of the
`test:db` task's glob) because it needs Playwright's `--allow-all`, wider than
`test:db`'s `--allow-env --allow-net --allow-read --allow-run`; `test:db`
itself is untouched. A new `deno task test:sync` task in `deno.json` runs it:

```bash
deno task test:sync
# deno test --env-file=.env --allow-all tests/db-sync
```

One ephemeral `learn-test-<uuid>` database is created for the whole suite (not
one per scenario, to pay Turso provisioning cost once) and destroyed in
`finally`, including on failure — verified by intentionally triggering a
failure mid-suite during development and confirming `ephemeral.destroy()`
still ran and the Turso API showed no leftover `learn-test-*` database
afterward. Each scenario creates its own Lesson (`freshLesson`, a
scenario-unique title so `createLesson`'s fingerprint dedupe never folds two
scenarios together) so their progress streams cannot cross-contaminate. A
real HTTP server (`Deno.serve` + `createApp(tursoDependencies(db, clock))`)
serves two or three isolated Playwright browser contexts at the phone
viewport, all signed in as the same account via the session-cookie trick
`tests/e2e/sync_test.ts` already uses. Every scenario queries the ephemeral
database directly afterward (`progress_events`, `navigation_events`,
`progress_streams`, and `TursoProgressRepository.all` fed through
`selectCheckpoint` to replay the checkpoint rule against the raw rows, not
just trust the `/checkpoint` route) rather than only asserting on the UI.

Each of the ticket's scenarios became a step:

1. A learns online (reads one Card, continues to a second, then answers a
   Question); B resumes at A's exact Card, then — after A submits an answer —
   at A's exact feedback screen.
2. A and B both go offline and each completes a different Concept; run twice,
   once reconnecting A first and once B first. The server's raw
   `progress_events` union has every learning event exactly once either way.
3. A and B both offline answer the same Wrap-up Question differently, then
   reconnect: both answers are kept (Learned never lost). A raw equal-frontier
   tie between two constructed checkpoints is pushed directly and the
   deterministic tie breaker (later `occurredAt`, then greater event id) is
   asserted both via the served `/checkpoint` route and by replaying
   `selectCheckpoint` over the raw rows pulled through
   `TursoProgressRepository`.
4. A creates real progress on a Lesson Revision, a second revision is
   created server-side, A discards through the real UI flow (Outdated badge,
   confirm, `discardAndStart`). Meanwhile B is offline holding old-epoch
   events; on reconnect its push is refused (`409 epoch.stale`), the UI shows
   the "Discard here" banner (`#sync-discard`), and the raw
   `progress_events` row count for the old epoch is asserted unchanged by B's
   refused push before and after. Only clicking "Discard here" moves B
   forward, landing on Not started with no resurrection.
5. With every `/api/v1/progress/**` request answering 500, the device
   completes the *whole* lesson to the Learned summary and shows "Sync
   failed"; the outbox holds every learning and navigation event generated.
   The server then returns and one sync drains everything; raw row counts for
   both tables equal the outbox's counts exactly (no duplicates from retried
   batches).
6. A stale checkpoint (an empty frontier, a clock stamped an hour in the
   future) is pushed after both devices independently reached the Learned
   summary through real play. The served checkpoint is unchanged, the stale
   event is stored, and replaying the raw rows through `selectCheckpoint`
   still returns "summary". Both devices, reopening afterward, still resume
   at Learned.
7. A `page.route` intercept on `learning-events` replays the exact POST body
   against the server directly (independent of Playwright's `route.fetch()`,
   whose promise never settles while a route is left unfulfilled) so the
   server genuinely stores the batch, then never fulfills the route so the
   page's own `fetch()` never resolves; the tab (page, not the whole browser
   context, so IndexedDB survives) is closed once the direct replay confirms
   the server stored it. A fresh page in the same context reopens the lesson;
   every learning and navigation event this device held locally ends up with
   exactly one row server-side, and the local outbox ends empty.

An "invariant sweep" step, after every scenario has run, walks every
`(lessonRevisionId, epoch)` pair this account touched and asserts no
`navigation_checkpointed` event in that scope depends on strictly more
accepted learning evidence than the one the shared `selectCheckpoint` rule
actually serves — the literal "no navigation event references a smaller
frontier than the one chosen" check the ticket asks for, run once over
everything rather than duplicated per scenario.

### Verification

```bash
deno task check && deno task test && deno task test:db
```

exited 0 (150 passed in `test`; 4 passed / 25 steps in `test:db`, including
`tests/db/progress_sync_test.ts`'s own ephemeral-database progress sync
coverage from ticket 10, untouched).

```bash
deno task test:sync
```

```text
Task test:sync deno test --env-file=.env --allow-all tests/db-sync
running 1 test from ./tests/db-sync/cross_device_sync_test.ts
cross-device sync, verified adversarially against an ephemeral database ...
ephemeral database created: learn-test-487ad20d-085f-403a-9c13-d7dd8c0d0939
  1. A learns online, B resumes at A's exact Card, then at A's exact submitted feedback screen ... ok (8s)
  2. A and B both offline complete different Concepts, reconnect A then B ... ok (13s)
  2. A and B both offline complete different Concepts, reconnect B then A ... ok (11s)
  3. A and B both offline answer the same Wrap-up Question differently; Learned is never lost and the checkpoint follows the larger frontier, with a deterministic tie breaker ... ok (10s)
  4. A discards progress; B, offline with old-epoch events, reconnects and is rejected, not resurrected ... ok (8s)
  5. The server drops every request for a full lesson: the device finishes, shows Sync failed, the outbox holds every event, and the server returns to sync once with nothing duplicated ... ok (4s)
  6. A delayed stale checkpoint arrives after newer progress on both devices; neither moves backward ... ok (11s)
  7. Kill the tab mid-upload after the server has accepted the batch: reopening shows no duplicate and an empty outbox ... ok (4s)
  invariant sweep: the served checkpoint always has the largest accepted frontier in its scope ... ok (1s)
ephemeral database deleted: learn-test-487ad20d-085f-403a-9c13-d7dd8c0d0939
cross-device sync, verified adversarially against an ephemeral database ... ok (1m16s)

ok | 1 passed (9 steps) | 0 failed (1m16s)
```

The one `BadResource: Cannot read body as underlying resource unavailable`
line logged during scenario 7 is the server's generic 500 handler reacting to
the tab being killed mid-request — exactly the documented, accepted behavior
ticket 10's report already noted under "Noted, not fixed" ("a disconnected
client, not a failure"), reproduced here on purpose, not a new defect.

Re-run twice more back to back with the same result (no flakiness observed)
before this report was written.

### Defects found

None confirmed. One suspected defect was investigated and ruled out: an
earlier version of scenario 1 asserted on `.qhead` after B's second resume
and failed, reproducibly, across three separate runs. Before filing it,
I compared the server's own `/api/v1/progress/checkpoint` response (queried
at the moment of failure) against what B's page actually showed: the
checkpoint's `feedback.text` matched B's on-screen feedback text exactly, and
the frontier equaled the account's full learning-event count. B *was* showing
A's exact submitted feedback screen — my assertion was wrong, not the
product: once a checkpoint carries feedback, `src/client/learning/views.js`
renders the feedback view instead of the question head, so `.qhead` is
correctly absent from the DOM at that point. Fixed the assertion to check the
feedback text instead of `.qhead`; scenario 1 has passed consistently since.

### Decisions

- One ephemeral database for the whole suite, not one per scenario in
  `t.step`, to pay Turso provisioning latency once (~15-20s) instead of
  seven times, while still keeping every scenario's data isolated by giving
  each scenario its own Lesson.
- Scenario 7's "kill the tab" is a page close, not a context close — a
  Playwright browser context's IndexedDB lives with the context, not the
  page, so closing only the tab and reopening a new page in the *same*
  context is what actually exercises "outbox survives, reopen resumes it,"
  matching a real tab crash/reload rather than a full app reinstall.
- Scenario 7 replays the intercepted POST with Deno's own `fetch()` rather
  than Playwright's `route.fetch()`: the latter's returned promise does not
  settle while the route itself is left unfulfilled (needed here so the
  page's own `fetch()` never resolves), so relying on it to confirm
  server-side storage deadlocks the test. A direct `fetch()` to the same
  origin, outside Playwright's request-interception machinery, proves the
  server stored the batch without that deadlock.
- Scenario 4's "outdated" flow needed a second Lesson Revision that exists
  only server-side (created directly via `TursoLessonRepository.createRevision`,
  not through the API) so A's shelf refetch discovers a newer revision than
  the one it has progress on — this is the same mechanism `docs/api-v1.md`
  describes for the shelf's Outdated badge, exercised end to end through the
  real discard UI (`public/js/overview.js`'s confirm step, not a shortcut).
- A `GET /` on this ephemeral database would 500 (`No published lesson
  revision is available`, from `TursoLessonRepository.featured()`, which the
  page shell always calls for its first paint) unless at least one Lesson
  Revision is published, so `freshLesson()` publishes its revision directly
  via SQL, mirroring what `scripts/seed-demo.ts` does for a real deployment.
- Reopening a lesson via `page.goto()` to the exact URL the page is already
  on preserves that history entry's `history.state` (a real browser
  behavior: it reloads the existing entry rather than creating a fresh one),
  so a device with an in-progress `learn` surface skips the overview
  entirely on such a reload. Every scenario that needs to observe the
  overview (to click Resume, or see the Outdated badge) instead reopens via
  the shelf (`openLesson`: navigate to `/`, click the lesson tile), matching
  how `tests/e2e/sync_test.ts` already does it and how a real user would
  reopen a lesson from their shelf.

### Not fully verified

- Scenario 7's race (server stores the batch, then the tab dies before the
  client learns that) is deterministic here because the test's route handler
  explicitly waits for its own direct replay to finish before closing the
  page, rather than racing a real dropped connection against the browser's
  own in-flight fetch. This proves the idempotency and outbox-recovery
  invariants the scenario cares about, but does not reproduce the literal
  network timing of a phone losing signal mid-response.
- Load and true concurrency (many simultaneous devices, high event volume)
  are out of scope for this ticket and were not exercised; every scenario
  here uses two or three devices and small event counts.
