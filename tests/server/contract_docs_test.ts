// The discovery contract must not drift from the code. These tests hold the JSON Schema, the
// OpenAPI document, the diagnostics reference, the capability document and the generated files
// to the resolver and the routes the server actually serves.
import { parseJson, readJson } from "../support/json.ts";
import {
  type AuthoredLesson,
  authoredLesson,
  DEMO_LESSON,
} from "../support/demo-lesson.ts";
import { assert, assertEquals } from "@std/assert";
import { Ajv2020 } from "ajv/2020";
import addFormatsModule from "ajv-formats";
import manifest from "../../fixtures/authoring/manifest.json" with {
  type: "json",
};
import openapiMetaSchema from "./support/openapi-3.1-schema.json" with {
  type: "json",
};
import {
  lessonSchema,
  MAX_DOCUMENT_BYTES,
  resolveLesson,
} from "../../src/shared/authoring/resolver.js";
import {
  DIAGNOSTIC_CODES,
  DIAGNOSTICS,
  diagnosticsReference,
} from "../../src/shared/authoring/diagnostics.js";
import { app, composeRoutes, fixtureDependencies } from "../../src/app.ts";
import {
  capabilitiesFor,
  discoveryLinks,
} from "../../src/server/api-docs/capabilities.ts";
import {
  BROWSER_ONLY_PATHS,
  openapiDocument,
} from "../../src/server/api-docs/openapi.ts";
import { generatedFiles } from "../../src/server/api-docs/generated.ts";
import { FixtureLessonRepository } from "../../src/server/repositories/lessons.ts";
import { RejectingAuthenticator } from "../../src/server/auth.ts";

const repo = new URL("../../", import.meta.url);

async function fixture(file: string): Promise<unknown> {
  return JSON.parse(await Deno.readTextFile(new URL(`fixtures/${file}`, repo)));
}

/** ajv-formats is CommonJS; Deno types its default import as the module namespace. */
const addFormats =
  ((addFormatsModule as unknown as { default?: unknown }).default ??
    addFormatsModule) as (ajv: Ajv2020) => void;

/** Strict for our own schemas. The OpenAPI meta-schema uses patterns strict mode rejects, so it is compiled leniently. */
function validator(strict = true) {
  const ajv = new Ajv2020({ strict, allErrors: true });
  addFormats(ajv);
  return ajv;
}

const demo = DEMO_LESSON;

/** The parts of the OpenAPI document the example walk reads. */
interface MediaObject {
  schema: { $ref: string };
  example?: unknown;
  examples?: { default: { $ref: string } };
}
interface Body {
  content?: Record<string, MediaObject>;
}
interface Operation {
  requestBody?: Body;
  responses?: Record<string, Body>;
}
interface OpenApiWalk {
  components: {
    schemas: Record<string, Record<string, unknown>>;
    examples: Record<string, { value: unknown }>;
  };
  paths: Record<string, Record<string, Operation | unknown[]>>;
}

/** Documents that exercise rules no committed fixture isolates, so every emitted code is seen at runtime. */
function mutatedDocuments(): unknown[] {
  // Each change breaks the contract on purpose: Object.assign writes a value of the wrong type,
  // and Reflect.deleteProperty removes a field the contract requires.
  const mutate = (change: (input: AuthoredLesson) => void) => {
    const input = authoredLesson(demo.title);
    change(input);
    return input;
  };
  const huge = mutate((input) =>
    input.assumedKnowledge = "x".repeat(MAX_DOCUMENT_BYTES + 1)
  );
  return [
    null,
    huge,
    mutate((input) => {
      Object.assign(input, {
        schema: "lesson/v2",
        concepts: [],
        sources: [],
        provenance: { status: "maybe" },
      });
      Reflect.deleteProperty(input, "schemaVersion");
      Reflect.deleteProperty(input, "title");
      Reflect.deleteProperty(input, "assumedKnowledge");
    }),
    mutate((input) => {
      Object.assign(input, { provenance: { status: "provided" } });
    }),
    mutate((input) => {
      Object.assign(input, { sources: [{ capturedText: 5 }] });
    }),
    mutate((input) => {
      const concept = input.concepts[0];
      concept.id = "not-a-uuid";
      concept.poolId = "not-a-uuid";
      Reflect.deleteProperty(concept, "title");
      concept.statement = "";
      concept.options[0].text = "";
      concept.options[1].id = concept.options[2].id;
      concept.cards = [concept.cards[0]];
      concept.cards[0].id = "x";
      Reflect.deleteProperty(concept.cards[0], "heading");
      concept.misconceptions[0].statement = "";
      concept.misconceptions[1].id = concept.misconceptions[2].id;
    }),
    mutate((input) => {
      const question = input.questions[0];
      question.id = "dup";
      question.conceptId = "missing";
      question.poolId = "missing";
      question.correctingCardId = "missing";
      Object.assign(question, { type: "essay", reserved: "yes" });
      Reflect.deleteProperty(question, "stem");
    }),
    mutate((input) => {
      const mcq = input.questions[0];
      assert(mcq.type === "mcq");
      mcq.map.extra = "validate_every_time";
      mcq.map[mcq.key] = "validate_every_time";
      mcq.feedback.extra = "text";
    }),
    mutate((input) => {
      const numeric = input.questions.find((question) =>
        question.type === "numeric"
      );
      assert(numeric);
      Object.assign(numeric, { answer: "sixty", tolerance: -1, unit: 4 });
      Reflect.deleteProperty(numeric, "feedback");
    }),
    mutate((input) => {
      const short = input.questions.find((question) =>
        question.type === "short"
      );
      assert(short);
      Object.assign(short, { aliases: [1] });
      Reflect.deleteProperty(short, "answer");
      Reflect.deleteProperty(short, "feedback");
    }),
  ];
}

