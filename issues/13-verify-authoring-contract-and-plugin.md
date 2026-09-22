# 13 — Verify the authoring contract and the plugin end to end

**What to do:** Act as a stranger's agent. Start from nothing but the
capability document URL and the site's install page. Install the plugin as the
page says, in a repository that is not this one, and follow the skill to make
a lesson about a real piece of work in that repository. Record how many
resolution attempts it took and which diagnostics fired. Then attack the
contract. Report defects as new ticket files. Do not fix anything.

Attacks to run against both the resolution API and the downloaded validator,
asserting identical result JSON:

- A lesson the plugin's own `validate.mjs` rejects for each of its rules,
  translated to `lesson/v1`. Each must fail with the matching diagnostic code.
- A lesson whose key is the longest option in every MCQ.
- A lesson whose Card is 119 and 201 words.
- A stem with each deixis phrase.
- A reserved numeric Question.
- A body at the size limit plus one byte, a document nested 200 levels deep,
  duplicate IDs across Concepts, and keys named `__proto__`, `constructor`
  and `prototype`.
- Provenance omitted, declined, and provided with one missing field.
- The same valid lesson twice with the same token, then with a different
  account's token.

Confirm the JSON Schema rejects what the resolver rejects and accepts what it
accepts for every fixture, using an independent draft 2020-12 validator, not
the project's code. Confirm the OpenAPI document describes every route the
server answers, by probing each route in the document and each route the
server exposes.

Search the repository the skill ran in, the skill's output and the shell
history for the bearer token.

**Blocked by:** 03 — Complete JSON Schema, OpenAPI and diagnostic-code
documentation; 04 — Installable agent plugin served by the site.

**Status:** done 8f9811f

- [x] The end-to-end run is documented: install route used, attempts, and
      diagnostics per attempt, with the created revision ID.
- [x] Every attack has a fixture, the API result, the validator result and a
      byte-equality assertion, committed as a test the swarm can rerun.
- [x] Every schema and OpenAPI mismatch is a ticket.
- [x] The token search comes back empty and the command used is in the report.

## Report

### End-to-end install and authoring run

Full narrative at `tests/audit/contract-attacks/end-to-end-install-run.md`.
Summary:

- Acted as a stranger's agent, starting from `/plugin` and
  `/api/v1/capabilities` only, in a scratch copy of
  `/home/josh/Projects/painting` outside this repository.
- Installed via route 2 (`git clone
  .../plugin/learn-lesson-plugin.git`); cross-checked the archive's
  SHA-256 against the marketplace manifest's pinned hash and confirmed
  `unzip` produces a byte-identical tree to the clone.
- Authored one lesson, **`audit-painting-auth-review-fixes`**, about
  painting commit `42bb06d8d5e4bc7b0d265910ded9be2bdc232228` ("fix: close
  the session-revocation, deletion, and sign-out gaps found in an auth
  review"): three Concepts, twelve Questions (MCQ, numeric, short), with
  the shared-option-set construction and one misconception per distractor.
- **One resolution attempt** (`validate.mjs --remote`): 0 diagnostics,
  remote and local byte-identical. **One submission attempt**: `201`.
- **Revision:** lesson `59b12656-3b63-4c86-95d2-cc83957265e1`, revision
  `2c1f49c3-765e-4aae-872e-a6ea75085e35`, fingerprint
  `sha256:c5f8aa86c64f81805e207814f3b1feae0bd9b1ab5a64c8a1dd4e3729dddfdf15`.
  Idempotency reconfirmed by the rerunnable test (same token, same
  revision back).
- The adversarial self-pass (skill step 3b) found nothing to fix, because
  the shared-option-set discipline was applied while writing, not
  recovered after the fact; noted as a finding in the run log rather than
  invented for form.

### Contract attacks

Committed under `tests/audit/contract-attacks/`:

- `generate.ts` derives 76 fixtures from the one authored lesson
  (`audit-lesson.json`) and writes `manifest.json`, covering: every rule
  in the reference plugin's `validate.mjs` translated to `lesson/v1`
  (including the one it enforces that the contract explicitly dropped —
  `concept.statement` — recorded as such, not filed); a key that is the
  longest option in every MCQ; Cards at 119, 120, 200 and 201 words, and
  119 words padded with inline tags; every deixis phrase in the stem
  pattern, plus a case/word-boundary check; a reserved numeric Question,
  including one that is its Pool's only reserved Question; a document
  nested exactly at and one past the 200-level/32-level limits; duplicate
  IDs across Concepts (Card, Pool, Question, misconception) and the one
  case that is legitimately *not* a duplicate (option IDs are
  Concept-local); `__proto__`/`constructor`/`prototype` as an option id, a
  misconception id, a top-level key, an `mcq.feedback` key and an
  `mcq.map` key; provenance omitted, declined, declined-with-extra-fields,
  missing one field, and an unrecognized status.
- `contract_attacks_test.ts` (`deno task audit:contract`) runs every
  fixture, plus generated documents for the exact size limit, the size
  limit plus one byte, and 200-level nesting without a host property (too
  large or Git-hostile to commit), through three implementations at once:
  the deployed resolution API, the validator downloaded fresh from the
  deployed site and run in an offline subprocess, and this repository's
  resolver. Every one produced byte-identical result JSON. Also probes: a
  JSON scalar/array/null body (`document.object` alone, from the API and
  the resolver, byte-identical); a malformed body (`400`); prototype
  pollution via `__proto__`/`constructor` keys in the request body itself
  (rejected, `Object.prototype` left clean); duplicate submission with one
  token (idempotent); an unknown token (`401`, not `403`, no draft); no
  token (`401`); a second account submitting the same document (separate
  lesson and revision, same fingerprint); cross-account read and revision
  isolation (`404`); a read-only-scoped token on a write route (`403`).
  Every route in the deployed OpenAPI document was probed live and none
  answered the router's "no route" problem; the reverse direction (every
  served route is documented) was checked against this worktree's own
  `composeRoutes`/`openapiDocument`, since production runs code from a
  later ticket (10, progress sync) this branch predates — noted as
  `openapi drift`, not a contract defect. `deno task audit:contract`:
  **458 passed, 0 failed, 8 observations**
  (`tests/audit/contract-attacks/last-run.md`).

