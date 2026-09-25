// Ticket 13 audit: every contract attack, run against three implementations at once.
//
//   deno task audit:contract
//
// The three are the deployed resolution API, the validator downloaded from the deployed site and
// run in a subprocess with no network access, and the resolver in this repository. Every fixture
// must produce byte-identical result JSON from all three. An independent draft 2020-12 validator
// (ajv, not the project's code) then has to agree with the resolver about accepting or rejecting
// each fixture, judged by the served diagnostics catalog's own `schema` flags.
//
// The site under attack is LEARN_BASE_URL, defaulting to the deployed origin. The duplicate-draft
// attacks need LEARN_TOKEN (or LEARN_OWNER_TOKEN); without one they are recorded as skipped.
import { parseJson, readJson } from "../../support/json.ts";
import { type AuthoredLesson, DEMO_LESSON } from "../../support/demo-lesson.ts";
import type { Problem, RevisionReply } from "../../../src/shared/api/v1.d.ts";
import type { Resolution } from "../../../src/shared/authoring/resolver.js";
import { Ajv2020 } from "ajv/2020";
import addFormatsModule from "ajv-formats";
import { resolveLesson } from "../../../src/shared/authoring/resolver.js";
import { createApp, fixtureDependencies } from "../../../src/app.ts";
import { FixtureLessonRepository } from "../../../src/server/repositories/lessons.ts";
import { stubAuthenticator } from "../../support/stub-auth.ts";
import {
  assert,
  check,
  equal,
  observe,
  ORIGIN,
  report,
  results,
} from "./support.ts";

const here = new URL("./", import.meta.url);
const REPORT_PATH = new URL("./last-run.md", here).pathname;
const manifest = JSON.parse(
  await Deno.readTextFile(new URL("manifest.json", here)),
) as Attack[];

interface Attack {
  file: string;
  group: string;
  valid: boolean;
  codes: string[];
  exact: boolean;
  unknownProperties?: boolean;
  note: string;
}

const addFormats =
  ((addFormatsModule as unknown as { default?: unknown }).default ??
    addFormatsModule) as (ajv: Ajv2020) => void;

/**
 * Fixtures where the served diagnostics catalog's `schema` flag does not predict the independent
 * validator's actual behavior. Each is a filed defect, not a bug in this test: the per-fixture
 * check below asserts the OBSERVED (ground-truth) outcome, cites the ticket, and will start
 * failing loudly — the good kind of failure — the day the catalog or the schema changes and the
 * two stop disagreeing, which is exactly when the ticket should be closed.
 */
const KNOWN_SCHEMA_CATALOG_MISMATCHES: Record<
  string,
  { schemaAccepts: boolean; ticket: string }
> = {
  // Tickets 30 and 31 closed the catalog/schema disagreements this map used to carry:
  //   - mcq.map.extra / mcq.map.missing / mcq.feedback.extra / mcq.feedback.missing are now
  //     schema: false, matching that map/feedback only constrain property COUNT and key FORMAT.
  //   - misconception.id and concept.option.id now name only their resolver-only condition
  //     (a duplicate ID within the Concept); the schema-catchable conditions (missing, malformed,
  //     reserved name) moved to new schema: true codes misconception.id.invalid and
  //     concept.option.id.invalid.
  // This map is empty again; a future mismatch is filed as a new ticket and a new entry.
};

/** The runner the downloaded validator is driven by: one result JSON per line, in argument order. */
const RUNNER = `
import { resolveLesson } from "./lesson-validator.js";
const lines = [];
for (const path of Deno.args) {
  lines.push(JSON.stringify(await resolveLesson(JSON.parse(await Deno.readTextFile(path)))));
}
console.log(lines.join("\\n"));
`;

async function fetchText(
  path: string,
): Promise<{ status: number; type: string; body: string }> {
  const response = await fetch(ORIGIN + path);
  return {
    status: response.status,
    type: response.headers.get("content-type") ?? "",
    body: await response.text(),
  };
}