Deno.test("the JSON Schema accepts every valid fixture and rejects each fixture the manifest marks schemaRejects", async () => {
  const validate = validator().compile(lessonSchema);
  for (const entry of manifest) {
    const document = await fixture(entry.file);
    const accepted = validate(document);
    const resolved = await resolveLesson(document);
    assertEquals(resolved.valid, entry.valid, `${entry.file}: resolver`);
    if (entry.valid) {
      assert(
        accepted,
        `${entry.file}: schema rejected a valid fixture: ${
          JSON.stringify(validate.errors)
        }`,
      );
    } else {
      assertEquals(
        accepted,
        !entry.schemaRejects,
        `${entry.file}: schema ${
          accepted ? "accepted" : "rejected"
        } but the manifest says schemaRejects ${entry.schemaRejects}`,
      );
      assert(
        !resolved.valid,
        `${entry.file}: the resolver must reject every invalid fixture`,
      );
    }
  }
  const invalid = manifest.filter((entry) => !entry.valid);
  assert(
    invalid.some((entry) => entry.schemaRejects) &&
      invalid.some((entry) => !entry.schemaRejects),
    "the manifest must show both schema-caught and resolver-only fixtures",
  );
});

Deno.test("codes the catalog marks schema: true are rejected by the JSON Schema in their isolated fixture", async () => {
  const validate = validator().compile(lessonSchema);
  const isolated = manifest.filter((entry) =>
    entry.exact && entry.codes.length === 1
  );
  for (const entry of isolated) {
    const catalog = DIAGNOSTICS.find((item) => item.code === entry.codes[0]);
    assert(catalog, `${entry.codes[0]} is not in the catalog`);
    if (!catalog.schema || catalog.severity === "warning") continue;
    assert(
      !validate(await fixture(entry.file)),
      `${entry.file}: catalog says the schema catches ${catalog.code} but it accepted the fixture`,
    );
  }
});

Deno.test("the JSON Schema is served, is the draft 2020-12 dialect and matches the resolver's constants", async () => {
  const response = await app(
    new Request("http://local/api/v1/schemas/lesson/v1"),
  );
  assertEquals(response.status, 200);
  const served = await readJson<typeof lessonSchema>(response);
  assertEquals(served, JSON.parse(JSON.stringify(lessonSchema)));
  assertEquals(served.$schema, "https://json-schema.org/draft/2020-12/schema");
  assertEquals(served.$defs.concept.properties.options.minItems, 3);
  assertEquals(served.$defs.concept.properties.options.maxItems, 3);
  assertEquals(served.$defs.mcq.properties.map.maxProperties, 2);
  assertEquals(served.$defs.mcq.properties.feedback.minProperties, 3);
  assertEquals(served.$defs.numeric.properties.tolerance.exclusiveMinimum, 0);
  for (
    const name of [
      "concept",
      "option",
      "misconception",
      "card",
      "mcq",
      "numeric",
      "short",
      "source",
      "provenance",
    ] as const
  ) assert(served.$defs[name], `$defs.${name} is documented`);
});

/**
 * The published meta-schema binds its Schema Object through `$dynamicRef: "#meta"`, which ajv
 * resolves incorrectly to the root. In the base (non-strict) meta-schema the anchor is bound to
 * `$defs/schema`, so binding it statically is equivalent.
 */
