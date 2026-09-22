import type { Client } from "../db.ts";

export interface ResolvedLesson {
  schemaVersion: number;
  fingerprint: string;
  normalizedLesson: Record<string, any>;
}

export interface StoredRevision {
  lessonId: string;
  revisionId: string;
  revisionNumber: number;
  status: "draft" | "published" | "superseded" | "withdrawn";
  fingerprint: string;
  content: Record<string, any>;
  createdAt: number;
}

/** One shelf card's worth of a lesson: its identity and its newest revision. Content is not included. */
export interface ShelfLesson {
  lessonId: string;
  title: string;
  conceptCount: number;
  questionCount: number;
  latestRevisionId: string;
  latestRevisionNumber: number;
  status: StoredRevision["status"];
  /** When the newest revision was created, in milliseconds. The shelf sorts newest first. */
  updatedAt: number;
}

export interface LessonRepository {
  featured(): Promise<Record<string, any>>;
  createLesson(accountId: string, resolved: ResolvedLesson): Promise<StoredRevision>;
  createRevision(accountId: string, lessonId: string, resolved: ResolvedLesson): Promise<StoredRevision>;
  getRevision(accountId: string, lessonId: string, revisionId: string): Promise<StoredRevision | null>;
  /** The newest revision of one lesson the account owns, or null when it owns no such lesson. */
  latestRevision(accountId: string, lessonId: string): Promise<StoredRevision | null>;
  listMine(accountId: string): Promise<Array<Record<string, unknown>>>;
  /** Every lesson the account owns, newest revision first. */
  shelf(accountId: string): Promise<ShelfLesson[]>;
  /**
   * One revision the account may record progress on: any revision of a lesson it owns, or any
   * published revision. Null otherwise, so progress on an unknown revision is refused.
   */
  learnableRevision(accountId: string, revisionId: string): Promise<StoredRevision | null>;
}

