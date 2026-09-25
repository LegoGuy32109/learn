import { assert, assertEquals } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with {
  type: "json",
};
import manifest from "../../fixtures/authoring/manifest.json" with {
  type: "json",
};
import {
  MAX_DOCUMENT_BYTES,
  resolveLesson,
} from "../../src/shared/authoring/resolver.js";

const fixturesRoot = new URL("../../fixtures/", import.meta.url);

async function fixture(file: string): Promise<unknown> {
  return JSON.parse(await Deno.readTextFile(new URL(file, fixturesRoot)));
}

Deno.test("lesson/v1 resolver is deterministic and write-free", async () => {
  const first = await resolveLesson(lesson);
  const second = await resolveLesson(structuredClone(lesson));
  assert(first.valid, JSON.stringify(first.diagnostics));
  assert(first.fingerprint?.startsWith("sha256:"));
  assertEquals(first.fingerprint, second.fingerprint);
  assertEquals(first.normalizedLesson?.title, lesson.title);
  assertEquals(first.diagnostics, []);
});

Deno.test("the fingerprint ignores object key order and provenance but follows authored array order", async () => {
  const reordered = structuredClone(lesson) as any;
  reordered.concepts = reordered.concepts.map((concept: any) =>
    Object.fromEntries(Object.entries(concept).reverse())
  );
  reordered.provenance = { status: "declined" };
  const swapped = structuredClone(lesson) as any;
  swapped.concepts.reverse();
  const base = await resolveLesson(lesson);
  assertEquals((await resolveLesson(reordered)).fingerprint, base.fingerprint);
  assert((await resolveLesson(swapped)).fingerprint !== base.fingerprint);
});

Deno.test("resolver requires explicit provenance", async () => {
  const input = structuredClone(lesson) as any;
  delete input.provenance;
  const result = await resolveLesson(input);
  assertEquals(result.valid, false);
  assert(
    result.diagnostics.some((diagnostic) =>
      diagnostic.code === "provenance.required"
    ),
  );
});

Deno.test("declined provenance is explicit and valid", async () => {
  const input = structuredClone(lesson) as any;
  input.provenance = { status: "declined" };
  assert((await resolveLesson(input)).valid);
});

Deno.test("every authoring fixture resolves to its manifest outcome", async () => {
  for (const entry of manifest) {
    const result = await resolveLesson(await fixture(entry.file));
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
    assertEquals(
      result.valid,
      entry.valid,
      `${entry.file}: ${JSON.stringify(result.diagnostics)}`,
    );
    if (entry.exact) assertEquals(codes, entry.codes, entry.file);
    else {for (const code of entry.codes) {
        assert(
          codes.includes(code),
          `${entry.file} lacks ${code}: ${codes.join(", ")}`,
        );
      }}
    for (const diagnostic of result.diagnostics) {
      assert(
        diagnostic.path === "" || diagnostic.path.startsWith("/"),
        `${entry.file}: ${diagnostic.path} is not a JSON Pointer`,
      );
      assert(["error", "warning"].includes(diagnostic.severity));
    }
  }
});

Deno.test("each rule has a fixture that triggers only that rule", () => {
  const isolated = new Set(
    manifest.filter((entry) => entry.exact && entry.codes.length === 1).map((
      entry,
    ) => entry.codes[0]),
  );
  const required = [
    "concept.options.count",
    "mcq.key",
    "mcq.map.missing",
    "mcq.map.unknown",
    "mcq.feedback.missing",
    "misconception.card",
    "misconception.unused",
    "pool.reserved.missing",
    "numeric.reserved",
    "card.body.paragraphs",
    "card.words",
    "concept.options.ratio",
    "lesson.key.longest",
    "question.stem.unbound",
    "numeric.answer.uncovered",
    "numeric.tolerance.missing",
    "pool.drawable.minimum",
    "card.paragraphs.single",
  ];
  for (const code of required) {
    assert(isolated.has(code), `no isolated fixture for ${code}`);
  }
});

Deno.test("a lesson with only warnings resolves valid and includes them", async () => {
  const result = await resolveLesson(
    await fixture("authoring/valid/warning-single-paragraph-card.json"),
  );
  assert(result.valid);
  assertEquals(
    result.diagnostics.map((
      diagnostic,
    ) => [diagnostic.severity, diagnostic.code]),
    [["warning", "card.paragraphs.single"]],
  );
  assert(result.fingerprint);
});