function bindDynamicAnchors(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(bindDynamicAnchors);
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.$dynamicRef === "#meta") return { $ref: "#/$defs/schema" };
  const { $dynamicAnchor: _anchor, ...rest } = record;
  return Object.fromEntries(
    Object.entries(rest).map(([key, item]) => [key, bindDynamicAnchors(item)]),
  );
}

Deno.test("the OpenAPI document validates against the OpenAPI 3.1 meta-schema", () => {
  const ajv = validator(false);
  const validate = ajv.compile(
    bindDynamicAnchors(openapiMetaSchema) as Record<string, unknown>,
  );
  const document: unknown = JSON.parse(
    JSON.stringify(openapiDocument("https://learn.joshhale.me")),
  );
  const conforms = validate(document);
  assert(conforms, JSON.stringify(validate.errors, null, 2));
  const built = openapiDocument("https://learn.joshhale.me");
  assertEquals(built.openapi, "3.1.0");
  assertEquals(built.components.securitySchemes.bearer.scheme, "bearer");
});

Deno.test("the OpenAPI examples validate against the component schemas they claim", async () => {
  const document = parseJson<OpenApiWalk>(
    JSON.stringify(openapiDocument("https://learn.joshhale.me")),
  );
  const components = document.components.schemas;
  // Embed the components as $defs of one schema resource: drop the Lesson component's $id and repoint the refs.
  const embed = (value: unknown) =>
    parseJson<Record<string, unknown>>(
      JSON.stringify(value, (key, item) => (key === "$id"
        ? undefined
        : typeof item === "string"
        ? item.replace("#/components/schemas/", "#/$defs/")
        : item)),
    );
  const withRefs = (schema: Record<string, unknown>) =>
    embed({
      ...schema,
      $defs: { ...(schema.$defs as object ?? {}), ...components },
    });
  const check = (name: string, example: unknown) => {
    const compiled = validator().compile(withRefs(components[name]));
    assert(
      compiled(example),
      `${name} example: ${JSON.stringify(compiled.errors)}`,
    );
  };
  /** The example of a media object: inline, or shared through components.examples. */
  const exampleOf = (mediaObject: MediaObject) => {
    if ("example" in mediaObject) return mediaObject.example;
    const ref = mediaObject.examples?.default.$ref ?? "";
    assert(ref.startsWith("#/components/examples/"), ref);
    const shared =
      document.components.examples[ref.slice("#/components/examples/".length)];
    assert(shared, `${ref} is not defined`);
    return shared.value;
  };
  const resolutions = document.paths["/api/v1/lesson-resolutions"].post;
  assert(!Array.isArray(resolutions), "the resolutions POST is an operation");
  /** The JSON media object of a body the resolutions operation must document. */
  const json = (body: Body | undefined, name: string) => {
    const media = body?.content?.["application/json"];
    assert(media, `the resolutions ${name} has a JSON example`);
    return media;
  };
  let checked = 0;
  for (const item of Object.values(document.paths)) {
    for (const operation of Object.values(item)) {
      if (Array.isArray(operation)) continue;
      const bodies = [
        operation.requestBody,
        ...Object.values(operation.responses ?? {}),
      ].filter((body) => body !== undefined);
      for (const body of bodies) {
        for (const mediaObject of Object.values(body.content ?? {})) {
          if (!("example" in mediaObject) && !mediaObject.examples) continue;
          const ref: string = mediaObject.schema.$ref;
          check(
            ref.slice("#/components/schemas/".length),
            exampleOf(mediaObject),
          );
          checked++;
        }
      }
    }
  }
  assert(checked >= 20, `only ${checked} examples were checked`);
  const live = await (await app(
    new Request("http://local/api/v1/lesson-resolutions", {
      method: "POST",
      body: JSON.stringify(
        exampleOf(json(resolutions.requestBody, "request")),
      ),
    }),
  )).json();
  assertEquals(
    live,
    exampleOf(json(resolutions.responses?.["200"], "200 response")),
  );
  check(
    "DiagnosticsReference",
    await (await app(new Request("http://local/api/v1/diagnostics"))).json(),
  );
  check(
    "Capabilities",
    await (await app(new Request("http://local/api/v1/capabilities"))).json(),
  );
});