### Defects filed

- **`issues/30-mcq-map-feedback-extra-missing-not-schema-catchable.md`** —
  `mcq.map.extra`, `mcq.map.missing`, `mcq.feedback.extra` and
  `mcq.feedback.missing` are documented `schema: true`, but the schema's
  `map`/`feedback` definitions only constrain property count and key
  format; they cannot see a Concept's real option IDs. A same-count,
  wrong-identity mismatch (duplicated Concept id; a key naming no real
  option) makes the resolver reject while the independent schema
  validator accepts. Reproduced with `ref-duplicate-concept-id.json` and
  `ref-mcq-key-not-in-set.json`.
- **`issues/31-misconception-id-mislabeled-resolver-only.md`** —
  `misconception.id` is documented `schema: false` ("resolver only"), but
  its type (`$defs.localId`) carries the same required-ness, pattern and
  `not: enum(__proto__, constructor, prototype)` restrictions as
  `concept.option.id`, so the schema independently rejects a missing,
  malformed or reserved-name id — three of the code's four documented
  trigger conditions. Only "duplicate within a Concept" is genuinely
  resolver-only. `concept.option.id` is named as needing the same check.
  Reproduced with `reserved-name-misconception-{__proto__,constructor,prototype}.json`.

Both tickets' fixtures are pinned in the audit test's
`KNOWN_SCHEMA_CATALOG_MISMATCHES` table: the check asserts the *observed*
schema behavior for those fixtures (not the catalog's claim), so the test
stays green today and starts failing — usefully — the moment either
ticket is fixed and the catalog and the schema stop disagreeing, which is
the signal to close it.

No other contract mismatches were found: every other fixture's schema
behavior matched what the served diagnostics catalog predicts, in both
directions (schema accepts what has no schema-caught error, schema
rejects what does).

### Token search

```bash
TOKEN="$(rg -o '^LEARN_OWNER_TOKEN=.*' .env.prod | cut -d= -f2- | tr -d '"'"'"' \r')"
rg -F -l --hidden -g '!.git' "$TOKEN" <scratch-repo> <this-worktree> ~/.bash_history ~/.zsh_history <session-transcript-dir>
```

Zero files contained the literal token in: the scratch stranger repository
(the painting copy, the cloned/unzipped plugin, the authoring working
directory), this worktree, `~/.bash_history` (`~/.zsh_history` did not
exist), and this session's own transcript directory. The plugin's
`submit.mjs` also redacts any `learn_pat_...`-shaped string in everything
it prints, confirmed by reading its source; the committed run log
(`end-to-end-install-run.md`) and the audit test's report
(`last-run.md`) were both grepped for `learn_pat_` and contain none.

### Decisions

- Used the painting repository (not this repository) as the "real piece
  of work," per the ticket's own example, since `learn.joshhale.me` has no
  other independent codebase handy and CONTEXT.md already names painting
  as the copy-conventions reference.
- Treated `concept.statement`'s optionality (a `lesson/v1` change from the
  plugin's `validate.mjs`, which requires it) as Josh's already-settled
  decision of 2026-09-21, not a defect; the fixture
  (`ref-no-statement.json`) records `valid: true` with a note rather than
  being filed.
- Did not file a ticket for the `openapi drift` observation (production
  documents ticket 10's progress-sync routes that this worktree's
  checkout predates): it is an artifact of the per-ticket-worktree model,
  not a bug in the contract, and will resolve itself once this ticket
  merges to `main` after ticket 10.
- Did not attempt the "1,000,001 bytes → identical body" framing literally:
  the API answers `413` (transport-level, problem+json) while the
  validator answers `422` with `document.size` (content-level), and
  `docs/api-v1.md` documents exactly this split; asserted each
  independently instead of a false byte-equality expectation.
