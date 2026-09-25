import type { Client, Row } from "../db.ts";
import type {
  RevisionListing,
  RevisionStatus,
  ShelfLessonReply,
} from "../../shared/api/v1.d.ts";
import type {
  Lesson,
  NormalizedLesson,
  Source,
} from "../../shared/lessons/types.d.ts";

export interface ResolvedLesson {
  schemaVersion: number;
  fingerprint: string;
  normalizedLesson: NormalizedLesson;
}

export interface StoredRevision {
  lessonId: string;
  revisionId: string;
  revisionNumber: number;
  status: RevisionStatus;
  fingerprint: string;
  content: Lesson;
  createdAt: number;
}

/** One shelf card's worth of a lesson: its identity and its newest revision. Content is not included. */
export type ShelfLesson = ShelfLessonReply;

export interface LessonRepository {
  /** The newest published revision, or null when nothing is published yet. */
  featured(): Promise<Lesson | null>;
  createLesson(
    accountId: string,
    resolved: ResolvedLesson,
  ): Promise<StoredRevision>;
  createRevision(
    accountId: string,
    lessonId: string,
    resolved: ResolvedLesson,
  ): Promise<StoredRevision>;
  getRevision(
    accountId: string,
    lessonId: string,
    revisionId: string,
  ): Promise<StoredRevision | null>;
  /** The newest revision of one lesson the account owns, or null when it owns no such lesson. */
  latestRevision(
    accountId: string,
    lessonId: string,
  ): Promise<StoredRevision | null>;
  listMine(accountId: string): Promise<RevisionListing[]>;
  /** Every lesson the account owns, newest revision first. */
  shelf(accountId: string): Promise<ShelfLesson[]>;
  /**
   * One revision the account may record progress on: any revision of a lesson it owns, or any
   * published revision. Null otherwise, so progress on an unknown revision is refused.
   */
  learnableRevision(
    accountId: string,
    revisionId: string,
  ): Promise<StoredRevision | null>;
}

/** Concept and Question counts from a normalized lesson document. */
function counts(
  content: Pick<NormalizedLesson, "concepts" | "questions">,
): { conceptCount: number; questionCount: number } {
  return {
    conceptCount: content.concepts.length,
    questionCount: content.questions.length,
  };
}

function shelfLesson(stored: StoredRevision): ShelfLesson {
  return {
    lessonId: stored.lessonId,
    title: String(stored.content.title),
    ...counts(stored.content),
    latestRevisionId: stored.revisionId,
    latestRevisionNumber: stored.revisionNumber,
    status: stored.status,
    updatedAt: stored.createdAt,
  };
}

/** What `content_json` holds: the lesson without the separately stored sources and provenance. */
type StoredContent = Omit<NormalizedLesson, "sources" | "provenance">;

function rowRevision(
  row: Row,
  sources: Source[] = [],
): StoredRevision {
  // Both columns are written by insert() below from a resolved lesson.
  const content = JSON.parse(String(row.content_json)) as StoredContent;
  const provenance = JSON.parse(
    String(row.provenance_json),
  ) as NormalizedLesson["provenance"];
  return {
    lessonId: String(row.lesson_id),
    revisionId: String(row.id),
    revisionNumber: Number(row.revision_number),
    status: String(row.status) as StoredRevision["status"],
    fingerprint: String(row.fingerprint),
    content: {
      ...content,
      sources,
      provenance,
      lessonId: String(row.lesson_id),
      revisionId: String(row.id),
    },
    createdAt: Number(row.created_at),
  };
}

export class TursoLessonRepository implements LessonRepository {
  constructor(private db: Client) {}

  async featured(): Promise<Lesson | null> {
    const result = await this.db.execute(
      "SELECT * FROM lesson_revisions WHERE status = 'published' ORDER BY published_at DESC LIMIT 1",
    );
    if (!result.rows.length) return null;
    return (await this.hydrate(result.rows[0])).content;
  }

  async createLesson(
    accountId: string,
    resolved: ResolvedLesson,
  ): Promise<StoredRevision> {
    const duplicate = await this.byFingerprint(accountId, resolved.fingerprint);
    if (duplicate) return duplicate;
    const lessonId = crypto.randomUUID();
    return await this.insert(accountId, lessonId, 1, resolved, true);
  }

