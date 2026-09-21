# Workstream C: client progress sync

## Objective

Add account-backed synchronization without weakening the offline-first learning
loop. IndexedDB remains immediately authoritative for local interaction. Sync
is background reconciliation of immutable events.

## Owned files

- `src/client/storage/**`
- new `src/client/sync/**`
- corresponding browser modules under `public/js/`
- client tests under `tests/client/`
- multi-context Playwright tests under `tests/e2e/`

Coordinate before editing the monolithic `public/js/app.js`. Prefer extracting
a sync boundary rather than adding more behavior inline.

## Required work

1. Add an outbox state for locally created learning and navigation events.
2. Upload immutable events in bounded batches with idempotent retries.
3. Pull remote events by opaque server cursor.
4. Union events by UUIDv4 and replay shared reducers.
5. Preserve unsubmitted short-answer drafts locally only.
6. Expose `Saved on this device`, `Syncing`, `Synced`, and `Sync failed` states.
7. Keep learning usable when every sync request fails.
8. Apply a newer progress epoch only after an explicit discard flow.

Use route fixtures supplied by Workstream B until its server handler merges.
Do not infer server ordering from UUIDv4 values.

## Acceptance gate

Playwright must use two isolated browser contexts for one account:

1. Device A completes Cards while online.
2. Device B downloads and resumes from the server-derived checkpoint.
3. Both devices create offline events.
4. Reconnection produces the event union once, with no lost Learned state.
5. A delayed stale checkpoint does not move either device backward.

The existing offline happy path and contract-regression suite must remain green.

