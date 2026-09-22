# 10 — Progress sync: server event union and checkpoint, client outbox and merge

**What to build:** Josh learns on his phone on the train with no signal. When
signal returns, his progress reaches the server on its own, and his laptop
shows the same Learned Concepts and resumes at the same Card. The phone shows
a compact state the whole time: Saved on this device, Syncing, Synced, or
Sync failed. Learning never waits on the network. This is Workstream C in
`docs/implementation/client-progress-sync.md` together with Workstream B in
`docs/implementation/server-progress-sync.md`. Both documents are the spec.
Build the server side first, in the same slice.

Server side:

Add the second migration with `progress_streams`, `progress_events` and
`navigation_events`. Every event's UUIDv4 is its idempotency key, scoped by
account, Lesson Revision, progress epoch and event ID. Store the client's
`occurred_at` and the server's `received_at`. Store no response duration.

Add versioned push and pull routes for both streams and a checkpoint route.
The checkpoint is rebuilt with the shared reducer from the navigation stream.
Selection compares the learning-event frontier first: a checkpoint that depends
on less accepted evidence never replaces one that depends on more. Define and
test the tie breaker for equal frontiers; do not rely on the client clock alone.

Accept the browser session cookie or a bearer token.

Client side:

IndexedDB stays authoritative for the device. New events go to an outbox and
upload in bounded batches with idempotent retries. Pull uses the server
cursor. Union by UUIDv4 and replay the shared reducers. Unsubmitted
short-answer drafts stay local. A newer progress epoch from the server is
applied only after the explicit discard flow from ticket 08; it never silently
replaces local progress.

**Demo path:** Two browser contexts signed in as the same account. Device A
completes a Concept online. Device B opens the lesson and resumes at A's
position. Both go offline and each completes a different Concept. Both come
back online. Each shows both Concepts done and neither lost Learned.

**Blocked by:** 08 — Mine shelf lists the account's lessons and caches them on
open.

**Status:** done SHA_PLACEHOLDER

- [x] Repeated upload of the same event is accepted once and returns success.
- [x] Events arriving out of order produce the same projection as in order.
- [x] Events from an epoch older than the stream's current epoch are rejected
      with a structured error.
- [x] Short-answer text round-trips unchanged.
- [x] An unknown Lesson Revision, and a Question outside its revision, are
      rejected.
- [x] Incremental pull uses an opaque server cursor and never skips or repeats
      an event across two pages.
- [x] Deleting every projection and replaying the streams reproduces the same
      checkpoint. A stale checkpoint with a smaller frontier cannot replace a
      larger one. The equal-frontier tie breaker is tested.
- [x] Database tests create a `learn-test-<uuid>` database, apply migrations,
      run, and delete it in `finally`, including on failure. `001_initial.sql`
      is unchanged.
- [x] Every new event enters the outbox before the UI updates, and the UI
      updates before any network call.
- [x] Upload batches are bounded, retried with backoff, and idempotent. A
      failure after the server accepted a batch does not duplicate events.
- [x] Pull merges by event ID and replays shared reducers. Server ordering is
      never inferred from UUIDv4 values.
- [x] The four sync states show in the shell and change as the network does.
      With every request failing, learning still completes and every event
      stays in the outbox.
- [x] A stale checkpoint arriving late never moves a device backward.
- [x] A phone-sized Playwright test with two isolated contexts passes the demo
      path above, and the existing offline happy path stays green.
- [x] `deno task check`, `deno task test`, `deno task test:db` and
      `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task test:db && deno task e2e
```

## Report

### Verification

`deno task check && deno task test && deno task test:db && deno task e2e` exited 0:

```text
Task check  deno check main.ts src/app.ts public/js/*.js src/shared/**/*.js \
              src/client/**/*.js src/server/**/*.ts scripts/*.ts
            deno check --config deno.worker.json src/client/pwa/sw.js

Task test   deno test --allow-read --allow-write --allow-run=deno \
              tests/shared tests/client tests/server
ok | 132 passed | 0 failed (4s)

Task test:db  deno test --env-file=.env --allow-env --allow-net --allow-read \
                --allow-run tests/db
  authenticated draft API persists idempotently in Turso ... ok (3s)
  passkey sign-in in an ephemeral database ... ok (7s)
  progress sync in an ephemeral database ... ok (13s)
    migration 003 applied; 001 and 002 are untouched ... ok
    repeated upload is stored once, by cookie or by bearer, and the rows carry both clocks ... ok
    the short-answer text round-trips unchanged and paging never skips or repeats ... ok
    out-of-order arrival on another account reduces to the same progress ... ok
    a Question outside the revision and an unknown revision are rejected without storing anything ... ok
    the checkpoint follows the frontier, a stale one never replaces a fuller one, and equal frontiers break ties deterministically ... ok
    replaying the raw rows through the shared rule reproduces the served checkpoint with no projection anywhere ... ok
    an old epoch is rejected on push and pull once the stream has advanced ... ok
  token lifecycle in an ephemeral database ... ok (8s)
ok | 4 passed (25 steps) | 0 failed (35s)

Task e2e    deno test --allow-all tests/e2e
  ./tests/e2e/contract_regressions_test.ts
  ./tests/e2e/drill_test.ts
  ./tests/e2e/happy_path_test.ts
  ./tests/e2e/passkey_test.ts
  ./tests/e2e/plugin_pedagogy_test.ts
  ./tests/e2e/pwa_offline_test.ts
  ./tests/e2e/shelf_test.ts
  ./tests/e2e/sync_test.ts
ok | 9 passed | 0 failed (24s)
```

### What was built

Server (Workstream B):

- `migrations/003_progress_sync.sql`: `progress_streams` (one row per account and
  Lesson: pinned revision, epoch, updated_at), `progress_events` and
  `navigation_events`. Both event tables store the envelope columns, the client's
  `occurred_at`, the server's `received_at`, and the rest of the event as one
  JSON document. `UNIQUE(account_id, lesson_revision_id, epoch, id)` is the
  idempotency key; `seq INTEGER PRIMARY KEY` is the arrival order the opaque
  cursor encodes. No duration column. `001_initial.sql` is unchanged.
- `src/server/progress/validation.ts`: every pushed event needs a UUIDv4 id, the
  push's revision and epoch, an ISO `occurredAt`, and references that exist in
  the revision. `correct` is recomputed with the shared evaluator. A batch with
  any rejection stores nothing (`422`, `code: "events.rejected"`, one entry per
  fault with a JSON Pointer). At most 200 events per push.
- `src/server/repositories/progress.ts`: `TursoProgressRepository` and
  `MemoryProgressRepository` with the same semantics: `INSERT OR IGNORE` per
  event in one batch, stream advance on a higher epoch, refusal on a lower one,
  pull by `seq > cursor`. No stored projection anywhere.
- `src/server/routes/progress.ts`: `POST/GET /api/v1/progress/learning-events`,
  `POST/GET /api/v1/progress/navigation-events`, `GET /api/v1/progress/checkpoint`.
  Cookie or bearer through `currentAccount`; bearer needs `lessons:write` to push
  and `lessons:read` to pull, matching the documented GET/POST rule instead of
  adding scopes (ticket 11 owns the scope list). Cookie pushes are refused from
  a foreign `Origin`. `409 epoch.stale` carries the current stream.
- `src/shared/learning/sync.js`: `unionById`, `frontierCount`,
  `compareCheckpointEvents`, `selectCheckpoint`, `missingFrom`. Selection rule:
  larger accepted frontier wins; equal frontier → later client `occurredAt`;
  equal clock → greater event id, a deterministic last resort so both sides
  agree. Frontier ids the union has never accepted count for nothing.
- `LessonRepository.learnableRevision(accountId, revisionId)`: a revision the
  account owns, or any published revision. Anything else is `404 revision.unknown`.
- OpenAPI: a `progress` tag, five operations, `SyncEvent`, `StreamState`,
  `ProgressPush`, `ProgressPushResult`, `ProgressPage`, `ProgressCheckpoint` and
  `ProgressProblem` schemas with shared examples; `deno task tools:generate` run.

