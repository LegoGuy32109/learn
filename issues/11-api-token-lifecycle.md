# 11 — API-token lifecycle: mint, list, revoke, rotate, scope errors

**What to build:** Josh gives each agent harness its own named token and can
take one away without touching the others. This is Workstream D in
`docs/implementation/token-operations.md`; that document is the spec.

Scripts, not browser UI: mint a named token with chosen scopes and an optional
expiry; list token metadata with no hash or secret; revoke one token now;
rotate a token so the old one dies when the new one is confirmed. The full
token is shown once, at creation, and never again. Only a prefix and a SHA-256
hash of at least 256 bits of random material are stored.

Separate authentication failure from authorization failure: a missing, invalid,
expired or revoked token gets `401`; a valid token without the needed scope gets
`403`. Every log line, error, snapshot and test report redacts bearer tokens.

**Demo path:** Mint a read-only token, list lessons with it and succeed, create
a lesson with it and get `403`, revoke it, and get `401` on the next call.

**Blocked by:** None — can start immediately.

**Status:** done 33d8f7e

- [x] Mint, list, revoke and rotate exist as Deno tasks with `--help` text.
- [x] Listing shows name, prefix, scopes, created, last used, expiry and
      revoked time, and nothing else.
- [x] Scope enforcement, expiry, revocation and last-used updates are proven
      by database tests against an ephemeral `learn-test-<uuid>` database.
- [x] A real-process smoke creates a token, uses it, revokes it, and confirms
      the next request fails.
- [x] A test asserts that a bearer token passed into an error path does not
      appear in the error message or log output.
- [x] `deno task check`, `deno task test` and `deno task test:db` pass.

## Verification

```bash
deno task check && deno task test && deno task test:db
```

## Report

### Verification output

```text
Task check deno check main.ts src/app.ts public/js/*.js src/shared/**/*.js src/server/**/*.ts scripts/*.ts
Task test deno test --allow-read tests/shared tests/server
running 3 tests from ./tests/server/api_test.ts
capability discovery is public ... ok (6ms)
resolver reports diagnostics without authentication ... ok (1ms)
draft persistence requires a bearer token ... ok (246µs)
running 3 tests from ./tests/server/resolver_test.ts
lesson/v1 resolver is deterministic and write-free ... ok (2ms)
resolver requires explicit provenance ... ok (217µs)
declined provenance is explicit and valid ... ok (287µs)
running 6 tests from ./tests/server/token_test.ts
personal tokens carry at least 256 bits of random material behind the prefix ... ok (428µs)
redaction keeps the prefix and removes the secret from any text ... ok (418µs)
a missing or invalid token gets 401 and a valid token without the scope gets 403 ... ok (6ms)
a bearer token passed into an error path never reaches the error message or the log ... ok (583µs)
scope validation rejects unknown and empty scope lists ... ok (260µs)
token script helpers parse durations and list only metadata columns ... ok (577µs)
running 6 tests from ./tests/shared/learning_test.ts
demo fixture satisfies structural invariants ... ok (605µs)
answer evaluation is exact and normalized ... ok (252µs)
progress reducer is monotonic and derives learned ... ok (183µs)
shuffling is stable and seed-sensitive ... ok (138µs)
checkpoint reconstruction chooses the last immutable checkpoint ... ok (6ms)
Check and Wrap-up transitions preserve their distinct retry rules ... ok (142µs)

ok | 18 passed | 0 failed (168ms)

Task test:db deno test --env-file=.env --allow-env --allow-net --allow-read --allow-run tests/db
running 1 test from ./tests/db/draft_api_test.ts
authenticated draft API persists idempotently in Turso ... ok (2s)
running 1 test from ./tests/db/token_lifecycle_test.ts
token lifecycle in an ephemeral database ...
  only a prefix and a SHA-256 hash are stored; the secret is not recoverable ... ok (41ms)
  a read-only token can list lessons and gets 403 on create ... ok (542ms)
  successful and forbidden authentication both update last_used_at ... ok (641ms)
  listing shows exactly name, prefix, scopes, created, last used, expiry and revoked ... ok (122ms)
  an active name cannot be minted twice, and unknown scopes are rejected ... ok (100ms)
  an expired token gets 401 the moment its expiry passes ... ok (714ms)
  malformed, unknown and foreign tokens get 401 ... ok (41ms)
  rotation confirms the new token before revoking the old one ... ok (827ms)
  revocation is immediate and cannot be repeated ... ok (319ms)
  real-process smoke: mint with the script, use it, revoke it, and the next request fails ... ok (2s)
token lifecycle in an ephemeral database ... ok (8s)

ok | 2 passed (10 steps) | 0 failed (10s)
```

