# 11 — Server progress sync: event union, cursor pull, canonical checkpoint

**What to build:** An authenticated client pushes its immutable learning and
navigation events and pulls everyone else's for the same account, and the
server can hand any device the exact resume position. This is Workstream B in
`docs/implementation/server-progress-sync.md`; that document is the spec.
Read it in full.

Add the second migration with `progress_streams`, `progress_events` and
`navigation_events`. Every event's UUIDv4 is its idempotency key, scoped by
account, Lesson Revision, progress epoch and event ID. Store the client's
`occurred_at` and the server's `received_at`. Store no response duration.

Add versioned push and pull routes for both streams and a checkpoint route.
The checkpoint is rebuilt with the shared reducer from the navigation stream.
Selection compares the learning-event frontier first: a checkpoint that depends
on less accepted evidence never replaces one that depends on more. Define and
test the tie breaker for equal frontiers; do not rely on the client clock alone.

Accept the browser session cookie from ticket 08 or a bearer token. Until 08
lands, test with the bearer token.

**Demo path:** With curl and the owner token, push three events, push the same
three again, pull from an empty cursor and see three, pull from the returned
cursor and see none, then fetch the checkpoint and see the position the events
imply.

**Blocked by:** 01 — Split the browser app and server routes into domain modules.

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
      run, and delete it in `finally`, including on failure.
- [ ] `deno task check`, `deno task test` and `deno task test:db` pass.

## Verification

```bash
deno task check && deno task test && deno task test:db
```