  async createRevision(
    accountId: string,
    lessonId: string,
    resolved: ResolvedLesson,
  ): Promise<StoredRevision> {
    const duplicate = await this.byFingerprint(accountId, resolved.fingerprint);
    if (duplicate) return duplicate;
    const lesson = await this.db.execute({
      sql: "SELECT id FROM lessons WHERE id = ? AND owner_account_id = ?",
      args: [lessonId, accountId],
    });
    if (!lesson.rows.length) throw new Deno.errors.NotFound("Lesson not found");
    const count = await this.db.execute({
      sql:
        "SELECT COALESCE(MAX(revision_number), 0) AS revision_number FROM lesson_revisions WHERE lesson_id = ?",
      args: [lessonId],
    });
    return await this.insert(
      accountId,
      lessonId,
      Number(count.rows[0].revision_number) + 1,
      resolved,
      false,
    );
  }

  async getRevision(
    accountId: string,
    lessonId: string,
    revisionId: string,
  ): Promise<StoredRevision | null> {
    const result = await this.db.execute({
      sql:
        "SELECT r.* FROM lesson_revisions r JOIN lessons l ON l.id = r.lesson_id WHERE r.id = ? AND r.lesson_id = ? AND l.owner_account_id = ?",
      args: [revisionId, lessonId, accountId],
    });
    return result.rows.length ? await this.hydrate(result.rows[0]) : null;
  }

  async latestRevision(
    accountId: string,
    lessonId: string,
  ): Promise<StoredRevision | null> {
    const result = await this.db.execute({
      sql:
        "SELECT r.* FROM lesson_revisions r JOIN lessons l ON l.id = r.lesson_id WHERE r.lesson_id = ? AND l.owner_account_id = ? ORDER BY r.revision_number DESC LIMIT 1",
      args: [lessonId, accountId],
    });
    return result.rows.length ? await this.hydrate(result.rows[0]) : null;
  }

  async shelf(accountId: string): Promise<ShelfLesson[]> {
    const result = await this.db.execute({
      sql:
        "SELECT l.id AS lesson_id, r.id AS revision_id, r.revision_number, r.status, r.instructional_title, r.content_json, r.created_at FROM lessons l JOIN lesson_revisions r ON r.lesson_id = l.id WHERE l.owner_account_id = ? AND r.revision_number = (SELECT MAX(revision_number) FROM lesson_revisions newest WHERE newest.lesson_id = l.id) ORDER BY r.created_at DESC, l.id",
      args: [accountId],
    });
    return result.rows.map((row) => ({
      lessonId: String(row.lesson_id),
      title: String(row.instructional_title),
      ...counts(JSON.parse(String(row.content_json)) as StoredContent),
      latestRevisionId: String(row.revision_id),
      latestRevisionNumber: Number(row.revision_number),
      status: String(row.status) as StoredRevision["status"],
      updatedAt: Number(row.created_at),
    }));
  }

  async learnableRevision(
    accountId: string,
    revisionId: string,
  ): Promise<StoredRevision | null> {
    const result = await this.db.execute({
      sql:
        "SELECT r.* FROM lesson_revisions r JOIN lessons l ON l.id = r.lesson_id WHERE r.id = ? AND (r.status = 'published' OR l.owner_account_id = ?)",
      args: [revisionId, accountId],
    });
    return result.rows.length ? await this.hydrate(result.rows[0]) : null;
  }

  async listMine(accountId: string): Promise<RevisionListing[]> {
    const result = await this.db.execute({
      sql:
        "SELECT l.id AS lesson_id, r.id AS revision_id, r.revision_number, r.status, r.instructional_title, r.fingerprint, r.created_at FROM lessons l JOIN lesson_revisions r ON r.lesson_id = l.id WHERE l.owner_account_id = ? ORDER BY r.created_at DESC",
      args: [accountId],
    });
    return result.rows.map((row) => ({
      lessonId: String(row.lesson_id),
      revisionId: String(row.revision_id),
      revisionNumber: Number(row.revision_number),
      status: String(row.status),
      title: String(row.instructional_title),
      fingerprint: String(row.fingerprint),
      createdAt: Number(row.created_at),
    }));
  }