/** Concept and Question counts from a normalized lesson document. */
function counts(content: Record<string, any>): { conceptCount: number; questionCount: number } {
  const concepts = Array.isArray(content.concepts) ? content.concepts : [];
  const questions = Array.isArray(content.questions) ? content.questions : [];
  return { conceptCount: concepts.length, questionCount: questions.length };
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

function rowRevision(row: Record<string, any>, sources: Array<Record<string, unknown>> = []): StoredRevision {
  const content = JSON.parse(String(row.content_json));
  const provenance = JSON.parse(String(row.provenance_json));
  return {
    lessonId: String(row.lesson_id),
    revisionId: String(row.id),
    revisionNumber: Number(row.revision_number),
    status: String(row.status) as StoredRevision["status"],
    fingerprint: String(row.fingerprint),
    content: { ...content, sources, provenance, lessonId: String(row.lesson_id), revisionId: String(row.id) },
    createdAt: Number(row.created_at),
  };
}

export class TursoLessonRepository implements LessonRepository {
  constructor(private db: Client) {}

  async featured(): Promise<Record<string, any>> {
    const result = await this.db.execute("SELECT * FROM lesson_revisions WHERE status = 'published' ORDER BY published_at DESC LIMIT 1");
    if (!result.rows.length) throw new Error("No published lesson revision is available");
    return (await this.hydrate(result.rows[0] as Record<string, any>)).content;
  }

  async createLesson(accountId: string, resolved: ResolvedLesson): Promise<StoredRevision> {
    const duplicate = await this.byFingerprint(accountId, resolved.fingerprint);
    if (duplicate) return duplicate;
    const lessonId = crypto.randomUUID();
    return await this.insert(accountId, lessonId, 1, resolved, true);
  }

  async createRevision(accountId: string, lessonId: string, resolved: ResolvedLesson): Promise<StoredRevision> {
    const duplicate = await this.byFingerprint(accountId, resolved.fingerprint);
    if (duplicate) return duplicate;
    const lesson = await this.db.execute({ sql: "SELECT id FROM lessons WHERE id = ? AND owner_account_id = ?", args: [lessonId, accountId] });
    if (!lesson.rows.length) throw new Deno.errors.NotFound("Lesson not found");
    const count = await this.db.execute({ sql: "SELECT COALESCE(MAX(revision_number), 0) AS revision_number FROM lesson_revisions WHERE lesson_id = ?", args: [lessonId] });
    return await this.insert(accountId, lessonId, Number(count.rows[0].revision_number) + 1, resolved, false);
  }

  async getRevision(accountId: string, lessonId: string, revisionId: string): Promise<StoredRevision | null> {
    const result = await this.db.execute({
      sql: "SELECT r.* FROM lesson_revisions r JOIN lessons l ON l.id = r.lesson_id WHERE r.id = ? AND r.lesson_id = ? AND l.owner_account_id = ?",
      args: [revisionId, lessonId, accountId],
    });
    return result.rows.length ? await this.hydrate(result.rows[0] as Record<string, any>) : null;
  }

  async latestRevision(accountId: string, lessonId: string): Promise<StoredRevision | null> {
    const result = await this.db.execute({
      sql: "SELECT r.* FROM lesson_revisions r JOIN lessons l ON l.id = r.lesson_id WHERE r.lesson_id = ? AND l.owner_account_id = ? ORDER BY r.revision_number DESC LIMIT 1",
      args: [lessonId, accountId],
    });
    return result.rows.length ? await this.hydrate(result.rows[0] as Record<string, any>) : null;
  }

  async shelf(accountId: string): Promise<ShelfLesson[]> {
    const result = await this.db.execute({
      sql: "SELECT l.id AS lesson_id, r.id AS revision_id, r.revision_number, r.status, r.instructional_title, r.content_json, r.created_at FROM lessons l JOIN lesson_revisions r ON r.lesson_id = l.id WHERE l.owner_account_id = ? AND r.revision_number = (SELECT MAX(revision_number) FROM lesson_revisions newest WHERE newest.lesson_id = l.id) ORDER BY r.created_at DESC, l.id",
      args: [accountId],
    });
    return result.rows.map((row) => ({
      lessonId: String(row.lesson_id),
      title: String(row.instructional_title),
      ...counts(JSON.parse(String(row.content_json))),
      latestRevisionId: String(row.revision_id),
      latestRevisionNumber: Number(row.revision_number),
      status: String(row.status) as StoredRevision["status"],
      updatedAt: Number(row.created_at),
    }));
  }

  async learnableRevision(accountId: string, revisionId: string): Promise<StoredRevision | null> {
    const result = await this.db.execute({
      sql: "SELECT r.* FROM lesson_revisions r JOIN lessons l ON l.id = r.lesson_id WHERE r.id = ? AND (r.status = 'published' OR l.owner_account_id = ?)",
      args: [revisionId, accountId],
    });
    return result.rows.length ? await this.hydrate(result.rows[0] as Record<string, any>) : null;
  }

  async listMine(accountId: string): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.execute({
      sql: "SELECT l.id AS lesson_id, r.id AS revision_id, r.revision_number, r.status, r.instructional_title, r.fingerprint, r.created_at FROM lessons l JOIN lesson_revisions r ON r.lesson_id = l.id WHERE l.owner_account_id = ? ORDER BY r.created_at DESC",
      args: [accountId],
    });
    return result.rows.map((row) => ({
      lessonId: String(row.lesson_id), revisionId: String(row.revision_id), revisionNumber: Number(row.revision_number),
      status: String(row.status), title: String(row.instructional_title), fingerprint: String(row.fingerprint), createdAt: Number(row.created_at),
    }));
  }

  private async byFingerprint(accountId: string, fingerprint: string): Promise<StoredRevision | null> {
    const result = await this.db.execute({ sql: "SELECT * FROM lesson_revisions WHERE author_account_id = ? AND fingerprint = ?", args: [accountId, fingerprint] });
    return result.rows.length ? await this.hydrate(result.rows[0] as Record<string, any>) : null;
  }

  private async insert(accountId: string, lessonId: string, revisionNumber: number, resolved: ResolvedLesson, newLesson: boolean): Promise<StoredRevision> {
    const revisionId = crypto.randomUUID();
    const now = Date.now();
    const normalized = resolved.normalizedLesson;
    const { sources, provenance, ...content } = normalized;
    const statements: Array<string | { sql: string; args: Array<string | number | null> }> = [];
    if (newLesson) statements.push({ sql: "INSERT INTO lessons(id, owner_account_id, created_at) VALUES (?, ?, ?)", args: [lessonId, accountId, now] });
    statements.push({
      sql: "INSERT INTO lesson_revisions(id, lesson_id, author_account_id, revision_number, status, schema_version, fingerprint, instructional_title, assumed_knowledge, content_json, provenance_json, created_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)",
      args: [revisionId, lessonId, accountId, revisionNumber, resolved.schemaVersion, resolved.fingerprint, String(content.title), String(content.assumedKnowledge), JSON.stringify(content), JSON.stringify(provenance), now],
    });
    for (const [index, source] of (sources as Array<Record<string, any>>).entries()) {
      statements.push({
        sql: "INSERT INTO lesson_sources(id, lesson_revision_id, source_order, type, title, locator, captured_text) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [crypto.randomUUID(), revisionId, index, String(source.type), String(source.title), String(source.locator), source.capturedText == null ? null : String(source.capturedText)],
      });
    }
    await this.db.batch(statements, "immediate");
    return { lessonId, revisionId, revisionNumber, status: "draft", fingerprint: resolved.fingerprint, content: { ...content, sources, provenance, lessonId, revisionId }, createdAt: now };
  }

  private async hydrate(row: Record<string, any>): Promise<StoredRevision> {
    const result = await this.db.execute({
      sql: "SELECT type, title, locator, captured_text FROM lesson_sources WHERE lesson_revision_id = ? ORDER BY source_order",
      args: [String(row.id)],
    });
    const sources = result.rows.map((source) => ({
      type: String(source.type), title: String(source.title), locator: String(source.locator),
      capturedText: source.captured_text == null ? null : String(source.captured_text),
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

  constructor(lesson: Record<string, any>, ownerAccountId = FIXTURE_OWNER_ID, clock: () => number = Date.now) {
    this.clock = clock;
    const { lessonId, revisionId } = lesson;
    this.owners.set(String(lessonId), ownerAccountId);
    this.revisions.push({
      lessonId: String(lessonId), revisionId: String(revisionId), revisionNumber: 1, status: "published",
      fingerprint: "sha256:fixture", content: lesson, createdAt: 0,
    });
  }

  async featured(): Promise<Record<string, any>> {
    const published = this.revisions.filter((revision) => revision.status === "published");
    return published.at(-1)!.content;
  }

  async createLesson(accountId: string, resolved: ResolvedLesson): Promise<StoredRevision> {
    const duplicate = this.byFingerprint(accountId, resolved.fingerprint);
    if (duplicate) return duplicate;
    const lessonId = crypto.randomUUID();
    this.owners.set(lessonId, accountId);
    return this.insert(lessonId, 1, resolved);
  }

  async createRevision(accountId: string, lessonId: string, resolved: ResolvedLesson): Promise<StoredRevision> {
    const duplicate = this.byFingerprint(accountId, resolved.fingerprint);
    if (duplicate) return duplicate;
    if (this.owners.get(lessonId) !== accountId) throw new Deno.errors.NotFound("Lesson not found");
    const numbers = this.revisions.filter((revision) => revision.lessonId === lessonId).map((revision) => revision.revisionNumber);
    return this.insert(lessonId, Math.max(0, ...numbers) + 1, resolved);
  }

  async getRevision(accountId: string, lessonId: string, revisionId: string): Promise<StoredRevision | null> {
    if (this.owners.get(lessonId) !== accountId) return null;
    return this.revisions.find((revision) => revision.lessonId === lessonId && revision.revisionId === revisionId) ?? null;
  }

  async latestRevision(accountId: string, lessonId: string): Promise<StoredRevision | null> {
    if (this.owners.get(lessonId) !== accountId) return null;
    return this.newest(lessonId);
  }

  async listMine(accountId: string): Promise<Array<Record<string, unknown>>> {
    return this.owned(accountId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ lessonId, revisionId, revisionNumber, status, content, fingerprint, createdAt }) => ({
        lessonId, revisionId, revisionNumber, status, title: String(content.title), fingerprint, createdAt,
      }));
  }

  async shelf(accountId: string): Promise<ShelfLesson[]> {
    const lessonIds = [...new Set(this.owned(accountId).map((revision) => revision.lessonId))];
    return lessonIds.map((lessonId) => shelfLesson(this.newest(lessonId)!)).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async learnableRevision(accountId: string, revisionId: string): Promise<StoredRevision | null> {
    const revision = this.revisions.find((candidate) => candidate.revisionId === revisionId);
    if (!revision) return null;
    if (revision.status !== "published" && this.owners.get(revision.lessonId) !== accountId) return null;
    return revision;
  }

  private owned(accountId: string): StoredRevision[] {
    return this.revisions.filter((revision) => this.owners.get(revision.lessonId) === accountId);
  }

  private newest(lessonId: string): StoredRevision | null {
    const mine = this.revisions.filter((revision) => revision.lessonId === lessonId);
    return mine.sort((a, b) => b.revisionNumber - a.revisionNumber)[0] ?? null;
  }

  private byFingerprint(accountId: string, fingerprint: string): StoredRevision | null {
    return this.owned(accountId).find((revision) => revision.fingerprint === fingerprint) ?? null;
  }

  private insert(lessonId: string, revisionNumber: number, resolved: ResolvedLesson): StoredRevision {
    const revisionId = crypto.randomUUID();
    // Strictly increasing, so two drafts created in the same millisecond still order newest first.
    const createdAt = Math.max(this.clock(), (this.revisions.at(-1)?.createdAt ?? -1) + 1);
    const stored: StoredRevision = {
      lessonId, revisionId, revisionNumber, status: "draft", fingerprint: resolved.fingerprint,
      content: { ...resolved.normalizedLesson, lessonId, revisionId }, createdAt,
    };
    this.revisions.push(stored);
    return stored;
  }
}
