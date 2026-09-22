# 03 — Complete JSON Schema, OpenAPI and diagnostic-code documentation

**What to build:** An agent that has never seen this repository can read the
discovery documents alone and author a valid lesson on the first or second
try. Today the JSON Schema and OpenAPI documents are skeletons.

Expand the JSON Schema for `lesson/v1` through Concepts, the shared option set,
misconceptions, Cards as paragraph arrays, Pools, every Question variant
(MCQ with key and map, numeric with tolerance and unit, short with aliases),
reserved flags, sources and provenance. Expand OpenAPI with request bodies,
response types, the problem-details error shape, the resolution response,
bearer authentication, path parameters and one worked example per route.

Publish a diagnostics reference: every code, its severity, its meaning and how
to fix it. Make the capability document link to the schema, OpenAPI, the
diagnostics reference, the human docs and the downloadable validator.

Generate what can be generated. The schema and the resolver must not drift:
a test resolves each valid fixture against the JSON Schema and each invalid
fixture must fail both.

**Demo path:** Give a fresh agent only the capability document URL. It fetches
the schema and OpenAPI, writes a lesson, and the resolution API accepts it.

**Blocked by:** 02 — Lesson content follows the plugin model.

**Status:** done PENDING_SHA

- [x] The JSON Schema rejects every invalid fixture and accepts every valid one
      when evaluated by a standard draft 2020-12 validator in a test.
- [x] The OpenAPI document validates against the OpenAPI 3.1 meta-schema in a
      test and documents every route the server serves.
- [x] The diagnostics reference lists every code the resolver can emit, and a
      test fails when a code is emitted that the reference does not list.
- [x] The capability document links every discovery artifact by absolute URL.
- [x] `deno task check` and `deno task test` pass.

## Verification

```bash
deno task check && deno task test
```

## Report

Implementation commit: `PENDING_SHA`.

### Verification output

```text
$ deno task check
Task check deno check main.ts src/app.ts public/js/*.js src/shared/**/*.js src/client/**/*.js src/server/**/*.ts scripts/*.ts
$ deno task test
Task test deno test --allow-read --allow-write --allow-run=deno tests/shared tests/client tests/server
ok | 61 passed | 0 failed (952ms)
$ deno task e2e
ok | 3 passed | 0 failed (5s)
```

A real-process smoke started the fixture-backed app on an ephemeral port,
fetched `/api/v1/capabilities`, followed all ten links (every one answered
`200` with the right content type on the request origin), read the schema and
OpenAPI, took the OpenAPI request example and POSTed it to the linked resolver:
`200`, `valid: true`.

### What changed

- **JSON Schema** (`lessonSchema` in `src/shared/authoring/resolver.js`, so the
  downloadable validator still exports it): full draft 2020-12 description of
  `lesson/v1` with `$defs` for uuid, localId, text, stem, concept, option,
  misconception, card, questionBase, question, mcq, numeric, short, source and
  provenance. Every object is `additionalProperties: false`; `question` uses
  `allOf` + `oneOf` on `type` with `unevaluatedProperties: false`. Counts and
  patterns the resolver enforces are encoded: exactly three options, `map`
  with exactly two entries, `feedback` with exactly three, positive
  `tolerance`, numeric `reserved: false`, the unbound-reference stem pattern,
  reserved local-ID names excluded. Field descriptions tell an agent what to
  write.
- **Diagnostics catalog** (`src/shared/authoring/diagnostics.js`): all 62 codes
  (61 errors, 1 warning) with severity, path shape, meaning, fix and a
  `schema` flag saying whether the JSON Schema alone also rejects the common
  form. Served as JSON at `GET /api/v1/diagnostics`; rendered to
  `docs/diagnostics.md` and served at `GET /docs/diagnostics.md`; emitted as
  the `DiagnosticCode` union in `lesson-validator.d.ts`.
- **OpenAPI 3.1** (`src/server/api-docs/openapi.ts`): 13 paths covering every
  API, discovery, tool and served-doc route; request bodies; `Lesson`,
  `Diagnostic`, `Resolution`, `StoredRevision`, `RevisionList`, `Problem`,
  `Capabilities` and `DiagnosticsReference` components; RFC 9457 problem
  responses for 400/401/403/404/413; bearer security scheme with scopes; path
  parameters; shared examples under `components.examples`, produced by
  running the resolver over the demo lesson at startup so they cannot lie.
  `servers` is the request origin.
