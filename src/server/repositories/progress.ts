// Progress storage: the idempotent union of one account's learning and navigation events, and the
// progress stream that pins each Lesson to a revision and epoch. Values are domain-shaped; row shapes
// stay inside this file. The Turso adapter is used by main.ts; the memory adapter backs the
// database-free application that browser and server tests run against.
//
// No projection is stored here. The checkpoint and progress are rebuilt from the streams by the
// shared reducers on every read, so a stored projection can never be the only source of truth.
import type { Client } from "../db.ts";
import {
  LEARNING_STREAM,
  type StreamName,
  type SyncEvent,
} from "../progress/validation.ts";

/** The account's position on one Lesson: which revision it is learning and under which epoch. */
export interface ProgressStream {
  lessonId: string;
  lessonRevisionId: string;
  epoch: number;
  updatedAt: number;
}

/** The revision and epoch a push or pull is scoped to. */
export interface StreamScope {
  lessonId: string;
  lessonRevisionId: string;
  epoch: number;
}

/** One stored event with the server's arrival order and clock. */
export interface StoredSyncEvent {
  seq: number;
  receivedAt: number;
  event: SyncEvent;
}

export type PushOutcome =
  | { ok: true; accepted: number; duplicates: number; stream: ProgressStream }
  | { ok: false; reason: "stale_epoch"; stream: ProgressStream };

export interface ProgressRepository {
  /** The account's stream for one Lesson, or null before its first push. */
  stream(accountId: string, lessonId: string): Promise<ProgressStream | null>;
  /**
   * Store the union of `events` under `scope`. A push at a higher epoch than the stream advances the
   * stream; a push at a lower epoch is refused and stores nothing. Events already stored count as
   * duplicates and are not stored again. An empty batch still advances the stream.
   */
  push(
    accountId: string,
    stream: StreamName,
    scope: StreamScope,
    events: SyncEvent[],
    receivedAt: number,
  ): Promise<PushOutcome>;
  /** Events after `afterSeq` in arrival order, at most `limit` of them, and whether more follow. */
  pull(
    accountId: string,
    stream: StreamName,
    scope: Omit<StreamScope, "lessonId">,
    afterSeq: number,
    limit: number,
  ): Promise<{ events: StoredSyncEvent[]; hasMore: boolean }>;
  /** Every event in the scope, in arrival order, for rebuilding a projection. */
  all(
    accountId: string,
    stream: StreamName,
    scope: Omit<StreamScope, "lessonId">,
  ): Promise<StoredSyncEvent[]>;
}

const TABLES: Record<StreamName, string> = {
  learning: "progress_events",
  navigation: "navigation_events",
};

const ENVELOPE = ["id", "type", "lessonRevisionId", "epoch", "occurredAt"];

/** The fields of an event beyond its envelope, stored as one JSON document. */
function payloadOf(event: SyncEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (!ENVELOPE.includes(key)) payload[key] = value;
  }
  return payload;
}

function rowEvent(row: Record<string, unknown>): StoredSyncEvent {
  // Written by payloadOf above: the event's fields outside the envelope.
  const payload = JSON.parse(String(row.payload_json)) as Record<
    string,
    unknown
  >;
  return {
    seq: Number(row.seq),
    receivedAt: Number(row.received_at),
    event: {
      id: String(row.id),
      type: String(row.type),
      lessonRevisionId: String(row.lesson_revision_id),
      epoch: Number(row.epoch),
      occurredAt: String(row.occurred_at),
      ...payload,
    },
  };
}

function rowStream(row: Record<string, unknown>): ProgressStream {
  return {
    lessonId: String(row.lesson_id),
    lessonRevisionId: String(row.lesson_revision_id),
    epoch: Number(row.epoch),
    updatedAt: Number(row.updated_at),
  };
}

/**
 * The stream after a push at `scope`: unchanged when the push is at the current epoch, advanced when
 * it is newer, or null when the push is stale. A first push creates the stream.
 */
function advanced(
  existing: ProgressStream | null,
  scope: StreamScope,
  now: number,
): ProgressStream | null {
  if (!existing) {
    return {
      lessonId: scope.lessonId,
      lessonRevisionId: scope.lessonRevisionId,
      epoch: scope.epoch,
      updatedAt: now,
    };
  }
  if (scope.epoch < existing.epoch) return null;
  if (scope.epoch > existing.epoch) {
    return {
      ...existing,
      lessonRevisionId: scope.lessonRevisionId,
      epoch: scope.epoch,
      updatedAt: now,
    };
  }
  return existing;
}

export class TursoProgressRepository implements ProgressRepository {
  constructor(private db: Client) {}

  async stream(
    accountId: string,
    lessonId: string,
  ): Promise<ProgressStream | null> {
    const result = await this.db.execute({
      sql:
        "SELECT * FROM progress_streams WHERE account_id = ? AND lesson_id = ?",
      args: [accountId, lessonId],
    });
    return result.rows.length
      ? rowStream(result.rows[0] as Record<string, unknown>)
      : null;
  }

