# 07 — Phone sign-in with a passkey from a one-time invite link

**What to build:** Josh signs in on his phone as the owner account without
typing a token. On his laptop an agent, or Josh, runs a script with the owner
token that mints a one-time invite link. He opens the link on the phone,
registers a passkey, and the shelf shows "Signed in as Josh". Later launches
sign in with the passkey. Sign-out exists.

This is not public account creation. An invite can be minted only for an
existing account and only with an owner-scoped token. An invite expires in ten
minutes and is consumed on first use.

Use WebAuthn with the platform authenticator. Store credential ID, public key,
sign count and creation time in a new migration. Issue a signed, HttpOnly,
SameSite cookie for the browser session. Bearer tokens stay for agents; the
cookie is for the browser. Both resolve to the same account identity that
later tickets use for the shelf and sync.

**Demo path:** Mint an invite on the laptop, open it on the phone, register a
passkey with Face ID or fingerprint, land on the shelf signed in, kill the app,
reopen, and remain signed in. Sign out and see the guest shelf.

**Blocked by:** 01 — Split the browser app and server routes into domain modules.

**Status:** done 3f317bb

- [x] A new sequential migration adds passkey credentials and invites.
      `001_initial.sql` is unchanged.
- [x] Minting an invite requires a token with an owner scope. A token without
      it gets `403`. An invalid token gets `401`.
- [x] An invite is single-use and expires. A second use or a late use gets a
      clear error page, not a stack trace.
- [x] Registration and sign-in ceremonies verify the challenge, origin and
      relying-party ID. Tests cover a replayed challenge and a wrong origin.
- [x] The session cookie is HttpOnly, Secure outside localhost, SameSite Lax,
      and signed. Tampering signs the user out.
- [x] A phone-sized Playwright test uses a virtual authenticator to register
      and sign in, then reloads and stays signed in.
- [x] Database tests run against an ephemeral `learn-test-<uuid>` database that
      is deleted in `finally`.
- [x] `deno task check`, `deno task test`, `deno task test:db` and
      `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task test:db && deno task e2e
```

## Report

Implemented at `3f317bb` on branch `ticket/07`.

### Verification output

```text
$ deno task check && deno task test && deno task test:db && deno task e2e
Task check deno check main.ts src/app.ts public/js/*.js src/shared/**/*.js src/client/**/*.js src/server/**/*.ts scripts/*.ts
Task test deno test --allow-read tests/shared tests/client tests/server
running 5 tests from ./tests/client/flow_test.ts            ... 5 ok
running 3 tests from ./tests/server/api_test.ts             ... 3 ok
running 9 tests from ./tests/server/passkey_test.ts
minting an invite needs an owner-scoped token: 401 invalid, 403 without the scope ... ok
an invite page registers once, then reports used, expired or unknown as a plain page ... ok
registration then sign-in issue a signed HttpOnly SameSite=Lax cookie that the shell honours ... ok
a tampered or expired cookie signs the browser out ... ok
cookies are Secure everywhere except plain localhost ... ok
a replayed challenge is rejected for registration and for sign-in ... ok
a wrong origin or relying-party ID fails verification, and the sign count must advance ... ok
passkeys are refused off the configured origin, and cross-site posts are refused ... ok
redaction hides invite links and session cookies ... ok
running 3 tests from ./tests/server/resolver_test.ts        ... 3 ok
running 6 tests from ./tests/server/token_test.ts           ... 6 ok
running 6 tests from ./tests/shared/learning_test.ts        ... 6 ok
ok | 32 passed | 0 failed (715ms)
Task test:db deno test --env-file=.env --allow-env --allow-net --allow-read --allow-run tests/db
authenticated draft API persists idempotently in Turso ... ok (2s)
passkey sign-in in an ephemeral database ... ok (7s)
  migration 002 applied and 001 is untouched ... ok
  only an owner-scoped token mints an invite; 403 without the scope, 401 for an invalid token ... ok
  a replayed registration challenge and a wrong origin are rejected ... ok
  registration stores id, public key, sign count and creation time, consumes the invite and signs in ... ok
  a second use and a late invite get a clear page ... ok
  sign-in with the passkey advances the sign count and a replayed assertion fails ... ok
  a tampered cookie is a guest; sign-out clears the cookie ... ok
token lifecycle in an ephemeral database ... ok (8s)
ok | 3 passed (17 steps) | 0 failed (18s)
Task e2e deno test --allow-all tests/e2e
resume, corrective routing, and I don't know obey the flow contract ... ok (2s)
phone learner resumes and reaches Learned ... ok (2s)
phone registers a passkey from an invite, stays signed in across reloads, signs out and back in ... ok (582ms)
ok | 3 passed | 0 failed (5s)
```