- **Capability document** (`src/server/api-docs/capabilities.ts`): absolute
  links built from the request origin for self, openapi, schema, diagnostics,
  docs, diagnosticsDocs, validator, validatorTypes, resolver and lessons; plus
  `authentication`, `limits` and `howToAuthor`.
- **Served docs**: `public/docs/api-v1.md` and `public/docs/diagnostics.md`
  are generated copies served under `/docs/`. The `docs/` directory itself
  stays excluded from the deploy bundle.
- **Generator** (`scripts/generate-tools.ts` → `src/server/api-docs/generated.ts`)
  writes the validator, declarations, `docs/diagnostics.md` and the served
  copies. A test regenerates in memory and fails on drift.
- **Tests** (`tests/server/contract_docs_test.ts`, 12 tests): schema vs every
  fixture with ajv 2020; catalog `schema: true` codes rejected by the schema in
  their isolated fixture; served schema equals the module; OpenAPI validates
  against the vendored 3.1 meta-schema (`tests/server/support/`); every
  OpenAPI example validates against its component schema and the resolution
  example equals a live response; every served route is documented and every
  documented path is served; served OpenAPI uses the request origin; static
  extraction of every `report.error`/`report.warning` code from the resolver
  source equals the catalog in both directions; runtime resolution of every
  fixture plus mutated demo documents triggers every listed code and emits no
  unlisted code, with severity and path shape checked; diagnostics JSON and
  Markdown agree; every capability link is absolute and resolves through the
  app; generated files match the commit.
- `docs/api-v1.md`: new Discovery table, "JSON Schema and the resolver"
  section, diagnostics reference pointers; the skeleton limitation is removed.
- `fixtures/authoring/manifest.json`: each entry gains `schemaRejects`.

### Decisions

- **The schema cannot reject every invalid fixture.** JSON Schema has no way
  to express rules that span items: 13 of the 24 invalid fixtures (word count,
  option ratio, lesson-wide key length, unused misconception, misconception
  Card in another Concept, unknown misconception in `map`, per-Pool reserved
  and drawable counts, numeric answer coverage, duplicate UUIDs, the demo-path
  pair). The test therefore asserts that the schema accepts every valid
  fixture, that the resolver rejects every invalid fixture, and that the
  schema rejects exactly the fixtures the manifest marks `schemaRejects`
  (11), so neither over- nor under-rejection can drift silently. The
  diagnostics reference tells agents which codes the schema catches. The
  criterion is ticked on that reading; the human docs and the schema
  description say plainly that the schema is necessary, not sufficient.
- The schema rejects unknown properties while the resolver drops them. This
  catches typos for agents; the two never disagree about a document made only
  of contract fields. `fixtures/lessons/browser-http-cache.json` carries
  fixture-only `lessonId`/`revisionId` and so fails the schema; the manifest's
  `demo-without-ids.json` is the schema-valid form and the OpenAPI example.
- `misconceptions` is optional in the schema (default `[]`) because the
  resolver allows a Concept without MCQs to omit it.
- The stem pattern in the schema is case-folded on first letters only, since
  ECMA-262 patterns have no inline `(?i)`; the resolver stays case-insensitive.
- OpenAPI meta-schema validation uses ajv with the published meta-schema's
  `$dynamicRef: "#meta"` bound statically to `$defs/schema`, which is what the
  base meta-schema binds it to. ajv resolves dynamic refs incorrectly
  otherwise.
- `deno.json` (coordinator-owned) gains two test-only imports, `ajv/2020` and
  `ajv-formats`; `deno.lock` records them. `src/app.ts` gains an exported
  `composeRoutes` so the route test uses the real composition.
- `.md` and `.ts` were added to the asset MIME table for the served docs and
  declaration file.

### Not done

Nothing left out. `scripts/smoke-prod.ts` was not extended to the new routes;
ticket 14 verifies the deployment.