  private async byFingerprint(
    accountId: string,
    fingerprint: string,
  ): Promise<StoredRevision | null> {
    const result = await this.db.execute({
      sql:
        "SELECT * FROM lesson_revisions WHERE author_account_id = ? AND fingerprint = ?",
      args: [accountId, fingerprint],
    });
    return result.rows.length ? await this.hydrate(result.rows[0]) : null;
  }

  private async insert(
    accountId: string,
    lessonId: string,
    revisionNumber: number,
    resolved: ResolvedLesson,
    newLesson: boolean,
  ): Promise<StoredRevision> {
    const revisionId = crypto.randomUUID();
    const now = Date.now();
    const normalized = resolved.normalizedLesson;
    const { sources, provenance, ...content } = normalized;
    const statements: Array<
      string | { sql: string; args: Array<string | number | null> }
    > = [];
    if (newLesson) {
      statements.push({
        sql:
          "INSERT INTO lessons(id, owner_account_id, created_at) VALUES (?, ?, ?)",
        args: [lessonId, accountId, now],
      });
    }
    statements.push({
      sql:
        "INSERT INTO lesson_revisions(id, lesson_id, author_account_id, revision_number, status, schema_version, fingerprint, instructional_title, assumed_knowledge, content_json, provenance_json, created_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)",
      args: [
        revisionId,
        lessonId,
        accountId,
        revisionNumber,
        resolved.schemaVersion,
        resolved.fingerprint,
        String(content.title),
        String(content.assumedKnowledge),
        JSON.stringify(content),
        JSON.stringify(provenance),
        now,
      ],
    });
    for (
      const [index, source] of sources.entries()
    ) {
      statements.push({
        sql:
          "INSERT INTO lesson_sources(id, lesson_revision_id, source_order, type, title, locator, captured_text) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [
          crypto.randomUUID(),
          revisionId,
          index,
          String(source.type),
          String(source.title),
          String(source.locator),
          source.capturedText == null ? null : String(source.capturedText),
        ],
      });
    }
    await this.db.batch(statements, "immediate");
    return {
      lessonId,
      revisionId,
      revisionNumber,
      status: "draft",
      fingerprint: resolved.fingerprint,
      content: { ...content, sources, provenance, lessonId, revisionId },
      createdAt: now,
    };
  }

  private async hydrate(row: Row): Promise<StoredRevision> {
    const result = await this.db.execute({
      sql:
        "SELECT type, title, locator, captured_text FROM lesson_sources WHERE lesson_revision_id = ? ORDER BY source_order",
      args: [String(row.id)],
    });
    const sources = result.rows.map((source) => ({
      type: String(source.type),
      title: String(source.title),
      locator: String(source.locator),
      capturedText: source.captured_text == null
        ? null
        : String(source.captured_text),
    }));
    return rowRevision(row, sources);
  }
}

/** The account that owns the bundled demo lesson in the database-free application. */
export const FIXTURE_OWNER_ID = "fixture-owner";

/**
 * In-memory lesson storage seeded with one published revision: the bundled demo fixture, owned by
 * the fixture account. Drafts created through the API live only for the life of the process. It
 * backs the database-free application that browser and server tests run against.
 */
export class FixtureLessonRepository implements LessonRepository {
  private owners = new Map<string, string>();
  private revisions: StoredRevision[] = [];
  private clock: () => number;

  constructor(
    lesson: Lesson,
    ownerAccountId = FIXTURE_OWNER_ID,
    clock: () => number = Date.now,
  ) {
    this.clock = clock;
    const { lessonId, revisionId } = lesson;
    this.owners.set(String(lessonId), ownerAccountId);
    this.revisions.push({
      lessonId: String(lessonId),
      revisionId: String(revisionId),
      revisionNumber: 1,
      status: "published",
      fingerprint: "sha256:fixture",
      content: lesson,
      createdAt: 0,
    });
  }

  featured(): Promise<Lesson | null> {
    const published = this.revisions.filter((revision) =>
      revision.status === "published"
    );
    return Promise.resolve(published.at(-1)?.content ?? null);
  }