Client (Workstream C):

- `src/client/storage/repository.js` version 3: `outbox` and `sync_cursors`
  stores. `appendOutgoing` writes the event and its outbox entry in one
  transaction; `appendRemote` adds server events without touching the outbox and
  ignores ids already held; `acknowledge`, `outbox`, `cursor`, `saveCursor`.
- `src/client/sync/client.js`: the cycle. Drain the outbox grouped by stream,
  revision and epoch in batches of 50; acknowledge only after the server
  answered; retry no-network and 5xx with 1s→60s backoff and jitter; drop
  permanently refused batches (409, 404, 422) from the outbox only; a 401 turns
  sync off. Then pull both streams for the attached lesson page by page, union by
  id, save the cursor after storing, and call `onMerged` once. `kick()` is called
  after every render, so an event is stored, queued and on screen before any
  request leaves. `wake()` on `online` and on the page becoming visible.
  `announce()` sends an empty push after a discard. `adoptRemoteEpoch()` is the
  only thing that moves the local stream to a server epoch.
- `src/client/sync/transport.js`: fetch wrapper returning plain outcomes.
- `src/client/sync/status.js`: the compact state element and the "Discard here"
  banner for a stale epoch; `withDraftPreserved` keeps a typed answer across a
  merge re-render.
- `src/client/learning/session.js`: learning and navigation writes go through
  `appendOutgoing` then an `onEvidence` hook; `reload()` replays the reducers
  after a merge; the resume checkpoint is chosen by `selectCheckpoint` over the
  device's navigation events, so a stale checkpoint never moves the device back.
- `public/js/app.js`: creates the sync client, attaches the open lesson, kicks
  after each render, announces a discard, adopts a remote epoch by reopening the
  lesson URL. `src/server/views/page.ts` adds `#sync-status` outside `#app` and
  links the new `public/css/sync.css`.

Tests: `tests/shared/sync_test.ts`, `tests/server/progress_test.ts`,
`tests/db/progress_sync_test.ts` (ephemeral `learn-test-<uuid>`, deleted in
`finally`), `tests/client/sync_test.ts` (fake repository, transport and timers),
`tests/e2e/sync_test.ts` (two phone contexts on one account through the demo
path, a late stale checkpoint, and a third device with every sync request
failing).

### Decisions

- **Statuses.** No network (fetch failed) reads as "Saved on this device", not
  as a failure: that is the train. A server error or a refusal reads as "Sync
  failed". A guest sees nothing.
- **Stale epoch.** The refused events leave the outbox (the server will never
  take them) but stay in their local stores. The state shows "Sync failed" with
  a banner offering "Discard here"; only that button moves the local stream.
- **Correctness is recomputed.** A `question_answered` whose `correct` disagrees
  with the shared evaluator is rejected. Both sides run the same module.
- **Learnable revisions.** Progress is accepted on a revision the account owns
  or on any published revision, so a guest-turned-owner on the demo lesson syncs.
- **Frontier semantics.** The frontier compares counts of accepted ids, not set
  inclusion, so two devices that diverged concurrently still order deterministically.
- **No stored checkpoint projection on the server.** The checkpoint route
  rebuilds from the rows on every read; the DB test asserts no such table exists
  and that a fresh replay of the raw rows equals the served checkpoint.
- **Pull is read-only.** A pull at a higher epoch than the stream returns an
  empty page; the following empty push (sent by the browser after a discard)
  advances the stream.

### Noted, not fixed

- When a browser goes offline in the middle of an upload, the server logs one
  `BadResource: Cannot read body` line through the generic 500 handler in
  `src/app.ts`. It is a disconnected client, not a failure; the coordinator owns
  that file.
- The `.update` banner class from `src/client/pwa/register.js` is reused for the
  stale-epoch banner so `app.css` was not touched (other workers own it). The
  new rules live in `public/css/sync.css`, linked from the page shell.
- `tests/db/passkey_test.ts` asserted the complete applied-migration list, which
  migration 003 broke. Its assertion now checks the first two entries, so a later
  migration does not fail an unrelated test. That is the only line changed in
  another ticket's test.