The token lifecycle test created and deleted `learn-test-<uuid>` in the same
run. The Turso database list afterwards showed only `learn-dev`, `learn-local`
and `learn-prod` (`learn-prod` was created by another ticket, not this one).

### What was built

- `src/server/identity/token-admin.ts`: `TokenAdmin` with `mint`, `list`,
  `find`, `revoke`, `rotate` and `resolveAccount`. `list` never selects the
  hash column. Names are unique among an account's active tokens.
- `src/server/identity/redaction.ts`: `redactBearerTokens` and
  `redactedErrorText`. The request handler's catch-all logs through it.
- `src/server/auth.ts`: `authenticate` now returns
  `{ ok: true, principal } | { ok: false, reason: "unauthenticated" | "forbidden" }`.
  The handler maps `unauthenticated` to `401` and `forbidden` to `403`. Both
  outcomes update `last_used_at`. The token shape is checked before hashing.
- `scripts/tokens.ts` with `mint`, `list`, `revoke`, `rotate`, each with
  `--help`, `--json`, and `--account`. `deno.json` gained `token:mint`,
  `token:list`, `token:revoke`, `token:rotate`.
- `tests/db/support/ephemeral.ts` creates `learn-test-<uuid>` through the
  Turso platform API, waits for it, migrates it, and deletes it.
- `tests/db/token_lifecycle_test.ts`: storage non-disclosure, 200/403 for a
  read-only token, `last_used_at` updates, exact metadata keys, duplicate
  name and unknown scope rejection, expiry with an injected clock, malformed
  and forged tokens, rotate, revoke, and a real-process smoke that spawns
  `main.ts`, mints with the script, reads (200), writes (403), revokes with the
  script, and gets 401. The spawned server's stderr is checked for the token.
- `tests/server/token_test.ts`: secret length, redaction, 401 vs 403 mapping,
  a bearer token thrown through the error path is absent from the response
  body and the captured `console.error` output, scope validation, and script
  helpers.
- Docs: `docs/api-v1.md` now documents `403`; `docs/turso-databases.md` lists
  the tasks and the `test:db` requirement for `TURSO_API_KEY` and
  `TURSO_ORG_SLUG`; `docs/implementation/token-operations.md` gained an
  Operations section.

### Decisions

- **Rotation semantics.** "The old one dies when the new one is confirmed" is
  implemented as: insert the replacement, confirm it by hash lookup in the
  database, then revoke the old token in the same run. A failure before
  confirmation leaves the old token active. Both tokens are never displayed;
  only the new one is printed, once. A two-command rotation with a manual
  confirm step would have been the same as mint plus revoke.
- **Edited `src/app.ts`, `main.ts`, `deno.json`.** The workstream document
  reserves these for the coordinator, but the ticket requires `403` from the
  handler and Deno tasks. Changes are minimal: the `principal` helper maps the
  new auth result, the catch-all logs through redaction, `main.ts` reads an
  optional `PORT` so the smoke can run a real server on a free port, and the
  `dev` task allows `PORT`. `test:db` gained `--allow-run` for the smoke.
- **Token format unchanged.** `learn_pat_<10-char prefix>_<43-char base64url>`
  from 32 random bytes, so existing owner tokens keep working.
- **Account selection.** The script picks the only account automatically and
  requires `--account <id>` once more than one exists.
- **Owner bootstrap untouched.** `scripts/bootstrap-owner.ts` still inserts
  directly; it predates this ticket and does not use `TokenAdmin`.

### Not done

Nothing in scope was left out. The demo path was exercised by the real-process
smoke against the ephemeral database rather than against `learn-local`, to
avoid leaving revoked test rows in the developer database.
