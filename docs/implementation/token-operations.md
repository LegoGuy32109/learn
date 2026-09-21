# Workstream D: API-token operations

## Objective

Turn the one-time owner bootstrap into a safe personal-token lifecycle for
Josh's agents. This work does not add public account creation.

## Owned files

- new token administration modules under `src/server/identity/`
- token scripts under `scripts/`
- token-focused server and database tests
- token-operation documentation

Do not add browser account UI or edit `src/app.ts`. Export handlers or commands
for coordinator wiring.

## Required work

1. Mint a named token with selected scopes and optional expiry.
2. List token metadata without revealing token hashes or secrets.
3. Revoke one token immediately.
4. Rotate a token without a period where both old and new tokens are
   accidentally displayed.
5. Distinguish invalid authentication (`401`) from valid authentication with an
   insufficient scope (`403`).
6. Store only a token prefix and SHA-256 hash of at least 256 bits of random
   secret material.
7. Ensure logs, errors, snapshots, and test reports redact bearer tokens.

The full token is shown or written once at creation. Existing tokens cannot be
retrieved.

## Acceptance gate

Database tests must prove scope enforcement, expiry, revocation, last-used
updates, and non-disclosure. Include a real-process smoke that creates a token,
uses it, revokes it, and confirms the next request fails.


## Operations

Ticket 11 implemented this workstream. The lifecycle is four Deno tasks over
`scripts/tokens.ts`. Each prints `--help`.

```bash
deno task token:mint --name codex --scopes lessons:read,lessons:write --expires-in 90d
deno task token:list [--all] [--json]
deno task token:revoke --prefix <prefix>      # or --name <name>
deno task token:rotate --prefix <prefix>      # or --name <name>
```

- A token is `learn_pat_<prefix>_<secret>`. The secret is 32 random bytes in
  base64url; the prefix is its first ten characters. Only the prefix and the
  SHA-256 hash of the full token are stored.
- Names are unique among an account's active tokens, so `--name` can identify
  a token for revoke and rotate. Known scopes are `lessons:read` and
  `lessons:write`.
- `list` returns name, prefix, scopes, created, last used, expiry and revoked
  time. Revoked tokens are hidden unless `--all` is passed.
- `rotate` mints a replacement with the same name, scopes and expiry, confirms
  the new row by hash lookup, and only then revokes the old token. A failure
  before confirmation leaves the old token active. The new token is printed
  once.
- The server answers `401` for a missing, malformed, unknown, expired or
  revoked token and `403` for a valid token without the required scope. Both
  outcomes update `last_used_at`.
- `src/server/identity/redaction.ts` strips `learn_pat_…` secrets and bearer
  header values. The request handler passes every logged error through it, and
  the token script redacts its own error output.
- The database holds one account today. The script picks it
  automatically and requires `--account <id>` once more than one exists.
