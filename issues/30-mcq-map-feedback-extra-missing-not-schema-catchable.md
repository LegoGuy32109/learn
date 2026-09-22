# 30 — Four MCQ diagnostic codes are marked `schema: true` but are not schema-catchable in general

**What to build:** Either make `map` and `feedback` genuinely schema-checkable
against their Concept's real option IDs (for example with ajv's `$data`
references, if the served schema is allowed to depend on it), or correct the
`schema` flag for these four codes to `false` and update `docs/diagnostics.md`,
`docs/api-v1.md` and the generated diagnostics catalog to say so.

Found by ticket 13's contract-attack audit
(`tests/audit/contract-attacks/contract_attacks_test.ts`), run against the
deployed API at `https://learn-joshhale.legoguy32109.deno.net` and the
downloaded validator, using an independent draft 2020-12 validator (ajv), not
the project's code.

## The claim under test

`GET /api/v1/diagnostics` (and `docs/diagnostics.md`) marks these four codes
`"schema": true`, meaning "schema and resolver" in the Markdown table:

- `mcq.map.extra`
- `mcq.map.missing`
- `mcq.feedback.extra`
- `mcq.feedback.missing`

`docs/api-v1.md` says: "Passing the schema is necessary, not sufficient
... The two never disagree about a document that has only contract fields,"
and the diagnostics reference's own "Caught by" column is defined as
"whether the JSON Schema ... also rejects a document with this problem."

## Why it is false in general

The served schema's `mcq.map` and `mcq.feedback` definitions only constrain
**shape**: `map` requires exactly 2 properties whose names match the local-id
pattern and whose values are local ids; `feedback` requires exactly 3
properties matching the same pattern with string values. Neither definition
can see the Concept's actual three option IDs — that is cross-item data (the
Concept's `options` array lives elsewhere in the document), and the schema
carries no `$data` reference to it.

The resolver, by contrast, checks the true membership: it emits
`mcq.map.extra` for a map entry that names the correct-count number of
properties but the wrong specific option ID (or the key itself), and
`mcq.map.missing` when a real distractor option has no entry — again
independent of whether the property count happens to be 2. When the mismatch
is one of identity rather than count, the schema has nothing to reject.

## Reproduction

Both fixtures are committed at
`tests/audit/contract-attacks/fixtures/ref-duplicate-concept-id.json` and
`tests/audit/contract-attacks/fixtures/ref-mcq-key-not-in-set.json`, generated
by `tests/audit/contract-attacks/generate.ts` from the audit lesson.

```bash
# ref-mcq-key-not-in-set.json: question.key set to "nope", an id in no
# Concept's option set. The map keeps its original 2 real-distractor entries.
curl -sS -X POST https://learn-joshhale.legoguy32109.deno.net/api/v1/lesson-resolutions \
  -H 'content-type: application/json' \
  --data-binary @tests/audit/contract-attacks/fixtures/ref-mcq-key-not-in-set.json
# -> 422, diagnostics include "mcq.key" (schema:false, correctly) and
#    "mcq.map.missing" (schema:true) at /questions/0/map/bump — the Concept's
#    real key, which the map now needs an entry for, since "nope" is the
#    submitted (fake) key.
```

```js
// An independent draft 2020-12 validator (ajv), against the served schema:
import { Ajv2020 } from "ajv/2020";
const ajv = new Ajv2020({ strict: true });
const schema = await (await fetch("https://learn-joshhale.legoguy32109.deno.net/api/v1/schemas/lesson/v1")).json();
const validate = ajv.compile(schema);
const document = JSON.parse(await Deno.readTextFile("tests/audit/contract-attacks/fixtures/ref-mcq-key-not-in-set.json"));
console.log(validate(document)); // true — the schema accepts a document the resolver rejects for mcq.map.missing
```

The rerunnable test asserts this exact, observed (not documented) behavior at
`tests/audit/contract-attacks/contract_attacks_test.ts`, in
`KNOWN_SCHEMA_CATALOG_MISMATCHES`. It will fail — the useful way — the day
this ticket is closed and the catalog or the schema changes to agree.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Either the schema independently rejects a same-count, wrong-identity
      `map`/`feedback` mismatch (so `schema: true` becomes true), or the
      catalog, `docs/diagnostics.md`, `docs/api-v1.md` and the generated
      plugin texts are corrected to `schema: false` for these four codes,
      with a test that fails if the two representations disagree again.
- [ ] `tests/audit/contract-attacks/contract_attacks_test.ts`'s
      `KNOWN_SCHEMA_CATALOG_MISMATCHES` entries for this ticket are removed
      once the fix lands, and the affected fixtures pass the general
      catalog-driven assertion like every other fixture.