/** POST one document to the deployed resolution API and return the raw body. */
async function resolveRemote(
  body: string,
): Promise<{ status: number; type: string; body: string }> {
  const response = await fetch(`${ORIGIN}/api/v1/lesson-resolutions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return {
    status: response.status,
    type: response.headers.get("content-type") ?? "",
    body: await response.text(),
  };
}

/** One row of the served diagnostics catalog. */
interface CatalogEntry {
  code: string;
  schema: boolean;
  severity: string;
}

/** A document of exactly `bytes` serialized bytes, built by padding one source excerpt. */
function sized(
  base: { sources: Array<{ capturedText: string | null }> },
  bytes: number,
): string {
  const document = structuredClone(base);
  document.sources[0].capturedText = "";
  const overhead =
    new TextEncoder().encode(JSON.stringify(document)).byteLength;
  document.sources[0].capturedText = "x".repeat(bytes - overhead);
  return JSON.stringify(document);
}

Deno.test({
  name:
    "audit: contract attacks against the deployed API, the downloaded validator and the resolver",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const directory = await Deno.makeTempDir({ prefix: "learn-audit-" });
    try {
      await runAudit(directory);
    } finally {
      await Deno.remove(directory, { recursive: true });
      const text = report("Contract attacks");
      await Deno.writeTextFile(REPORT_PATH, text + "\n");
      console.log("\n" + text + "\n");
    }
    const failed = results.filter((result) => !result.ok);
    if (failed.length) {
      throw new Error(
        `${failed.length} audit checks failed; see ${REPORT_PATH}`,
      );
    }
  },
});

async function runAudit(directory: string) {
  // ---- The discovery artifacts, downloaded exactly as a stranger would -------------------------
  const validatorSource = await fetchText("/tools/lesson-validator.js");
  await check(
    "download · GET /tools/lesson-validator.js is served as JavaScript",
    () => {
      equal(
        [
          validatorSource.status,
          validatorSource.type.startsWith("text/javascript"),
        ],
        [200, true],
        "validator download",
      );
    },
  );
  await Deno.writeTextFile(
    `${directory}/lesson-validator.js`,
    validatorSource.body,
  );
  await Deno.writeTextFile(`${directory}/run.js`, RUNNER);

  const servedSchema = await fetchText("/api/v1/schemas/lesson/v1");
  const servedCatalog = await fetchText("/api/v1/diagnostics");
  await check(
    "download · GET /api/v1/schemas/lesson/v1 is draft 2020-12",
    () => {
      equal([
        servedSchema.status,
        parseJson<{ $schema?: string }>(servedSchema.body).$schema,
      ], [
        200,
        "https://json-schema.org/draft/2020-12/schema",
      ], "served schema");
    },
  );
  await check(
    "download · GET /api/v1/diagnostics lists every code with a schema flag",
    () => {
      const catalog = parseJson<{ diagnostics: CatalogEntry[] }>(
        servedCatalog.body,
      );
      assert(
        Array.isArray(catalog.diagnostics) && catalog.diagnostics.length > 50,
        "the catalog is a list of diagnostics",
      );
      for (const entry of catalog.diagnostics) {
        assert(
          typeof entry.schema === "boolean",
          `${entry.code} has no schema flag`,
        );
      }
    },
  );

  const schema = parseJson<Record<string, unknown>>(servedSchema.body);
  const catalogByCode = new Map<string, { schema: boolean; severity: string }>(
    parseJson<{ diagnostics: CatalogEntry[] }>(servedCatalog.body)
      .diagnostics.map((
        entry,
      ) => [entry.code, { schema: entry.schema, severity: entry.severity }]),
  );
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validateBySchema = ajv.compile(schema);

  // ---- Every committed fixture, through all three implementations ------------------------------
  const files: string[] = [];
  for (const attack of manifest) {
    const path = `${directory}/${attack.file}`;
    await Deno.copyFile(new URL(`fixtures/${attack.file}`, here), path);
    files.push(path);
  }

  // Two documents too large or too deep to commit are built here and attacked with the rest.
  const base = parseJson<AuthoredLesson>(
    await Deno.readTextFile(new URL("audit-lesson.json", here)),
  );
  const generated: Record<string, string> = {
    "generated-size-limit-plus-one.json": sized(base, 1_000_001),
    "generated-size-limit-exact.json": sized(base, 1_000_000),
    "generated-nesting-200-bare.json": `{"schema":"lesson/v1","deep":${
      "[".repeat(200)
    }${"]".repeat(200)}}`,
  };
  for (const [name, content] of Object.entries(generated)) {
    const path = `${directory}/${name}`;
    await Deno.writeTextFile(path, content);
    files.push(path);
  }

  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-remote",
      "--no-config",
      "--no-lock",
      "--deny-net",
      `--allow-read=${directory}`,
      `${directory}/run.js`,
      ...files,
    ],
    cwd: directory,
    stdout: "piped",
    stderr: "piped",
    env: { NO_COLOR: "1" },
  });
  const started = performance.now();
  const output = await command.output();
  const elapsed = performance.now() - started;
  const stderr = new TextDecoder().decode(output.stderr);
  await check(
    "validator · the downloaded validator runs offline, from a temporary directory, without hanging",
    () => {
      equal(
        output.code,
        0,
        `the validator subprocess exited ${output.code}: ${stderr}`,
      );
      assert(
        elapsed < 120_000,
        `the validator subprocess took ${Math.round(elapsed)}ms`,
      );
    },
  );
  const validatorLines = new TextDecoder().decode(output.stdout).trimEnd()
    .split("\n");
  await check(
    "validator · one result per document, in order",
    () => equal(validatorLines.length, files.length, "validator output lines"),
  );

  const byName = new Map<string, string>(
    files.map((
      path,
      index,
    ) => [path.slice(directory.length + 1), validatorLines[index] ?? ""]),
  );

  for (const attack of manifest) {
    const raw = await Deno.readTextFile(
      new URL(`fixtures/${attack.file}`, here),
    );
    const document = JSON.parse(raw);
    const local = JSON.stringify(await resolveLesson(document));
    const validator = byName.get(attack.file) ?? "";
    const remote = await resolveRemote(raw);
    const expectedStatus = attack.valid ? 200 : 422;

    await check(
      `${attack.group} · ${attack.file} · the API, the validator and the resolver return byte-identical JSON`,
      () => {
        assert(
          validator === local,
          `the downloaded validator differs from the resolver\n  validator: ${
            validator.slice(0, 400)
          }\n  resolver:  ${local.slice(0, 400)}`,
        );
        assert(
          remote.body === local,
          `the deployed API differs from the resolver\n  api:      ${
            remote.body.slice(0, 400)
          }\n  resolver: ${local.slice(0, 400)}`,
        );
      },
    );
    await check(
      `${attack.group} · ${attack.file} · the API answers ${expectedStatus}`,
      () => {
        equal(remote.status, expectedStatus, `status for ${attack.file}`);
      },
    );

    const parsed = parseJson<Resolution>(local);
    const codes: string[] = parsed.diagnostics.map((diagnostic) =>
      diagnostic.code
    );
    await check(
      `${attack.group} · ${attack.file} · diagnostics match the committed expectation`,
      () => {
        equal(parsed.valid, attack.valid, `valid for ${attack.file}`);
        for (const code of attack.codes) {
          assert(
            codes.includes(code),
            `${attack.file} must report ${code}; reported ${
              JSON.stringify(codes)
            }`,
          );
        }
        if (attack.exact) {
          equal(
            [...new Set(codes)].sort(),
            [...attack.codes].sort(),
            `exact codes for ${attack.file}`,
          );
        }
        for (const code of codes) {
          assert(
            catalogByCode.has(code),
            `${code} is emitted but absent from the served diagnostics catalog`,
          );
        }
      },
    );

    // The independent schema validator has to agree: it rejects when a code the served catalog
    // marks `schema: true` fired, or when the document carries properties outside the contract.
    const accepted = validateBySchema(document) as boolean;
    const errorCodes = codes.filter((code) =>
      catalogByCode.get(code)?.severity === "error"
    );
    const schemaShouldReject = attack.unknownProperties === true ||
      errorCodes.some((code) => catalogByCode.get(code)?.schema === true);
    const knownMismatch = KNOWN_SCHEMA_CATALOG_MISMATCHES[attack.file];
    if (knownMismatch) {
      observe(
        `${attack.group} · ${attack.file}`,
        `the served diagnostics catalog's schema flag disagrees with the independent validator's actual behavior; filed as ${knownMismatch.ticket}`,
      );
      await check(
        `${attack.group} · ${attack.file} · the independent draft 2020-12 validator matches the observed (filed-defect) behavior`,
        () => {
          equal(
            accepted,
            knownMismatch.schemaAccepts,
            `${knownMismatch.ticket}: expected the schema to ${
              knownMismatch.schemaAccepts ? "accept" : "reject"
            } this document`,
          );
        },
      );
    } else {
      await check(
        `${attack.group} · ${attack.file} · the independent draft 2020-12 validator agrees with the resolver`,
        () => {
          if (schemaShouldReject) {
            assert(
              !accepted,
              `the JSON Schema accepted a document the catalog says it catches (${
                JSON.stringify(errorCodes)
              }, unknownProperties=${attack.unknownProperties === true})`,
            );
            return;
          }
          assert(
            accepted,
            `the JSON Schema rejected a document no schema-caught code applies to (${
              JSON.stringify(errorCodes)
            }): ${JSON.stringify(validateBySchema.errors?.slice(0, 4))}`,
          );
        },
      );
    }
    // A document with only resolver-only failures must still pass the schema; that is the
    // "necessary, not sufficient" claim in docs/api-v1.md, asserted from the other side.
    if (!attack.valid && !schemaShouldReject && !knownMismatch) {
      await check(
        `${attack.group} · ${attack.file} · schema-passing but resolver-rejected, as the contract claims`,
        () => {
          assert(
            accepted && !parsed.valid,
            "the fixture must pass the schema and fail the resolver",
          );
        },
      );
    }
  }

  // ---- The generated hostile documents ---------------------------------------------------------
  const oversized = generated["generated-size-limit-plus-one.json"];
  const oversizedRemote = await resolveRemote(oversized);
  await check(
    "hostile-document · 1,000,001 bytes · the validator reports document.size alone",
    () => {
      const parsed = parseJson<Resolution>(
        byName.get("generated-size-limit-plus-one.json") ?? "{}",
      );
      equal(
        [
          parsed.valid,
          parsed.diagnostics.map((diagnostic) => diagnostic.code),
        ],
        [false, ["document.size"]],
        "oversized validator result",
      );
    },
  );
  await check(
    "hostile-document · 1,000,001 bytes · the API answers 413 with a problem document, not a resolution",
    () => {
      equal(oversizedRemote.status, 413, "oversized status");
      assert(
        oversizedRemote.type.includes("application/problem+json"),
        `413 content type was ${oversizedRemote.type}`,
      );
      const body = parseJson<Problem>(oversizedRemote.body);
      equal(
        [body.status, body.title],
        [413, "Request too large"],
        "413 problem document",
      );
    },
  );
  observe(
    "size limit",
    "At 1,000,001 bytes the API answers 413 problem+json and the validator answers document.size. " +
      "The bodies are not byte-identical, by design: docs/api-v1.md documents 413 as the transport-level answer to an oversized request, " +
      "so document.size is only reachable through the validator or through a body whose re-serialization is smaller than the raw request.",
  );

  const atLimitRemote = await resolveRemote(
    generated["generated-size-limit-exact.json"],
  );
  await check(
    "hostile-document · exactly 1,000,000 bytes · accepted by the API and the validator alike",
    () => {
      const parsed = parseJson<Resolution>(
        byName.get("generated-size-limit-exact.json") ?? "{}",
      );
      equal(
        [parsed.valid, atLimitRemote.status],
        [true, 200],
        "at-limit result",
      );
      assert(
        atLimitRemote.body === JSON.stringify(parsed),
        "the API and the validator differ at exactly the limit",
      );
    },
  );

  const deepRemote = await resolveRemote(
    generated["generated-nesting-200-bare.json"],
  );
  await check(
    "hostile-document · 200 levels deep · document.nesting alone, from the API and the validator",
    () => {
      const parsed = parseJson<Resolution>(
        byName.get("generated-nesting-200-bare.json") ?? "{}",
      );
      equal(parsed.diagnostics.map((diagnostic) => diagnostic.code), [
        "document.nesting",
      ], "deep validator result");
      equal(deepRemote.status, 422, "deep status");
      assert(
        deepRemote.body === JSON.stringify(parsed),
        "the API and the validator differ on a 200-level document",
      );
    },
  );

  for (
    const [name, body] of [
      ["array", "[]"],
      ["string", '"lesson"'],
      ["number", "7"],
      ["null", "null"],
      ["boolean", "true"],
    ]
  ) {
    const remote = await resolveRemote(body);
    const local = JSON.stringify(await resolveLesson(JSON.parse(body)));
    await check(
      `hostile-document · a JSON ${name} body is document.object alone, identically`,
      () => {
        equal(
          (JSON.parse(local) as Resolution).diagnostics.map((diagnostic) =>
            diagnostic.code
          ),
          ["document.object"],
          `${name} codes`,
        );
        equal(remote.status, 422, `${name} status`);
        assert(
          remote.body === local,
          `the API and the resolver differ on a JSON ${name}`,
        );
      },
    );
  }

  await check(
    "hostile-document · a malformed body is 400 problem+json",
    async () => {
      const remote = await resolveRemote("{not json");
      equal(remote.status, 400, "malformed status");
      assert(
        remote.type.includes("application/problem+json"),
        `400 content type was ${remote.type}`,
      );
    },
  );

  await check(
    "hostile-document · prototype pollution through __proto__ and constructor keys leaves Object.prototype clean",
    async () => {
      const hostile =
        '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"schema":"lesson/v1"}';
      const remote = await resolveRemote(hostile);
      const local = JSON.stringify(await resolveLesson(JSON.parse(hostile)));
      assert(
        remote.body === local,
        "the API and the resolver differ on a prototype-pollution body",
      );
      equal(
        parseJson<Resolution>(local).valid,
        false,
        "the hostile document must be rejected",
      );
      equal(
        ({} as { polluted?: unknown }).polluted,
        undefined,
        "Object.prototype was polluted by resolving the document",
      );
    },
  );

  // ---- OpenAPI: every documented route answers, every answering route is documented -------------
  await openapiCoverage();

  // ---- Drafts: idempotency with one token, isolation between accounts ---------------------------
  await draftAttacks();
}

/** Probe each route in the served OpenAPI document, and each route the server exposes. */
async function openapiCoverage() {
  const served = await fetchText("/openapi.json");
  await check(
    "openapi · the deployed document is served and names the deployed origin",
    () => {
      equal(served.status, 200, "openapi status");
      equal(
        parseJson<{ servers?: unknown }>(served.body).servers,
        [{ url: ORIGIN }],
        "openapi servers",
      );
    },
  );
  const document = parseJson<
    { paths: Record<string, Record<string, unknown>> }
  >(
    served.body,
  );

  // Every documented route must answer something other than 404-with-no-route.
  const sample = "6f1c1c2a-3b1e-4b6f-9a1c-2f6d8e4b7a10";
  for (
    const [path, item] of Object.entries(document.paths)
  ) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (!(method in item)) continue;
      const concrete = path.replaceAll(/\{[^}]+\}/g, sample);
      await check(
        `openapi · ${method.toUpperCase()} ${path} is answered by the deployed server`,
        async () => {
          const response = await fetch(ORIGIN + concrete, {
            method: method.toUpperCase(),
            headers: method === "get" || method === "delete"
              ? {}
              : { "content-type": "application/json" },
            body: method === "get" || method === "delete" ? undefined : "{}",
          });
          const body = await response.text();
          // A documented route may legitimately answer 400, 401, 404-for-a-missing-resource or 422.
          // What it may not do is answer the router's "no route matches this request" problem.
          assert(
            !body.includes("No route matches this request"),
            `${method.toUpperCase()} ${concrete} answered ${response.status} with the router's no-such-route problem`,
          );
        },
      );
    }
  }

  // The reverse direction — every served route is documented — cannot be probed from outside a
  // black box: there is no live endpoint that enumerates a remote process's route table, and this
  // worktree's own checkout is not the code running in production (production already carries
  // ticket 10's progress-sync routes, which this ticket's branch point predates). So this half is
  // checked against the LOCAL codebase's own OpenAPI builder and its own composed routes, which is
  // exactly the invariant tests/server/contract_docs_test.ts already holds for the code in this
  // worktree; it is re-asserted here as a rerunnable audit check, not skipped.
  const { composeRoutes } = await import("../../../src/app.ts");
  const { BROWSER_ONLY_PATHS, openapiDocument } = await import(
    "../../../src/server/api-docs/openapi.ts"
  );
  const localDocument = openapiDocument("https://learn.joshhale.me");
  const routes = composeRoutes(await fixtureDependencies());
  const documented = new Set<string>();
  for (
    const [path, item] of Object.entries(localDocument.paths)
  ) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (!(method in item)) continue;
      const concrete = path.replaceAll(/\{[^}]+\}/g, sample);
      const match = routes.find((route) =>
        route.method === method.toUpperCase() &&
        route.pattern.test(`https://learn.joshhale.me${concrete}`)
      );
      await check(
        `openapi (local) · ${method.toUpperCase()} ${path} matches a composed route`,
        () => {
          assert(
            match,
            `${method.toUpperCase()} ${path} is documented but no composed route serves it`,
          );
        },
      );
      if (match) documented.add(`${match.method} ${match.pattern.pathname}`);
    }
  }
  for (const route of routes) {
    if (BROWSER_ONLY_PATHS.has(route.pattern.pathname)) continue;
    await check(
      `openapi (local) · ${route.method} ${route.pattern.pathname} is documented`,
      () => {
        assert(
          documented.has(`${route.method} ${route.pattern.pathname}`),
          `${route.method} ${route.pattern.pathname} is served but not in the OpenAPI document`,
        );
      },
    );
  }

  const productionPaths = new Set(Object.keys(document.paths));
  const localPaths = new Set(Object.keys(localDocument.paths));
  const aheadInProduction = [...productionPaths].filter((path) =>
    !localPaths.has(path)
  );
  if (aheadInProduction.length) {
    observe(
      "openapi drift",
      `production documents ${aheadInProduction.length} path(s) this worktree's checkout does not (${
        aheadInProduction.join(", ")
      }); ` +
        "expected under the per-ticket worktree model, since this branch point predates a later ticket's merge to main, not a contract defect.",
    );
  }

  // The wildcard asset routes answer real files the document names; probe those files directly.
  const servedFiles = [
    "/tools/lesson-validator.js",
    "/tools/lesson-validator.d.ts",
    "/docs/api-v1.md",
    "/docs/diagnostics.md",
    "/plugin/marketplace.json",
    "/plugin/.claude-plugin/plugin.json",
    "/plugin/skills/lesson/SKILL.md",
    "/plugin/learn-lesson-plugin.zip",
  ];
  for (const path of servedFiles) {
    await check(`openapi · GET ${path} is served and documented`, async () => {
      const response = await fetch(ORIGIN + path);
      await response.body?.cancel();
      equal(response.status, 200, `${path} status`);
      assert(
        path in document.paths,
        `${path} is served but has no entry in the OpenAPI document`,
      );
    });
  }

  // Routes the plugin page and the capability document advertise, which the document must cover.
  const capabilities = parseJson<
    { authentication: { publicRoutes: string[] } }
  >((await fetchText("/api/v1/capabilities")).body);
  for (const url of capabilities.authentication.publicRoutes) {
    const path = new URL(url).pathname;
    await check(
      `openapi · the capability document's public route ${path} is in the OpenAPI document`,
      () => {
        const documentedPath = path in document.paths ||
          `${path}/info/refs` in document.paths;
        assert(
          documentedPath,
          `${path} is advertised as a public route but is not in the OpenAPI document`,
        );
      },
    );
  }
}

