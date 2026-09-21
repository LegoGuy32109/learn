# Workstream B: server progress sync

## Objective

Store the idempotent union of authenticated learning and navigation events in
Turso. Rebuild progress and exact resume state with the existing shared
reducers. Never make a stored projection the only source of truth.

## Owned files

- `migrations/002_progress_sync.sql`
- new `src/server/repositories/progress.ts`
- new `src/server/routes/progress.ts`
- new server and database tests for progress sync
- ephemeral Turso test helpers under `tests/support/`

Do not edit `src/app.ts`; export a route handler for coordinator wiring.

## Required schema

At minimum:

```text
progress_streams
progress_events
navigation_events
```

Every event uses its UUIDv4 as an idempotency key. Scope uniqueness by account,
Lesson Revision, progress epoch, and event ID. Store both client `occurred_at`
and server `received_at`. Do not store response duration.

## Required API behavior

Provide versioned push/pull routes for learning events and navigation events.
The exact route names can change before merge, but fixtures must cover:

- repeated upload of the same event;
- events arriving out of order;
- an old progress epoch after explicit discard;
- short-answer text round trip;
- unknown Lesson Revision rejection;
- an event that references a Question outside its revision;
- incremental pull with an opaque server cursor; and
- exact checkpoint reconstruction after deleting any projection.

Checkpoint selection must first compare the learning-event frontier. A
checkpoint based on less accepted evidence cannot replace one based on more
evidence. Define and test the concurrent-frontier tie breaker; do not rely only
on a client clock.

## Acceptance gate

Use a real ephemeral `learn-test-<uuid>` database. Create it, apply migrations,
run the suite, and delete it in `finally`, including on failure. Then run:

```bash
deno task check
deno task test
deno task test:db
```

