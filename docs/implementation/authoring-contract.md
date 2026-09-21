# Workstream A: authoring contract

## Objective

Turn the current alpha resolver and discovery skeletons into one precise,
machine-consumable `lesson/v1` contract. Preserve JSON as the only 1.0 authoring
format unless Josh explicitly reopens that decision.

## Owned files

- `src/shared/authoring/**`
- `scripts/generate-tools.ts`
- `public/tools/**`
- new `src/server/api-docs/**`
- authoring-contract tests under `tests/shared/` and `tests/server/`

Do not wire routes in `src/app.ts`; export the finished documents/functions for
the coordinator.

## Required work

1. Expand JSON Schema through Concepts, Cards, Pools, all Question variants,
   sources, and provenance.
2. Expand OpenAPI with request bodies, response types, authentication, path
   parameters, examples, and problem responses.
3. Define stable diagnostic codes and ordering.
4. Add invariants for unique IDs, Concept/Card membership, pool membership,
   correcting Cards, aliases, numeric tolerance, and MCQ option IDs.
5. Make generated validator parity a test: the generated file and shared
   resolver must return byte-equivalent result JSON for the same fixture.
6. Add adversarial size, nesting, duplicate-ID, and prototype-key fixtures.
7. Document fingerprint canonicalization and prove object-key order does not
   change a fingerprint while authored array order does.

## Acceptance gate

```bash
deno task tools:generate
git diff --exit-code public/tools
deno task check
deno task test
```

Add a real-process smoke that downloads `lesson-validator.js`, imports it from
a temporary directory, resolves the canonical fixture, and matches the API
response.