/** The duplicate-draft and cross-account attacks. */
async function draftAttacks() {
  const token = Deno.env.get("LEARN_TOKEN") ??
    Deno.env.get("LEARN_OWNER_TOKEN");
  const valid = parseJson<AuthoredLesson>(
    await Deno.readTextFile(new URL("fixtures/valid-audit-lesson.json", here)),
  );

  if (!token) {
    observe(
      "drafts",
      "LEARN_TOKEN was not set, so the deployed duplicate-draft attacks were skipped. Export it and rerun to cover them.",
    );
  } else {
    const post = (body: unknown) =>
      fetch(`${ORIGIN}/api/v1/lessons`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    await check(
      "drafts · the same valid lesson twice with the same token returns the same revision",
      async () => {
        const first = await post(valid);
        const created = await readJson<RevisionReply>(first);
        equal(first.status, 201, "first submission status");
        const second = await post(valid);
        const repeated = await readJson<RevisionReply>(second);
        equal(second.status, 201, "second submission status");
        equal([repeated.lessonId, repeated.revisionId], [
          created.lessonId,
          created.revisionId,
        ], "the retry must return the existing revision");
        observe(
          "drafts",
          `The audit lesson resolves to ${created.fingerprint} and lives at revision ${created.revisionId} of lesson ${created.lessonId}.`,
        );
      },
    );
    await check(
      "drafts · an unknown bearer token is 401, not 403 and not a draft",
      async () => {
        const response = await fetch(`${ORIGIN}/api/v1/lessons`, {
          method: "POST",
          headers: {
            authorization:
              "Bearer learn_pat_aaaaaaaa_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "content-type": "application/json",
          },
          body: JSON.stringify(valid),
        });
        const body = await response.text();
        equal(response.status, 401, "unknown token status");
        assert(
          !body.includes("revisionId"),
          "an unknown token must not create a draft",
        );
      },
    );
    await check("drafts · no bearer token at all is 401", async () => {
      const response = await fetch(`${ORIGIN}/api/v1/lessons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(valid),
      });
      await response.body?.cancel();
      equal(response.status, 401, "anonymous POST status");
    });
  }

  // Cross-account isolation runs against the composed routes with two accounts. The deployed
  // database holds one account, and this ticket does not create another one there.
  const dependencies = await fixtureDependencies();
  const demo = DEMO_LESSON;
  const lessons = new FixtureLessonRepository(demo);
  const app = createApp({
    ...dependencies,
    lessons,
    auth: stubAuthenticator({
      "token-a": {
        accountId: "account-a",
        scopes: ["lessons:read", "lessons:write"],
      },
      "token-b": {
        accountId: "account-b",
        scopes: ["lessons:read", "lessons:write"],
      },
      "token-read": { accountId: "account-a", scopes: ["lessons:read"] },
    }),
  });
  const submit = (bearer: string, body: unknown) =>
    app(
      new Request("http://local/api/v1/lessons", {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );

  await check(
    "drafts · the same lesson from a second account is a separate lesson, not the first account's",
    async () => {
      const first = await readJson<RevisionReply>(
        await submit("token-a", valid),
      );
      const again = await readJson<RevisionReply>(
        await submit("token-a", valid),
      );
      equal(
        again.revisionId,
        first.revisionId,
        "the same account retrying must get the same revision",
      );
      const other = await readJson<RevisionReply>(
        await submit("token-b", valid),
      );
      assert(
        other.lessonId !== first.lessonId,
        "a second account must not be handed the first account's lesson",
      );
      assert(
        other.revisionId !== first.revisionId,
        "a second account must not be handed the first account's revision",
      );
      equal(
        other.fingerprint,
        first.fingerprint,
        "the two accounts' revisions share a fingerprint",
      );
    },
  );

  await check(
    "drafts · a second account cannot read the first account's revision",
    async () => {
      const first = await readJson<RevisionReply>(
        await submit("token-a", valid),
      );
      const read = await app(
        new Request(
          `http://local/api/v1/lessons/${first.lessonId}/revisions/${first.revisionId}`,
          { headers: { authorization: "Bearer token-b" } },
        ),
      );
      await read.body?.cancel();
      equal(read.status, 404, "a foreign revision must be 404");
    },
  );

  await check(
    "drafts · a second account cannot add a revision to the first account's lesson",
    async () => {
      const first = await readJson<RevisionReply>(
        await submit("token-a", valid),
      );
      const response = await app(
        new Request(`http://local/api/v1/lessons/${first.lessonId}/revisions`, {
          method: "POST",
          headers: {
            authorization: "Bearer token-b",
            "content-type": "application/json",
          },
          body: JSON.stringify({ ...valid, title: `${valid.title}-forked` }),
        }),
      );
      await response.body?.cancel();
      equal(response.status, 404, "writing into a foreign lesson must be 404");
    },
  );

  await check(
    "drafts · a read-only token is 403 on a write route",
    async () => {
      const response = await submit("token-read", valid);
      await response.body?.cancel();
      equal(response.status, 403, "a token without lessons:write must be 403");
    },
  );
}