  async push(
    accountId: string,
    stream: StreamName,
    scope: StreamScope,
    events: SyncEvent[],
    receivedAt: number,
  ): Promise<PushOutcome> {
    const existing = await this.stream(accountId, scope.lessonId);
    const next = advanced(existing, scope, receivedAt);
    if (!next) return { ok: false, reason: "stale_epoch", stream: existing! };
    const statements: Array<
      { sql: string; args: Array<string | number | null> }
    > = [];
    if (!existing) {
      statements.push({
        sql:
          "INSERT INTO progress_streams(account_id, lesson_id, lesson_revision_id, epoch, updated_at) VALUES (?, ?, ?, ?, ?)",
        args: [
          accountId,
          next.lessonId,
          next.lessonRevisionId,
          next.epoch,
          next.updatedAt,
        ],
      });
    } else if (next !== existing) {
      statements.push({
        sql:
          "UPDATE progress_streams SET lesson_revision_id = ?, epoch = ?, updated_at = ? WHERE account_id = ? AND lesson_id = ? AND epoch < ?",
        args: [
          next.lessonRevisionId,
          next.epoch,
          next.updatedAt,
          accountId,
          next.lessonId,
          next.epoch,
        ],
      });
    }
    const table = TABLES[stream];
    const first = statements.length;
    for (const event of events) {
      statements.push({
        sql:
          `INSERT OR IGNORE INTO ${table}(id, account_id, lesson_revision_id, epoch, type, payload_json, occurred_at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          event.id,
          accountId,
          scope.lessonRevisionId,
          scope.epoch,
          event.type,
          JSON.stringify(payloadOf(event)),
          event.occurredAt,
          receivedAt,
        ],
      });
    }
    if (!statements.length) {
      return { ok: true, accepted: 0, duplicates: 0, stream: next };
    }
    const results = await this.db.batch(statements, "write");
    let accepted = 0;
    for (const result of results.slice(first)) accepted += result.rowsAffected;
    return {
      ok: true,
      accepted,
      duplicates: events.length - accepted,
      stream: next,
    };
  }

  async pull(
    accountId: string,
    stream: StreamName,
    scope: Omit<StreamScope, "lessonId">,
    afterSeq: number,
    limit: number,
  ): Promise<{ events: StoredSyncEvent[]; hasMore: boolean }> {
    const result = await this.db.execute({
      sql: `SELECT * FROM ${
        TABLES[stream]
      } WHERE account_id = ? AND lesson_revision_id = ? AND epoch = ? AND seq > ? ORDER BY seq LIMIT ?`,
      args: [
        accountId,
        scope.lessonRevisionId,
        scope.epoch,
        afterSeq,
        limit + 1,
      ],
    });
    const events = result.rows.map((row) =>
      rowEvent(row as Record<string, unknown>)
    );
    return { events: events.slice(0, limit), hasMore: events.length > limit };
  }

  async all(
    accountId: string,
    stream: StreamName,
    scope: Omit<StreamScope, "lessonId">,
  ): Promise<StoredSyncEvent[]> {
    const result = await this.db.execute({
      sql: `SELECT * FROM ${
        TABLES[stream]
      } WHERE account_id = ? AND lesson_revision_id = ? AND epoch = ? ORDER BY seq`,
      args: [accountId, scope.lessonRevisionId, scope.epoch],
    });
    return result.rows.map((row) => rowEvent(row as Record<string, unknown>));
  }
}

/** In-memory adapter with the same semantics, for the database-free test application. */
export class MemoryProgressRepository implements ProgressRepository {
  private streams = new Map<string, ProgressStream>();
  private tables: Record<
    StreamName,
    Array<StoredSyncEvent & { accountId: string }>
  > = { learning: [], navigation: [] };
  private seq = 0;

  stream(
    accountId: string,
    lessonId: string,
  ): Promise<ProgressStream | null> {
    return Promise.resolve(
      this.streams.get(`${accountId}/${lessonId}`) ?? null,
    );
  }

  async push(
    accountId: string,
    stream: StreamName,
    scope: StreamScope,
    events: SyncEvent[],
    receivedAt: number,
  ): Promise<PushOutcome> {
    const existing = await this.stream(accountId, scope.lessonId);
    const next = advanced(existing, scope, receivedAt);
    if (!next) return { ok: false, reason: "stale_epoch", stream: existing! };
    this.streams.set(`${accountId}/${scope.lessonId}`, next);
    const table = this.tables[stream];
    const known = new Set(
      table.filter((row) => this.inScope(row, accountId, scope)).map((row) =>
        row.event.id
      ),
    );
    let accepted = 0;
    for (const event of events) {
      if (known.has(event.id)) continue;
      known.add(event.id);
      this.seq += 1;
      table.push({
        seq: this.seq,
        receivedAt,
        accountId,
        event: structuredClone(event),
      });
      accepted += 1;
    }
    return {
      ok: true,
      accepted,
      duplicates: events.length - accepted,
      stream: next,
    };
  }

  pull(
    accountId: string,
    stream: StreamName,
    scope: Omit<StreamScope, "lessonId">,
    afterSeq: number,
    limit: number,
  ): Promise<{ events: StoredSyncEvent[]; hasMore: boolean }> {
    const matching = this.tables[stream].filter((row) =>
      this.inScope(row, accountId, scope) && row.seq > afterSeq
    );
    const events = matching.slice(0, limit).map((
      { accountId: _account, ...row },
    ) => structuredClone(row));
    return Promise.resolve({ events, hasMore: matching.length > limit });
  }

  all(
    accountId: string,
    stream: StreamName,
    scope: Omit<StreamScope, "lessonId">,
  ): Promise<StoredSyncEvent[]> {
    return Promise.resolve(
      this.tables[stream].filter((row) => this.inScope(row, accountId, scope))
        .map(({ accountId: _account, ...row }) => structuredClone(row)),
    );
  }

  private inScope(
    row: StoredSyncEvent & { accountId: string },
    accountId: string,
    scope: Omit<StreamScope, "lessonId">,
  ): boolean {
    return row.accountId === accountId &&
      row.event.lessonRevisionId === scope.lessonRevisionId &&
      row.event.epoch === scope.epoch;
  }
}

export { LEARNING_STREAM };
