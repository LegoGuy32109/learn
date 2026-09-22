import { assertEquals, assert } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { createApp } from "../../src/app.ts";
import { createDb } from "../../src/server/db.ts";
import { tursoDependencies } from "./support/dependencies.ts";

Deno.test("authenticated draft API persists idempotently in Turso", async () => {
  const token = Deno.env.get("LEARN_OWNER_TOKEN");
  if (!token) throw new Error("LEARN_OWNER_TOKEN must be set; run deno task db:owner");
  const db = createDb();
  const dependencies = tursoDependencies(db);
  const app = createApp(dependencies);
  const input = structuredClone(lesson) as any;
  input.title = `Turso integration ${crypto.randomUUID()}`;
  input.provenance.session_reference = "database-integration-test";
  const request = () => new Request("http://local/api/v1/lessons", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  let lessonId = "";
  try {
    const first = await app(request());
    assertEquals(first.status, 201);
    const created = await first.json();
    lessonId = created.lessonId;
    assert(created.revisionId);
    assertEquals(created.status, "draft");

    const repeated = await app(request());
    assertEquals(repeated.status, 201);
    assertEquals((await repeated.json()).revisionId, created.revisionId);

    const read = await app(new Request(`http://local/api/v1/lessons/${created.lessonId}/revisions/${created.revisionId}`, { headers: { authorization: `Bearer ${token}` } }));
    assertEquals(read.status, 200);
    const revision = await read.json();
    assertEquals(revision.content.sources[0].locator, input.sources[0].locator);
    assertEquals(revision.content.provenance.session_reference, "database-integration-test");

    const listed = await app(new Request("http://local/api/v1/lessons", { headers: { authorization: `Bearer ${token}` } }));
    assertEquals(listed.status, 200);
    assert((await listed.json()).revisions.some((revision: any) => revision.revisionId === created.revisionId));

    // The shelf: newest lesson first with its newest revision, by bearer and by the browser cookie.
    const shelf = await app(new Request("http://local/api/v1/shelf", { headers: { authorization: `Bearer ${token}` } }));
    assertEquals(shelf.status, 200);
    const { lessons } = await shelf.json();
    assertEquals(lessons[0].lessonId, created.lessonId);
    assertEquals(lessons[0].latestRevisionId, created.revisionId);
    assertEquals(lessons[0].latestRevisionNumber, 1);
    assertEquals(lessons[0].conceptCount, 3);
    assertEquals(lessons.filter((lesson: any) => lesson.lessonId === created.lessonId).length, 1);

    input.title = `${input.title} (revised)`;
    const revised = await app(new Request(`http://local/api/v1/lessons/${created.lessonId}/revisions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    }));
    assertEquals(revised.status, 201);
    const second = await revised.json();
    assertEquals(second.revisionNumber, 2);

    const owner = await db.execute({ sql: "SELECT account_id FROM api_tokens WHERE token_prefix = ?", args: [token.split("_")[2]] });
    const accountId = String(owner.rows[0].account_id);
    const setCookie = await dependencies.sessions.issue(new Request("http://local/"), { accountId, displayName: "Josh" });
    const byCookie = await app(new Request("http://local/api/v1/shelf", { headers: { cookie: setCookie.split(";")[0] } }));
    assertEquals(byCookie.status, 200);
    const afterRevision = (await byCookie.json()).lessons;
    assertEquals(afterRevision[0].lessonId, created.lessonId);
    assertEquals(afterRevision[0].latestRevisionId, second.revisionId);
    assertEquals(afterRevision[0].latestRevisionNumber, 2);
    assertEquals(afterRevision[0].title, input.title);
    assertEquals(afterRevision.filter((lesson: any) => lesson.lessonId === created.lessonId).length, 1);

    const cookieRead = await app(new Request(`http://local/api/v1/lessons/${created.lessonId}/revisions/${created.revisionId}`, { headers: { cookie: setCookie.split(";")[0] } }));
    assertEquals(cookieRead.status, 200);
    assertEquals((await cookieRead.json()).content.revisionId, created.revisionId);
    const latest = await app(new Request(`http://local/api/v1/lessons/${created.lessonId}`, { headers: { cookie: setCookie.split(";")[0] } }));
    assertEquals(latest.status, 200);
    assertEquals((await latest.json()).revisionId, second.revisionId);
  } finally {
    if (lessonId) {
      await db.execute({ sql: "DELETE FROM lesson_sources WHERE lesson_revision_id IN (SELECT id FROM lesson_revisions WHERE lesson_id = ?)", args: [lessonId] });
      await db.execute({ sql: "DELETE FROM lesson_revisions WHERE lesson_id = ?", args: [lessonId] });
      await db.execute({ sql: "DELETE FROM lessons WHERE id = ?", args: [lessonId] });
    }
  }
});
