# 12 — Client progress sync: outbox, merge, sync status, epoch discard

**What to build:** Josh learns on his phone on the train with no signal. When
signal returns, his progress reaches the server on its own, and his laptop
shows the same Learned Concepts and resumes at the same Card. The phone shows
a compact state the whole time: Saved on this device, Syncing, Synced, or
Sync failed. Learning never waits on the network. This is Workstream C in
`docs/implementation/client-progress-sync.md`; that document is the spec.

IndexedDB stays authoritative for the device. New events go to an outbox and
upload in bounded batches with idempotent retries. Pull uses the server
cursor. Union by UUIDv4 and replay the shared reducers. Unsubmitted
short-answer drafts stay local. A newer progress epoch from the server is
applied only after the explicit discard flow from ticket 09; it never silently
replaces local progress.

**Demo path:** Two browser contexts signed in as the same account. Device A
completes a Concept online. Device B opens the lesson and resumes at A's
position. Both go offline and each completes a different Concept. Both come
back online. Each shows both Concepts done and neither lost Learned.

**Blocked by:** 09 — Mine shelf lists the account's lessons and caches them on
open; 11 — Server progress sync.

**Status:** ready-for-agent

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
