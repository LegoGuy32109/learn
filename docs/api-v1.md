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
network requests.

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

## Errors

Transport, authentication, authorization, and route errors use
`application/problem+json`. Resolver failures use the structured resolution
response with JSON Pointer-style diagnostic paths.

Current status meanings:

- `200`: read or resolution succeeded.
- `201`: draft creation request succeeded, including an idempotent retry.
- `400`: malformed JSON.
- `401`: missing, invalid, expired, or revoked token.
- `403`: valid token without the scope the route requires.
- `404`: route or owned resource not found.
- `413`: request exceeds the size limit.
- `422`: lesson document failed resolution.

## Alpha limitations

- The JSON Schema document and OpenAPI document are discovery skeletons, not
  complete generated contracts yet.
- Public resolver rate limiting is not implemented.
- Token lifecycle is operated with Deno tasks; there is no browser UI.
- Progress synchronization is not part of this API slice.
- Publishing, verification, and Listings are not implemented.

