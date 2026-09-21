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

export interface LessonRepository {
  featured(): Promise<Record<string, any>>;
  createLesson(accountId: string, resolved: ResolvedLesson): Promise<StoredRevision>;
  createRevision(accountId: string, lessonId: string, resolved: ResolvedLesson): Promise<StoredRevision>;
  getRevision(accountId: string, lessonId: string, revisionId: string): Promise<StoredRevision | null>;
  listMine(accountId: string): Promise<Array<Record<string, unknown>>>;
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

export class FixtureLessonRepository implements LessonRepository {
  constructor(private lesson: Record<string, any>) {}
  async featured() { return this.lesson; }
  async createLesson(): Promise<StoredRevision> { throw new Error("Database is unavailable"); }
  async createRevision(): Promise<StoredRevision> { throw new Error("Database is unavailable"); }
  async getRevision(): Promise<StoredRevision | null> { return null; }
  async listMine(): Promise<Array<Record<string, unknown>>> { return []; }
}
