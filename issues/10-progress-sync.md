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

**Status:** ready-for-agent

- [ ] Repeated upload of the same event is accepted once and returns success.
- [ ] Events arriving out of order produce the same projection as in order.
- [ ] Events from an epoch older than the stream's current epoch are rejected
      with a structured error.
- [ ] Short-answer text round-trips unchanged.
- [ ] An unknown Lesson Revision, and a Question outside its revision, are
      rejected.
- [ ] Incremental pull uses an opaque server cursor and never skips or repeats
      an event across two pages.
- [ ] Deleting every projection and replaying the streams reproduces the same
      checkpoint. A stale checkpoint with a smaller frontier cannot replace a
      larger one. The equal-frontier tie breaker is tested.
- [ ] Database tests create a `learn-test-<uuid>` database, apply migrations,
      run, and delete it in `finally`, including on failure. `001_initial.sql`
      is unchanged.
- [ ] Every new event enters the outbox before the UI updates, and the UI
      updates before any network call.
- [ ] Upload batches are bounded, retried with backoff, and idempotent. A
      failure after the server accepted a batch does not duplicate events.
- [ ] Pull merges by event ID and replays shared reducers. Server ordering is
      never inferred from UUIDv4 values.
- [ ] The four sync states show in the shell and change as the network does.
      With every request failing, learning still completes and every event
      stays in the outbox.
- [ ] A stale checkpoint arriving late never moves a device backward.
- [ ] A phone-sized Playwright test with two isolated contexts passes the demo
      path above, and the existing offline happy path stays green.
- [ ] `deno task check`, `deno task test`, `deno task test:db` and
      `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task test:db && deno task e2e
```
