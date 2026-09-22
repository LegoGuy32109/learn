# API v1 alpha contract

The API accepts content created by external agents. It never invokes an AI
model. JSON is the only authoring format in the alpha contract.

The API version and lesson schema version are independent. API routes use
`/api/v1`; Lesson documents declare `schema: "lesson/v1"`.

## Discovery

```text
GET /.well-known/learn-joshhale.json
GET /api/v1/capabilities
GET /openapi.json
GET /api/v1/schemas/lesson/v1
GET /tools/lesson-validator.js
GET /tools/lesson-validator.d.ts
```

The downloadable validator is generated from
`src/shared/authoring/resolver.js`. Run `deno task tools:generate` after changing
the resolver. The generated JavaScript has no dependencies and does not make
network requests. A test runs it in a subprocess from a temporary directory
and requires its result JSON to match the shared resolver byte for byte for
every fixture.

## The lesson/v1 document

`lesson/v1` follows the quiz plugin's content model. The full shape is the
demo fixture `fixtures/lessons/browser-http-cache.json`; the rules are:

- A Concept owns `options`: exactly three `{ id, text }` entries shared by
  every MCQ in that Concept. Option IDs are stable local identifiers
  (`^[A-Za-z0-9_-]{1,64}$`), unique within the Concept.
- A Concept owns `misconceptions`: `{ id, statement, correctingCardId }`
  entries. The statement is written as the belief itself. The Card must be in
  the same Concept. Every misconception must be used by some MCQ distractor.
- A Card `body` is an array of paragraph strings. Inline HTML such as
  `<code>` and `<em>` is allowed. Cards are 120 to 200 words after tags are
  stripped, and should have at least two paragraphs.
- Questions stay at the top level with `conceptId` and `poolId`. Every
  Question carries `reserved` (default `false`) and `correctingCardId` in its
  Concept. A Check never draws a reserved Question; the Wrap-up draws reserved
  Questions first, so each Pool needs at least three drawable Questions and
  one reserved Question.
- An MCQ names its `key` (an option ID), a `map` from every distractor option
  ID to a misconception ID, and `feedback` for every option including the key.
- A numeric Question has `answer`, a non-zero `tolerance`, an optional `unit`
  and `feedback`. Its answer must appear in a Card of its Concept. It is never
  reserved.
- A short Question has `answer`, optional `aliases` and `feedback`.

Concept, Card, Pool and Question IDs are UUIDv4. Sources and provenance are
unchanged.

## Diagnostics

Every diagnostic has a stable `code`, a JSON Pointer `path` and a `severity`
of `error` or `warning`. Diagnostics are sorted by path, then code. Errors
make the document invalid; a document with only warnings resolves with
`valid: true` and the warnings included.

Structural codes include `concept.options.count`, `concept.option.id`,
`mcq.key`, `mcq.map.missing`, `mcq.map.unknown`, `mcq.feedback.missing`,
`misconception.card`, `misconception.unused`, `pool.reserved.missing`,
`numeric.reserved` and `card.body.paragraphs`.

Author-quality codes ported from the plugin validator:

| Code | Severity | Rule |
| --- | --- | --- |
| `card.words` | error | Card word count outside 120 to 200 after stripping inline HTML |
| `concept.options.ratio` | error | Longest to shortest option length ratio above 1.35 |
| `lesson.key.longest` | error | Key is the longest option in more than one third of MCQs, lesson-wide |
| `question.stem.unbound` | error | Stem contains an unbound reference such as "the above" |
| `numeric.answer.uncovered` | error | Numeric answer appears in no Card of its Concept |
| `numeric.tolerance.missing` | error | Numeric Question has no tolerance, or a tolerance of zero |
| `pool.drawable.minimum` | error | Fewer than three drawable Questions in a Pool |
| `card.paragraphs.single` | warning | Single-paragraph Card |

Adversarial input is rejected with `document.object`, `document.nesting`
(deeper than 32 levels) or `document.size` (over 1,000,000 bytes) before any
other rule runs. Every code has a fixture under `fixtures/authoring/` listed
in `manifest.json`.

## Resolve without persistence

```text
POST /api/v1/lesson-resolutions
Content-Type: application/json
```

The body is one `lesson/v1` document. The endpoint returns `200` for valid
input and `422` for structurally invalid input.

```json
{
  "valid": true,
  "schemaVersion": 1,
  "fingerprint": "sha256:...",
  "diagnostics": [],
  "normalizedLesson": {}
}
```

Resolution is deterministic and write-free. The fingerprint covers normalized
instructional content and sources, but not agent provenance. A change in
provenance alone does not create a semantic Lesson Revision.

The maximum request size is 1,000,000 bytes.

## Provenance

Callers must supply either complete metadata:

