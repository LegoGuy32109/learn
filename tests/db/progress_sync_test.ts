// Progress sync against an ephemeral learn-test-<uuid> database: migration 003, idempotent push
// through real tokens and a real session cookie, epoch rejection, cursor paging, and a checkpoint
// that is rebuilt from the raw rows alone. The database is deleted in `finally`, including on
// failure. Nothing here prints a token.

import { assert, assertEquals } from "jsr:@std/assert";
import fixture from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { reduceProgress } from "../../src/shared/learning/progress.js";
import { selectCheckpoint } from "../../src/shared/learning/sync.js";
import { resolveLesson } from "../../src/shared/authoring/resolver.js";
import { createApp } from "../../src/app.ts";
import { TokenAdmin } from "../../src/server/identity/token-admin.ts";
import { redactBearerTokens } from "../../src/server/identity/redaction.ts";
import { TursoLessonRepository } from "../../src/server/repositories/lessons.ts";
import { TursoProgressRepository } from "../../src/server/repositories/progress.ts";
import { tursoDependencies } from "./support/dependencies.ts";
import { createAccount, createEphemeralDatabase } from "./support/ephemeral.ts";

const ORIGIN = "http://localhost";

Deno.test("progress sync in an ephemeral database", async (t) => {
  const ephemeral = await createEphemeralDatabase();
  const { db } = ephemeral;
  try {
    const started = Date.now();
    let now = Date.parse("2026-09-22T10:00:00Z");
    const clock = () => now;
    const accountId = await createAccount(db, "Josh Hale");
    const otherId = await createAccount(db, "Someone Else");
    const admin = new TokenAdmin(db, clock);
    const dependencies = tursoDependencies(db, clock);
    const app = createApp(dependencies);
    const call = (path: string, init: RequestInit = {}) => app(new Request(`${ORIGIN}${path}`, init));
    const writer = await admin.mint({ accountId, name: "phone", scopes: ["lessons:read", "lessons:write"] });
    const reader = await admin.mint({ accountId, name: "reader", scopes: ["lessons:read"] });
    const other = await admin.mint({ accountId: otherId, name: "other", scopes: ["lessons:read", "lessons:write"] });
    const cookieHeader = { cookie: (await dependencies.sessions.issue(new Request(ORIGIN), { accountId, displayName: "Josh Hale" })).split(";")[0] };
    const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

    // The demo lesson as this account's private draft: the revision progress is recorded against.
    const document = { ...structuredClone(fixture) } as Record<string, unknown>;
    delete document.lessonId;
    delete document.revisionId;
    const resolved = await resolveLesson(document);
    assert(resolved.valid && resolved.normalizedLesson);
    const stored = await new TursoLessonRepository(db).createLesson(accountId, resolved as any);
    const lesson = stored.content as any;
    const REVISION = stored.revisionId;

    const event = (type: string, data: Record<string, unknown> = {}, epoch = 0) => {
      now += 1000;
      return { id: crypto.randomUUID(), type, lessonRevisionId: REVISION, epoch, occurredAt: new Date(now).toISOString(), ...data };
    };
    const push = (stream: string, events: unknown[], headers: Record<string, string> = cookieHeader, epoch = 0) =>
      call(`/api/v1/progress/${stream}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ lessonRevisionId: REVISION, epoch, events }) });
    const pullAll = async (stream: string, headers: Record<string, string> = cookieHeader, limit = 3) => {
      const events: any[] = [];
      let cursor = "";
      for (let pages = 0; pages < 100; pages++) {
        const response = await call(`/api/v1/progress/${stream}?revision=${REVISION}&epoch=0&limit=${limit}&cursor=${cursor}`, { headers });
        assertEquals(response.status, 200);
        const page = await response.json();
        events.push(...page.events);
        cursor = page.cursor;
        if (!page.hasMore) break;
      }
      return events;
    };
    const checkpoint = async () => (await call(`/api/v1/progress/checkpoint?revision=${REVISION}&epoch=0`, { headers: cookieHeader })).json();

    await t.step("migration 003 applied; 001 and 002 are untouched", async () => {
      const versions = await db.execute("SELECT version FROM schema_migrations ORDER BY version");
      assertEquals(versions.rows.map((row) => String(row.version)), ["001_initial.sql", "002_passkeys_and_invites.sql", "003_progress_sync.sql"]);
      const tables = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('progress_streams', 'progress_events', 'navigation_events') ORDER BY name");
      assertEquals(tables.rows.map((row) => String(row.name)), ["navigation_events", "progress_events", "progress_streams"]);
      const columns = await db.execute("SELECT name FROM pragma_table_info('progress_events') ORDER BY name");
      const names = columns.rows.map((row) => String(row.name));
      assert(names.includes("occurred_at") && names.includes("received_at"), "both clocks are stored");
      assert(!names.some((name) => /duration/.test(name)), "no response duration is stored");
    });

    const concept = lesson.concepts[0];
    const evidence = [event("lesson_started"), ...concept.cards.map((card: any) => event("card_seen", { cardId: card.id, conceptId: concept.id }))];
    const short = lesson.questions.find((question: any) => question.type === "short");
    const typed = "  If-None-Match\u00a0« typed » 🙂 ";
    const shortAnswer = event("question_answered", { flowKind: "check", conceptId: short.conceptId, poolId: short.poolId, questionId: short.id, attemptId: "a1", answer: typed, correct: false });
    evidence.push(shortAnswer);

    await t.step("repeated upload is stored once, by cookie or by bearer, and the rows carry both clocks", async () => {
      const first = await push("learning-events", evidence);
      assertEquals(first.status, 200);
      assertEquals((await first.json()).accepted, evidence.length);
      const again = await push("learning-events", evidence, bearer(writer.token));
      assertEquals(await again.json().then((body) => [body.accepted, body.duplicates]), [0, evidence.length]);
      const rows = await db.execute({ sql: "SELECT id, occurred_at, received_at FROM progress_events WHERE account_id = ? ORDER BY seq", args: [accountId] });
      assertEquals(rows.rows.length, evidence.length);
      assertEquals(String(rows.rows[0].occurred_at), evidence[0].occurredAt);
      const receivedAt = Number(rows.rows[0].received_at);
      assert(receivedAt >= started && receivedAt <= Date.now(), "received_at is the server's clock at ingest, not the client's occurred_at");
      const forbidden = await push("learning-events", evidence, bearer(reader.token));
      assertEquals(forbidden.status, 403);
      await forbidden.body?.cancel();
    });

    await t.step("the short-answer text round-trips unchanged and paging never skips or repeats", async () => {
      const pulled = await pullAll("learning-events");
      assertEquals(pulled.length, evidence.length);
      assertEquals(new Set(pulled.map((made) => made.id)).size, evidence.length);
      assertEquals(pulled.find((made) => made.id === shortAnswer.id), shortAnswer);
      const byReader = await pullAll("learning-events", bearer(reader.token), 2);
      assertEquals(new Set(byReader.map((made) => made.id)), new Set(pulled.map((made) => made.id)));
    });

    await t.step("out-of-order arrival on another account reduces to the same progress", async () => {
      const reversed = [...evidence].reverse();
      assertEquals((await push("learning-events", reversed.slice(0, 2), bearer(other.token))).status, 404, "a private draft is unknown to another account");
      // Publish the revision so the other account may learn it, then push reversed.
      await db.execute({ sql: "UPDATE lesson_revisions SET status = 'published', published_at = ? WHERE id = ?", args: [now, REVISION] });
      for (const piece of [reversed.slice(0, 2), reversed.slice(2)]) {
        const response = await push("learning-events", piece, bearer(other.token));
        assertEquals(response.status, 200);
        await response.body?.cancel();
      }
      const a = reduceProgress(lesson, await pullAll("learning-events"));
      const b = reduceProgress(lesson, await pullAll("learning-events", bearer(other.token)));
      assertEquals([a.state, [...a.cardsSeen].sort(), a.conceptStates], [b.state, [...b.cardsSeen].sort(), b.conceptStates]);
    });

    await t.step("a Question outside the revision and an unknown revision are rejected without storing anything", async () => {
      const count = async () => Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM progress_events WHERE account_id = ?", args: [accountId] })).rows[0].n);
      const before = await count();
      const foreign = event("question_answered", { flowKind: "check", conceptId: short.conceptId, poolId: short.poolId, questionId: crypto.randomUUID(), attemptId: "a1", answer: "x", correct: false });
      const rejected = await push("learning-events", [event("lesson_started"), foreign]);
      assertEquals(rejected.status, 422);
      assertEquals((await rejected.json()).rejections.map((entry: any) => entry.code), ["question.unknown"]);
      assertEquals(await count(), before);
      const unknown = await call("/api/v1/progress/learning-events", { method: "POST", headers: { ...cookieHeader, "content-type": "application/json" }, body: JSON.stringify({ lessonRevisionId: crypto.randomUUID(), epoch: 0, events: [] }) });
      assertEquals(unknown.status, 404);
      assertEquals((await unknown.json()).code, "revision.unknown");
    });

    const ids = evidence.map((made) => made.id);
    const checkpointed = (frontier: string[], marker: string, occurredAt: string, id = crypto.randomUUID()) => ({
      ...event("navigation_checkpointed", { checkpoint: { screen: "card", conceptIndex: 0, cardIndex: 0, flowKind: "cards", seed: 0, attemptId: "", queue: [], feedback: null, detour: null, marker, learningEventFrontier: frontier } }),
      id,
      occurredAt,
    });

    await t.step("the checkpoint follows the frontier, a stale one never replaces a fuller one, and equal frontiers break ties deterministically", async () => {
      const ahead = checkpointed(ids, "ahead", "2026-09-22T10:00:00.000Z");
      const stale = checkpointed(ids.slice(0, 2), "stale", "2026-09-22T12:00:00.000Z");
      assertEquals((await push("navigation-events", [ahead])).status, 200);
      assertEquals((await checkpoint()).checkpoint.marker, "ahead");
      assertEquals((await push("navigation-events", [stale])).status, 200);
      assertEquals((await checkpoint()).checkpoint.marker, "ahead");
      const later = checkpointed(ids, "later", "2026-09-22T11:00:00.000Z");
      assertEquals((await push("navigation-events", [later])).status, 200);
      assertEquals((await checkpoint()).checkpoint.marker, "later");
      const low = checkpointed(ids, "low", "2026-09-22T11:00:00.000Z", "00000000-0000-4000-8000-00000000000a");
      const high = checkpointed(ids, "high", "2026-09-22T11:00:00.000Z", "ffffffff-ffff-4fff-bfff-ffffffffffff");
      assertEquals((await push("navigation-events", [low, high])).status, 200);
      assertEquals((await checkpoint()).checkpoint.marker, "high");
    });

    await t.step("replaying the raw rows through the shared rule reproduces the served checkpoint with no projection anywhere", async () => {
      const projections = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%checkpoint%'");
      assertEquals(projections.rows.length, 0, "the server stores no checkpoint projection");
      const repository = new TursoProgressRepository(db);
      const scope = { lessonRevisionId: REVISION, epoch: 0 };
      const navigation = (await repository.all(accountId, "navigation", scope)).map((row) => row.event);
      const learning = (await repository.all(accountId, "learning", scope)).map((row) => row.event);
      const served = await checkpoint();
      assertEquals(selectCheckpoint(navigation, learning), served.checkpoint);
      assertEquals(selectCheckpoint([...navigation].reverse(), learning), served.checkpoint);
      assertEquals(served.frontier, ids.length);
      assertEquals(served.learningEvents, learning.length);
    });

    await t.step("an old epoch is rejected on push and pull once the stream has advanced", async () => {
      const advanced = await push("learning-events", [event("lesson_started", {}, 1)], cookieHeader, 1);
      assertEquals(advanced.status, 200);
      assertEquals((await advanced.json()).stream.epoch, 1);
      const stream = await db.execute({ sql: "SELECT epoch, lesson_revision_id FROM progress_streams WHERE account_id = ? AND lesson_id = ?", args: [accountId, stored.lessonId] });
      assertEquals([Number(stream.rows[0].epoch), String(stream.rows[0].lesson_revision_id)], [1, REVISION]);
      const stale = await push("learning-events", [event("lesson_started")]);
      assertEquals(stale.status, 409);
      const body = await stale.json();
      assertEquals(body.code, "epoch.stale");
      assertEquals(body.stream.epoch, 1);
      const stalePull = await call(`/api/v1/progress/navigation-events?revision=${REVISION}&epoch=0`, { headers: cookieHeader });
      assertEquals(stalePull.status, 409);
      await stalePull.body?.cancel();
      const older = await push("learning-events", [event("lesson_started")], cookieHeader, 0);
      assertEquals(older.status, 409);
      await older.body?.cancel();
      // The other account's stream is independent and still at epoch 0.
      const theirs = await call(`/api/v1/progress/learning-events?revision=${REVISION}&epoch=0`, { headers: bearer(other.token) });
      assertEquals(theirs.status, 200);
      await theirs.body?.cancel();
    });
  } catch (error) {
    throw new Error(redactBearerTokens(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)));
  } finally {
    await ephemeral.destroy();
  }
});
