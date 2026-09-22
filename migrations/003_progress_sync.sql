-- Progress sync: the idempotent union of one account's immutable learning and
-- navigation events, and the progress stream that pins each Lesson to a revision
-- and a progress epoch. 001_initial.sql and 002_passkeys_and_invites.sql are
-- immutable; this file only adds tables.
--
-- Every event's UUIDv4 is its idempotency key, scoped by account, Lesson
-- Revision, progress epoch and event ID. `occurred_at` is the client's clock as
-- it sent it; `received_at` is the server's clock at ingest. Neither table
-- stores a response duration. `seq` is the server's arrival order and the only
-- thing an opaque pull cursor encodes; event IDs are never ordered.

CREATE TABLE progress_streams (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  lesson_revision_id TEXT NOT NULL REFERENCES lesson_revisions(id),
  epoch INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, lesson_id)
);

CREATE TABLE progress_events (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  lesson_revision_id TEXT NOT NULL REFERENCES lesson_revisions(id),
  epoch INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE(account_id, lesson_revision_id, epoch, id)
);

CREATE INDEX progress_events_scope_idx ON progress_events(account_id, lesson_revision_id, epoch, seq);

CREATE TABLE navigation_events (
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  lesson_revision_id TEXT NOT NULL REFERENCES lesson_revisions(id),
  epoch INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE(account_id, lesson_revision_id, epoch, id)
);

CREATE INDEX navigation_events_scope_idx ON navigation_events(account_id, lesson_revision_id, epoch, seq);
