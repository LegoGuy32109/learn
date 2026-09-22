import { assertEquals, assert } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { createApp } from "../../src/app.ts";
import { createDb } from "../../src/server/db.ts";
import { tursoDependencies } from "./support/dependencies.ts";

Deno.test("authenticated draft API persists idempotently in Turso", async () => {
  const token = Deno.env.get("LEARN_OWNER_TOKEN");
  if (!token) throw new Error("LEARN_OWNER_TOKEN must be set; run deno task db:owner");
  const db = createDb();
  const app = createApp(tursoDependencies(db));
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
  } finally {
    if (lessonId) {
      await db.execute({ sql: "DELETE FROM lesson_sources WHERE lesson_revision_id IN (SELECT id FROM lesson_revisions WHERE lesson_id = ?)", args: [lessonId] });
      await db.execute({ sql: "DELETE FROM lesson_revisions WHERE lesson_id = ?", args: [lessonId] });
      await db.execute({ sql: "DELETE FROM lessons WHERE id = ?", args: [lessonId] });
    }
  }
});