Deno.test("diagnostics are ordered by path, then code, whatever the input order", async () => {
  const input = structuredClone(lesson) as any;
  input.questions[9].stem =
    "Compared with the previous one, what does no-store mean?";
  input.questions[1].tolerance = 0;
  input.questions[1].answer = 181;
  input.concepts[0].misconceptions[0].correctingCardId =
    input.concepts[1].cards[0].id;
  delete input.title;
  const result = await resolveLesson(input);
  const pairs = result.diagnostics.map((diagnostic) =>
    `${diagnostic.path} ${diagnostic.code}`
  );
  assertEquals(pairs, [
    "/concepts/0/misconceptions/0/correctingCardId misconception.card",
    "/questions/1/answer numeric.answer.uncovered",
    "/questions/1/tolerance numeric.tolerance.missing",
    "/questions/9/stem question.stem.unbound",
    "/title title.required",
  ]);
});

Deno.test("numeric segments sort numerically so /questions/10 follows /questions/9", async () => {
  const input = structuredClone(lesson) as any;
  input.questions[10].stem =
    "As mentioned before, which directive means store nothing?";
  input.questions[9].stem =
    "Other than the one already covered, which directive means store nothing?";
  const result = await resolveLesson(input);
  assertEquals(result.diagnostics.map((diagnostic) => diagnostic.path), [
    "/questions/9/stem",
    "/questions/10/stem",
  ]);
});

Deno.test("card word counts strip inline HTML before counting", async () => {
  const input = structuredClone(lesson) as any;
  const card = input.concepts[0].cards[0];
  const words =
    card.body.join(" ").replace(/<[^>]+>/g, "").trim().split(/\s+/).length;
  card.body = [
    card.body.join(" ") + " <code>" +
    Array.from({ length: 200 - words + 1 }, (_, index) => `tag${index}`).join(
      " ",
    ) + "</code>",
  ];
  const result = await resolveLesson(input);
  assertEquals(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "card.paragraphs.single",
    "card.words",
  ]);
  const tagged = structuredClone(lesson) as any;
  tagged.concepts[0].cards[0].body = tagged.concepts[0].cards[0].body.map((
    paragraph: string,
  ) => `<em class="x">${paragraph}</em>`);
  assertEquals((await resolveLesson(tagged)).diagnostics, []);
});

Deno.test("the normalized lesson keeps only contract fields and trims text", async () => {
  const input = structuredClone(lesson) as any;
  input.title = "  padded  ";
  input.unknownField = { nested: [1, 2, 3] };
  input.concepts[0].surprise = "ignored";
  const result = await resolveLesson(input);
  assert(result.valid, JSON.stringify(result.diagnostics));
  const normalized = result.normalizedLesson as any;
  assertEquals(normalized.title, "padded");
  assertEquals("unknownField" in normalized, false);
  assertEquals("surprise" in normalized.concepts[0], false);
  assertEquals(normalized.questions[0].reserved, false);
  assertEquals(normalized.questions[3].reserved, true);
  assertEquals(
    Object.keys(normalized.questions[0].feedback),
    [...Object.keys(normalized.questions[0].feedback)].sort(),
  );
});

Deno.test("adversarial documents are rejected without a crash or a hang", async () => {
  let deep: unknown = [];
  for (let depth = 0; depth < 100_000; depth++) deep = [deep];
  const nested = await resolveLesson({
    ...structuredClone(lesson),
    extra: deep,
  });
  assertEquals(nested.diagnostics.map((diagnostic) => diagnostic.code), [
    "document.nesting",
  ]);

  const huge = structuredClone(lesson) as any;
  huge.assumedKnowledge = "x".repeat(MAX_DOCUMENT_BYTES + 1);
  const oversized = await resolveLesson(huge);
  assertEquals(oversized.diagnostics.map((diagnostic) => diagnostic.code), [
    "document.size",
  ]);

  const scalars = await Promise.all(
    [null, 1, "lesson", [], true].map((value) => resolveLesson(value)),
  );
  for (const result of scalars) {
    assertEquals(result.diagnostics.map((diagnostic) => diagnostic.code), [
      "document.object",
    ]);
  }

  const polluted = JSON.parse(
    '{"__proto__":{"valid":true},"constructor":{"prototype":{"x":1}},"schema":"lesson/v1"}',
  );
  const result = await resolveLesson(polluted);
  assertEquals(result.valid, false);
  assertEquals(({} as any).valid, undefined);
});