Deno.test("the OpenAPI document covers every route the server serves and nothing it does not", async () => {
  const routes = composeRoutes({
    ...await fixtureDependencies(),
    lessons: new FixtureLessonRepository(demo),
    auth: new RejectingAuthenticator(),
  });
  const document = openapiDocument("https://learn.joshhale.me");
  const paths = document.paths as Record<string, Record<string, unknown>>;
  const documented = new Set<string>();
  for (const [path, item] of Object.entries(paths)) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (!(method in item)) continue;
      const concrete = path.replaceAll(
        /\{[^}]+\}/g,
        "6f1c1c2a-3b1e-4b6f-9a1c-2f6d8e4b7a10",
      );
      const match = routes.find((route) =>
        route.method === method.toUpperCase() &&
        route.pattern.test(`https://learn.joshhale.me${concrete}`)
      );
      assert(
        match,
        `${method.toUpperCase()} ${path} is documented but no route serves it`,
      );
      documented.add(`${match.method} ${match.pattern.pathname}`);
      if (!match.pattern.pathname.endsWith("*")) {
        assertEquals(
          match.pattern.pathname.replaceAll(/:([A-Za-z]+)/g, "{$1}"),
          path,
          "path parameters share the route's names",
        );
      }
    }
  }
  for (const route of routes) {
    if (BROWSER_ONLY_PATHS.has(route.pattern.pathname)) continue;
    assert(
      documented.has(`${route.method} ${route.pattern.pathname}`),
      `${route.method} ${route.pattern.pathname} is served but not documented in OpenAPI`,
    );
  }
  const withParameters =
    paths["/api/v1/lessons/{lessonId}/revisions/{revisionId}"]
      .parameters as Array<{ name: string; in: string; required: boolean }>;
  assertEquals(
    withParameters.map((
      parameter,
    ) => [parameter.name, parameter.in, parameter.required]),
    [["lessonId", "path", true], ["revisionId", "path", true]],
  );
});

Deno.test("the served OpenAPI document uses the request origin as its server", async () => {
  const response = await app(new Request("http://local:8123/openapi.json"));
  assertEquals(response.status, 200);
  const document = await readJson<ReturnType<typeof openapiDocument>>(
    response,
  );
  assertEquals(document.servers, [{ url: "http://local:8123" }]);
  assertEquals(
    document.components.examples.capabilities.value.links.schema,
    "http://local:8123/api/v1/schemas/lesson/v1",
  );
});

/** Every code literal the resolver source can pass to report.error or report.warning. */
async function codesInResolverSource(): Promise<Set<string>> {
  const source = await Deno.readTextFile(
    new URL("src/shared/authoring/resolver.js", repo),
  );
  const lists: Record<string, string[]> = {};
  for (const match of source.matchAll(/const ([A-Z_]+) = \[([^\]]+)\];/g)) {
    lists[match[1]] = [...match[2].matchAll(/"([^"]+)"/g)].map((item) =>
      item[1]
    );
  }
  const codes = new Set<string>();
  const calls = [
    ...source.matchAll(
      /report\.(?:error|warning)\(\s*(?:"([^"]+)"|`([^`]+)`)/g,
    ),
  ];
  assert(
    calls.length > 50,
    "the code extractor found too few report calls; update the regex",
  );
  for (const call of calls) {
    if (call[1]) {
      codes.add(call[1]);
      continue;
    }
    const template = call[2];
    const placeholder = template.match(/^([a-z]+)\.\$\{field\}$/);
    assert(placeholder, `unrecognized template code ${template}`);
    const list = lists[`${placeholder[1].toUpperCase()}_FIELDS`];
    assert(list, `no field list for ${template}`);
    for (const field of list) codes.add(`${placeholder[1]}.${field}`);
  }
  return codes;
}

Deno.test("the diagnostics reference lists every code the resolver source can emit, and no other", async () => {
  const inSource = await codesInResolverSource();
  const listed = new Set(DIAGNOSTIC_CODES);
  for (const code of inSource) {
    assert(
      listed.has(code),
      `resolver emits ${code} but the diagnostics reference does not list it`,
    );
  }
  for (const code of listed) {
    assert(
      inSource.has(code),
      `the diagnostics reference lists ${code} but the resolver never emits it`,
    );
  }
  assertEquals(
    DIAGNOSTIC_CODES.length,
    new Set(DIAGNOSTIC_CODES).size,
    "codes are unique",
  );
  for (const entry of DIAGNOSTICS) {
    assert(
      entry.meaning.length > 10 && entry.fix.length > 10,
      `${entry.code} needs a meaning and a fix`,
    );
    assert(
      entry.path === "" || entry.path.startsWith("/"),
      `${entry.code} path is a JSON Pointer shape`,
    );
  }
});

