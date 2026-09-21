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

**Status:** ready-for-agent

- [ ] A new sequential migration adds passkey credentials and invites.
      `001_initial.sql` is unchanged.
- [ ] Minting an invite requires a token with an owner scope. A token without
      it gets `403`. An invalid token gets `401`.
- [ ] An invite is single-use and expires. A second use or a late use gets a
      clear error page, not a stack trace.
- [ ] Registration and sign-in ceremonies verify the challenge, origin and
      relying-party ID. Tests cover a replayed challenge and a wrong origin.
- [ ] The session cookie is HttpOnly, Secure outside localhost, SameSite Lax,
      and signed. Tampering signs the user out.
- [ ] A phone-sized Playwright test uses a virtual authenticator to register
      and sign in, then reloads and stays signed in.
- [ ] Database tests run against an ephemeral `learn-test-<uuid>` database that
      is deleted in `finally`.
- [ ] `deno task check`, `deno task test`, `deno task test:db` and
      `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task test:db && deno task e2e
```