  createLesson(
    accountId: string,
    resolved: ResolvedLesson,
  ): Promise<StoredRevision> {
    const duplicate = this.byFingerprint(accountId, resolved.fingerprint);
    if (duplicate) return Promise.resolve(duplicate);
    const lessonId = crypto.randomUUID();
    this.owners.set(lessonId, accountId);
    return Promise.resolve(this.insert(lessonId, 1, resolved));
  }

  createRevision(
    accountId: string,
    lessonId: string,
    resolved: ResolvedLesson,
  ): Promise<StoredRevision> {
    const duplicate = this.byFingerprint(accountId, resolved.fingerprint);
    if (duplicate) return Promise.resolve(duplicate);
    if (this.owners.get(lessonId) !== accountId) {
      return Promise.reject(new Deno.errors.NotFound("Lesson not found"));
    }
    const numbers = this.revisions.filter((revision) =>
      revision.lessonId === lessonId
    ).map((revision) => revision.revisionNumber);
    return Promise.resolve(
      this.insert(lessonId, Math.max(0, ...numbers) + 1, resolved),
    );
  }

  getRevision(
    accountId: string,
    lessonId: string,
    revisionId: string,
  ): Promise<StoredRevision | null> {
    if (this.owners.get(lessonId) !== accountId) return Promise.resolve(null);
    return Promise.resolve(
      this.revisions.find((revision) =>
        revision.lessonId === lessonId && revision.revisionId === revisionId
      ) ?? null,
    );
  }

  latestRevision(
    accountId: string,
    lessonId: string,
  ): Promise<StoredRevision | null> {
    if (this.owners.get(lessonId) !== accountId) return Promise.resolve(null);
    return Promise.resolve(this.newest(lessonId));
  }

  listMine(accountId: string): Promise<RevisionListing[]> {
    return Promise.resolve(
      this.owned(accountId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((
          {
            lessonId,
            revisionId,
            revisionNumber,
            status,
            content,
            fingerprint,
            createdAt,
          },
        ) => ({
          lessonId,
          revisionId,
          revisionNumber,
          status,
          title: String(content.title),
          fingerprint,
          createdAt,
        })),
    );
  }

  shelf(accountId: string): Promise<ShelfLesson[]> {
    const lessonIds = [
      ...new Set(this.owned(accountId).map((revision) => revision.lessonId)),
    ];
    return Promise.resolve(
      lessonIds.map((lessonId) => shelfLesson(this.newest(lessonId)!))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    );
  }

  learnableRevision(
    accountId: string,
    revisionId: string,
  ): Promise<StoredRevision | null> {
    const revision = this.revisions.find((candidate) =>
      candidate.revisionId === revisionId
    );
    if (!revision) return Promise.resolve(null);
    if (
      revision.status !== "published" &&
      this.owners.get(revision.lessonId) !== accountId
    ) return Promise.resolve(null);
    return Promise.resolve(revision);
  }

  private owned(accountId: string): StoredRevision[] {
    return this.revisions.filter((revision) =>
      this.owners.get(revision.lessonId) === accountId
    );
  }

  private newest(lessonId: string): StoredRevision | null {
    const mine = this.revisions.filter((revision) =>
      revision.lessonId === lessonId
    );
    return mine.sort((a, b) => b.revisionNumber - a.revisionNumber)[0] ?? null;
  }

  private byFingerprint(
    accountId: string,
    fingerprint: string,
  ): StoredRevision | null {
    return this.owned(accountId).find((revision) =>
      revision.fingerprint === fingerprint
    ) ?? null;
  }

  private insert(
    lessonId: string,
    revisionNumber: number,
    resolved: ResolvedLesson,
  ): StoredRevision {
    const revisionId = crypto.randomUUID();
    // Strictly increasing, so two drafts created in the same millisecond still order newest first.
    const createdAt = Math.max(
      this.clock(),
      (this.revisions.at(-1)?.createdAt ?? -1) + 1,
    );
    const stored: StoredRevision = {
      lessonId,
      revisionId,
      revisionNumber,
      status: "draft",
      fingerprint: resolved.fingerprint,
      content: { ...resolved.normalizedLesson, lessonId, revisionId },
      createdAt,
    };
    this.revisions.push(stored);
    return stored;
  }
}