Deno.test("every diagnostic emitted at runtime is listed with its severity, and every listed code is seen", async () => {
  const seen = new Map<string, string>();
  const documents: unknown[] = [];
  for (const entry of manifest) documents.push(await fixture(entry.file));
  documents.push(...mutatedDocuments());
  const bySeverity = new Map(
    DIAGNOSTICS.map((entry) => [entry.code, entry.severity]),
  );
  for (const document of documents) {
    const result = await resolveLesson(document);
    for (const diagnostic of result.diagnostics) {
      assert(
        bySeverity.has(diagnostic.code),
        `resolver emitted unlisted code ${diagnostic.code} at ${diagnostic.path}`,
      );
      assertEquals(
        diagnostic.severity,
        bySeverity.get(diagnostic.code),
        `${diagnostic.code} severity differs from the reference`,
      );
      seen.set(diagnostic.code, diagnostic.path);
    }
  }
  for (const entry of DIAGNOSTICS) {
    assert(
      seen.has(entry.code),
      `no test document triggers ${entry.code}; add one to mutatedDocuments`,
    );
  }
  for (const entry of DIAGNOSTICS) {
    const shape = entry.path.replaceAll(/<optionId>/g, "[A-Za-z0-9_-]+")
      .replaceAll(/<[ij]>/g, "\\d+");
    assert(
      new RegExp(`^${shape}$`).test(seen.get(entry.code)!),
      `${entry.code}: emitted path ${
        seen.get(entry.code)
      } does not match documented ${entry.path}`,
    );
  }
});

Deno.test("the diagnostics reference is served as JSON and rendered as the committed markdown", async () => {
  const response = await app(new Request("http://local/api/v1/diagnostics"));
  assertEquals(response.status, 200);
  assertEquals(
    await response.json(),
    JSON.parse(JSON.stringify(diagnosticsReference)),
  );
  const markdown = await Deno.readTextFile(
    new URL("docs/diagnostics.md", repo),
  );
  for (const code of DIAGNOSTIC_CODES) {
    assert(
      markdown.includes(`| \`${code}\` |`),
      `docs/diagnostics.md lacks ${code}`,
    );
  }
  const served = await app(new Request("http://local/docs/diagnostics.md"));
  assertEquals(served.status, 200);
  assertEquals(
    served.headers.get("content-type"),
    "text/markdown; charset=utf-8",
  );
  assertEquals(await served.text(), markdown);
});

Deno.test("the capability document links every discovery artifact by absolute URL and each link resolves", async () => {
  for (
    const path of ["/api/v1/capabilities", "/.well-known/learn-joshhale.json"]
  ) {
    const response = await app(new Request(`https://learn.example${path}`));
    assertEquals(response.status, 200);
    const body = await readJson<ReturnType<typeof capabilitiesFor>>(response);
    assertEquals(
      body,
      JSON.parse(JSON.stringify(capabilitiesFor("https://learn.example"))),
    );
    assertEquals(
      Object.keys(body.links).sort(),
      Object.keys(discoveryLinks).sort(),
    );
    for (
      const [key, href] of Object.entries(body.links)
    ) {
      assert(
        href.startsWith("https://learn.example/"),
        `${key} link ${href} is not absolute on the request origin`,
      );
      const method = key === "resolver" || key === "lessons" ? "POST" : "GET";
      const linked = await app(
        new Request(href, {
          method,
          body: method === "POST" ? JSON.stringify(demo) : undefined,
        }),
      );
      assert(
        [200, 401].includes(linked.status),
        `${key} -> ${href} answered ${linked.status}`,
      );
      await linked.body?.cancel();
    }
    for (
      const required of [
        "schema",
        "openapi",
        "diagnostics",
        "docs",
        "diagnosticsDocs",
        "validator",
        "validatorTypes",
        "resolver",
        "lessons",
      ] as const
    ) assert(body.links[required], `links.${required}`);
    assertEquals(body.authentication.environmentVariable, "LEARN_TOKEN");
    assertEquals(body.limits.maxDocumentBytes, MAX_DOCUMENT_BYTES);
  }
});

Deno.test("the generated files match the committed ones (run deno task tools:generate)", async () => {
  for (const [path, content] of Object.entries(await generatedFiles())) {
    assertEquals(
      await Deno.readTextFile(new URL(path, repo)),
      content,
      `${path} is stale`,
    );
  }
  const declarations = await Deno.readTextFile(
    new URL("public/tools/lesson-validator.d.ts", repo),
  );
  for (const code of DIAGNOSTIC_CODES) {
    assert(declarations.includes(`"${code}"`), `DiagnosticCode lacks ${code}`);
  }
});
