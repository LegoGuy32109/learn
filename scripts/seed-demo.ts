import { resolveLesson } from "../src/shared/authoring/resolver.js";
import { createDb } from "../src/server/db.ts";
import { TursoLessonRepository } from "../src/server/repositories/lessons.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../fixtures/lessons/browser-http-cache.json", import.meta.url),
  ),
);
const resolved = await resolveLesson(fixture);
if (!resolved.valid || !resolved.fingerprint || !resolved.normalizedLesson) {
  console.error(JSON.stringify(resolved.diagnostics, null, 2));
  throw new Error("Demo lesson did not resolve");
}

const db = createDb();
const account = await db.execute(
  "SELECT id FROM accounts WHERE display_name = 'Josh Hale' LIMIT 1",
);
if (!account.rows.length) {
  throw new Error("Run deno task db:owner before seeding the demo");
}
const repository = new TursoLessonRepository(db);
const stored = await repository.createLesson(
  String(account.rows[0].id),
  resolved as any,
);
await db.execute({
  sql:
    "UPDATE lesson_revisions SET status = 'published', provenance_json = ?, published_at = COALESCE(published_at, ?) WHERE id = ?",
  args: [
    JSON.stringify(resolved.normalizedLesson.provenance),
    Date.now(),
    stored.revisionId,
  ],
});
console.log(`Demo revision ${stored.revisionId} is available.`);