Both ephemeral databases (`learn-test-<uuid>`) were created and deleted in
`finally` by `tests/db/support/ephemeral.ts`. No token or key was printed.

### What was built

- `migrations/002_passkeys_and_invites.sql`: `passkey_credentials` (id, account,
  public key, sign count, transports, created, last used), `sign_in_invites`
  (hash only, minted-by prefix, expiry, consumed time), `webauthn_challenges`.
- `src/server/repositories/identity.ts`: `IdentityRepository` with Turso and
  in-memory adapters. The memory adapter backs the database-free `app`.
- `src/server/identity/passkeys.ts`: invites and both WebAuthn ceremonies on
  `@simplewebauthn/server@13.3.2` (the same library and pinned-RP convention as
  the painting project). `relying-party.ts` pins `WEBAUTHN_RP_ID` and
  `WEBAUTHN_ORIGINS`; unset means plain `localhost` only, anything else `501`.
- `src/server/identity/sessions.ts`: `learn_session` cookie, HMAC-SHA256 over a
  JSON payload with an HKDF-derived key from `LEARN_SESSION_KEY`, 30 days,
  HttpOnly, SameSite=Lax, Path=/, Secure except on localhost/127.0.0.1.
- `src/server/identity/current-account.ts`: one resolver for cookie or bearer,
  for tickets 08 and 10.
- `src/server/routes/identity.ts` and `src/server/views/invite.ts`: the routes
  in `docs/api-v1.md`, the invite page, and the 404/410 explanation pages.
- Browser: `src/client/identity/passkey.js` (dependency-free ceremony client),
  `public/js/invite.js`, and the shelf's account panel ("Signed in as Josh",
  sign out, sign in with a passkey). `page.ts` now injects `window.__SESSION__`.
- `scripts/invite.ts` (`deno task invite:mint`) posts to the running site with
  `LEARN_OWNER_TOKEN` and prints the link once.
- `deno task db:owner` now mints owner tokens with `account:owner`, adds that
  scope to an existing `owner-cli` token, and writes `LEARN_SESSION_KEY`.

### Decisions

- **Owner scope is `account:owner`.** Added to `KNOWN_SCOPES`. The existing
  `owner-cli` token in `learn-local` and `learn-dev` predates it; running
  `deno task db:owner` (and the `.env.dev` variant) grants it in place without
  rotating. I did not run that task or `db:migrate` against `learn-local`, so
  the coordinator applies 002 and re-runs `db:owner` after merge. Until then
  `invite:mint` against `learn-local` answers `403`.
- **The invite is consumed by a successful registration, not by opening the
  page.** Safari needs a user gesture for `navigator.credentials.create`, so
  the page shows one button. A failed ceremony leaves the invite usable within
  its ten minutes; the second successful use is impossible because consumption
  is a conditional `UPDATE` on `consumed_at IS NULL AND expires_at > now`.
- **Sessions are stateless.** The cookie carries account id and display name
  and is verified by signature and expiry; there is no sessions table and no
  server-side revocation beyond sign-out on the device. Ticket scope did not
  ask for remote sign-out.
- **User verification is `preferred`** in the options and required by the
  library's default at verification, matching the painting project.
- **Without `LEARN_SESSION_KEY` the server warns and uses a random key**, so
  local development works but sessions end at restart.
- **`main.ts` reads three new env names** (`LEARN_SESSION_KEY`,
  `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGINS`). The `dev` task and the token smoke's
  spawn args allow them. Ticket 05's deploy configuration on `main` was written
  after this branch's base and must also allow them and set the two WebAuthn
  values per Deploy context (`WEBAUTHN_RP_ID=learn.joshhale.me`,
  `WEBAUTHN_ORIGINS=https://learn.joshhale.me` in production).
- **Tests without a browser use a software authenticator**
  (`tests/support/software-authenticator.ts`): a P-256 key, "none" attestation,
  hand-built CBOR and DER, so replayed challenges, wrong origins, wrong RP IDs
  and stale sign counts can be produced deliberately. The Playwright test uses
  Chromium's CDP virtual authenticator at a 390x844 viewport.
- **A bug I introduced and fixed:** rewriting `page.ts` turned the literal
  U+2028/U+2029 characters in `inlineJson` into spaces, which replaced every
  space in the lesson JSON with a line separator and broke the two existing
  e2e tests. They now use `"\u2028"` escapes.

### Not done

- Listing or removing passkeys, and remote sign-out, are not in this ticket.
- The real-phone demo (Face ID, kill and reopen the app) needs the deployed
  origin with the WebAuthn variables set; only the virtual-authenticator
  version could be run here.
