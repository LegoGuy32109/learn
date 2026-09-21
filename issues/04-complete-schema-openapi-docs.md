# 04 — Complete JSON Schema, OpenAPI and diagnostic-code documentation

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

**Blocked by:** 03 — Author-quality diagnostics ported from the plugin validator.

**Status:** ready-for-agent

- [ ] The JSON Schema rejects every invalid fixture and accepts every valid one
      when evaluated by a standard draft 2020-12 validator in a test.
- [ ] The OpenAPI document validates against the OpenAPI 3.1 meta-schema in a
      test and documents every route the server serves.
- [ ] The diagnostics reference lists every code the resolver can emit, and a
      test fails when a code is emitted that the reference does not list.
- [ ] The capability document links every discovery artifact by absolute URL.
- [ ] `deno task check` and `deno task test` pass.

## Verification

```bash
deno task check && deno task test
```
