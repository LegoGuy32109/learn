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

async function resolve(body: BodyInit, headers: Record<string, string> = {}) {
  return await app(new Request("http://local/api/v1/lesson-resolutions", { method: "POST", body, headers }));
}

async function fixture(file: string) {
  return await Deno.readTextFile(new URL(`../../fixtures/${file}`, import.meta.url));
}

Deno.test("the demo path: a 90-word Card and an always-longest key return 422 with two diagnostics", async () => {
  const response = await resolve(await fixture("authoring/invalid/demo-path-two-diagnostics.json"));
  assertEquals(response.status, 422);
  const body = await response.json();
  assertEquals(body.valid, false);
  assertEquals(body.fingerprint, null);
  assertEquals(body.diagnostics.map((diagnostic: any) => [diagnostic.severity, diagnostic.code, diagnostic.path]), [
    ["error", "lesson.key.longest", "/concepts"],
    ["error", "card.words", "/concepts/0/cards/0/body"],
  ]);
});

Deno.test("a lesson with only warnings resolves 200 and includes them", async () => {
  const response = await resolve(await fixture("authoring/valid/warning-single-paragraph-card.json"));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.valid, true);
  assertEquals(body.diagnostics.map((diagnostic: any) => diagnostic.severity), ["warning"]);
});

Deno.test("every authoring fixture gets the status its validity implies", async () => {
  const manifest = JSON.parse(await fixture("authoring/manifest.json"));
  for (const entry of manifest) {
    const response = await resolve(await fixture(entry.file));
    assertEquals(response.status, entry.valid ? 200 : 422, entry.file);
    const body = await response.json();
    assertEquals(body.valid, entry.valid, entry.file);
  }
});

Deno.test("oversized, deeply nested and malformed bodies are rejected without a crash", async () => {
  const oversized = await resolve("x".repeat(1_000_001));
  assertEquals(oversized.status, 413);
  assertEquals(oversized.headers.get("content-type"), "application/problem+json; charset=utf-8");

  const deep = await resolve(`{"schema":"lesson/v1","extra":${"[".repeat(50_000)}${"]".repeat(50_000)}}`);
  assertEquals(deep.status, 422);
  assertEquals((await deep.json()).diagnostics.map((diagnostic: any) => diagnostic.code), ["document.nesting"]);

  const malformed = await resolve("{not json");
  assertEquals(malformed.status, 400);

  const polluted = await resolve('{"__proto__":{"valid":true},"constructor":{"prototype":{}},"schema":"lesson/v1"}');
  assertEquals(polluted.status, 422);
  assertEquals((await polluted.json()).valid, false);
});

Deno.test("draft persistence requires a bearer token", async () => {
  const response = await app(new Request("http://local/api/v1/lessons", { method: "POST", body: JSON.stringify(lesson) }));
  assertEquals(response.status, 401);
  assertEquals(response.headers.get("content-type"), "application/problem+json; charset=utf-8");
});

