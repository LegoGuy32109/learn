import { assertEquals } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { createApp, fixtureDependencies } from "../../src/app.ts";
import { FixtureLessonRepository } from "../../src/server/repositories/lessons.ts";

const app = createApp({
  ...await fixtureDependencies(),
  lessons: new FixtureLessonRepository(lesson),
  auth: { async authenticate() { return { ok: false as const, reason: "unauthenticated" as const }; } },
});

Deno.test("capability discovery is public", async () => {
  const response = await app(new Request("http://local/.well-known/learn-joshhale.json"));
  assertEquals(response.status, 200);
  assertEquals((await response.json()).invokesModels, false);
});

Deno.test("resolver reports diagnostics without authentication", async () => {
  const invalid = structuredClone(lesson) as any;
  delete invalid.provenance;
  const response = await app(new Request("http://local/api/v1/lesson-resolutions", { method: "POST", body: JSON.stringify(invalid) }));
  assertEquals(response.status, 422);
  assertEquals((await response.json()).valid, false);
});

Deno.test("draft persistence requires a bearer token", async () => {
  const response = await app(new Request("http://local/api/v1/lessons", { method: "POST", body: JSON.stringify(lesson) }));
  assertEquals(response.status, 401);
  assertEquals(response.headers.get("content-type"), "application/problem+json; charset=utf-8");
});

