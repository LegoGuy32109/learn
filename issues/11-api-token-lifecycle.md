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

**Status:** ready-for-agent

- [ ] Mint, list, revoke and rotate exist as Deno tasks with `--help` text.
- [ ] Listing shows name, prefix, scopes, created, last used, expiry and
      revoked time, and nothing else.
- [ ] Scope enforcement, expiry, revocation and last-used updates are proven
      by database tests against an ephemeral `learn-test-<uuid>` database.
- [ ] A real-process smoke creates a token, uses it, revokes it, and confirms
      the next request fails.
- [ ] A test asserts that a bearer token passed into an error path does not
      appear in the error message or log output.
- [ ] `deno task check`, `deno task test` and `deno task test:db` pass.

## Verification

```bash
deno task check && deno task test && deno task test:db
```