```json
{
  "provenance": {
    "status": "provided",
    "client": "Codex",
    "harness": "Codex CLI",
    "model": "gpt-5.6-terra",
    "client_version": "0.154.0",
    "session_reference": "local-session-reference"
  }
}
```

or an explicit decline:

```json
{ "provenance": { "status": "declined" } }
```

Use `"unknown"` for an unavailable provided field. Omission is invalid.

## Authenticated Lesson drafts

Use a personal bearer token:

```text
Authorization: Bearer learn_pat_<prefix>_<secret>
```

Only the prefix and a SHA-256 hash of the high-entropy token are stored. Tokens
have explicit scopes and can be expired or revoked. `GET` routes need
`lessons:read`; `POST` routes need `lessons:write`. Mint, list, revoke and
rotate tokens with the `token:*` tasks described in
`docs/implementation/token-operations.md`.

```text
POST /api/v1/lessons
GET  /api/v1/lessons
POST /api/v1/lessons/{lesson_id}/revisions
GET  /api/v1/lessons/{lesson_id}/revisions/{revision_id}
```

`POST /api/v1/lessons` creates a stable Lesson and its first private draft.
`POST .../revisions` creates another immutable draft. The server always reruns
the resolver. It never trusts a normalized object asserted by a client.

The account associated with the bearer token receives ownership and authorship.
Submitting the same fingerprint again for that account returns the existing
revision instead of duplicating it.

There is no publish API and no validation bypass.

## Phone sign-in: invites, passkeys and the browser session

A browser signs in with a passkey instead of a token. The two credentials
resolve to the same account: `src/server/identity/current-account.ts` reads the
session cookie first and the bearer token second, so later shelf and sync routes
never inspect either directly.

```text
POST   /api/v1/sign-in-invites                  bearer with account:owner -> 201 { url, path, expiresAt }
GET    /sign-in/{invite}                        HTML: register a passkey, or a plain error page
POST   /api/v1/passkeys/registration-options    { invite } -> { options }
POST   /api/v1/passkeys/registrations           { invite, credential } -> session cookie
POST   /api/v1/passkeys/authentication-options  {} -> { options }
POST   /api/v1/passkeys/authentications         { credential } -> session cookie
GET    /api/v1/session                          { signedIn, displayName }
DELETE /api/v1/session                          clears the cookie
```

- An invite is minted only for the account behind an owner-scoped token
  (`account:owner`). A token without that scope gets `403`; an invalid token
  gets `401`. Only a SHA-256 hash of the invite is stored. It expires after ten
  minutes and is consumed by the registration that succeeds with it. A second or
  late visit gets a `410` page; an unknown link gets a `404` page.
- Registration and sign-in use `@simplewebauthn/server`. Each ceremony is bound
  to one server-issued challenge that is deleted when presented, and the
  response must match the relying-party ID and an allowed origin. A replayed
  challenge answers `401`; a wrong origin or relying party answers `400`.
- `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGINS` pin the relying party per deployment.
  Without them only plain `localhost` works and every other origin gets `501`.
- The stored credential is the id, the public key, the sign count, the
  transports, and the creation and last-use times. The sign count must advance
  on every assertion.
- The session cookie `learn_session` is HttpOnly, SameSite=Lax, Secure
  everywhere except plain localhost, lasts thirty days, and is signed with an
  HMAC key derived from `LEARN_SESSION_KEY`. A tampered or expired cookie is a
  guest. Ceremony and sign-out requests with a foreign `Origin` header get `403`.

Mint a link from the laptop with `deno task invite:mint` (see
`docs/turso-databases.md`), open it on the phone, and register.

## Errors

Transport, authentication, authorization, and route errors use
`application/problem+json`. Resolver failures use the structured resolution
response with JSON Pointer-style diagnostic paths.

Current status meanings:

- `200`: read or resolution succeeded.
- `201`: draft creation request succeeded, including an idempotent retry.
- `400`: malformed JSON.
- `401`: missing, invalid, expired, or revoked token.
- `403`: valid token without the scope the route requires, or a cross-site
  browser request.
- `404`: route or owned resource not found.
- `410`: invite already used or expired.
- `413`: request exceeds the size limit.
- `422`: lesson document failed resolution.
- `500`: the server could not complete the request, including a database or
  network failure during authentication. A failed token lookup is never `401`.
- `501`: passkeys requested from an origin that is not the configured relying
  party.

Every response, success or error, carries `x-learn-revision` naming the
deployment revision that served it (`local` outside Deno Deploy).

## Alpha limitations

- The JSON Schema document and OpenAPI document are discovery skeletons, not
  complete generated contracts yet.
- Public resolver rate limiting is not implemented.
- Token lifecycle is operated with Deno tasks; there is no browser UI.
- Passkeys cannot be listed or removed yet; a lost phone is handled by
  minting a new invite, and a stale credential stays in the table.
- Progress synchronization is not part of this API slice.
- Publishing, verification, and Listings are not implemented.

