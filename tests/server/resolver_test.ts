import { assert, assertEquals } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { resolveLesson } from "../../src/shared/authoring/resolver.js";

Deno.test("lesson/v1 resolver is deterministic and write-free", async () => {
  const first = await resolveLesson(lesson);
  const second = await resolveLesson(structuredClone(lesson));
  assert(first.valid);
  assert(first.fingerprint?.startsWith("sha256:"));
  assertEquals(first.fingerprint, second.fingerprint);
  assertEquals(first.normalizedLesson?.title, lesson.title);
});

Deno.test("resolver requires explicit provenance", async () => {
  const input = structuredClone(lesson) as any;
  delete input.provenance;
  const result = await resolveLesson(input);
  assertEquals(result.valid, false);
  assert(result.diagnostics.some((diagnostic) => diagnostic.code === "provenance.required"));
});

Deno.test("declined provenance is explicit and valid", async () => {
  const input = structuredClone(lesson) as any;
  input.provenance = { status: "declined" };
  assert((await resolveLesson(input)).valid);
});

