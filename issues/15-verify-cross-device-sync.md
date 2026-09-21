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

**Status:** ready-for-agent

- [ ] Every scenario is a Playwright test the swarm can rerun, with the
      database assertions inline.
- [ ] The ephemeral database is created before and deleted after, including on
      failure, and the report shows its name and its deletion.
- [ ] Every defect is a ticket file with a reproduction.
