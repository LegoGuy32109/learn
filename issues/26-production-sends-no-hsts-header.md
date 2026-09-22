# 26 — Production sends no Strict-Transport-Security header

**What to build:** Every HTTPS response from the application must carry
`Strict-Transport-Security` with a `max-age` of at least 180 days, so a phone
that has visited once never follows a plain `http://` link or a captive-portal
downgrade to the site again. Ticket 14's security check requires HSTS to be
present; it is not.

Today the platform redirects `http://` to `https://` with a 301, which is
correct, but no response carries the header:

```text
GET https://learn-joshhale.legoguy32109.deno.net/
HTTP/2 200
content-type: text/html; charset=utf-8
x-learn-revision: h649s2fpr17r   (also on p6jad39tqqge, deployed later the same day)
date: ...
content-length: 20230
cache-status: deno; fwd=bypass; detail=zero-ttl
server: deployd
```

Deno Deploy does not add the header on the application's behalf, so the
application has to. `src/app.ts` already wraps every response to set
`x-learn-revision`; the same place can add
`strict-transport-security: max-age=31536000; includeSubDomains` when the
request URL is `https:` (never on the plain `localhost` development server,
where browsers would remember it for the port-less host). The session cookie
is already `Secure`, so nothing else changes.

While there, the audit observed that the shell also carries none of
`content-security-policy`, `x-content-type-options`, `referrer-policy`,
`x-frame-options` or `permissions-policy`. They are not required by ticket 14
and are not part of this ticket's acceptance; `x-content-type-options:
nosniff` and `referrer-policy: same-origin` are cheap to add in the same
wrapper if the implementer wants to.

**Reproduction:**

```bash
curl -sS -D - -o /dev/null https://learn-joshhale.legoguy32109.deno.net/ | grep -i strict-transport-security || echo "no HSTS"
curl -sS -D - -o /dev/null https://learn-joshhale.legoguy32109.deno.net/api/v1/capabilities | grep -i strict-transport-security || echo "no HSTS"
deno task audit:prod
```

Failing audit checks:

- `hsts · Strict-Transport-Security is present on the shell`
- `hsts · Strict-Transport-Security is present on an API response`

**Blocked by:** None.

**Status:** done 5ec0a73

- [x] Every response over HTTPS carries `strict-transport-security` with
      `max-age` of at least 15552000; a unit test proves it for a page, an
      API document and a problem response, and proves the header is absent
      for a plain `http://localhost` request.
- [x] The two audit checks above pass in `deno task audit:prod`.
- [x] `deno task check`, `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task deploy
deno task audit:prod
```

## Report

**Fix.** `src/app.ts`'s existing response wrapper (previously only
`withRevision`) now sets, on every response:

- `x-content-type-options: nosniff` and `referrer-policy: same-origin`
  unconditionally (suggested by the ticket as cheap additions; not required
  by acceptance);
- `strict-transport-security: max-age=31536000; includeSubDomains` only when
  `isSecureRequest(request)` is true, i.e. the request URL scheme is `https:`
  or the first value of `x-forwarded-proto` is `https`. A plain
  `http://localhost` request (the dev server) never gets the header, so a
  browser never pins HSTS for the port-less local host.

`max-age=31536000` is one year, well over the ticket's 180-day (15552000s)
floor. The session cookie was already `Secure`, so nothing else changed
there, matching the ticket's note.

Kept the header-setting logic and the response-copy fallback (for a
`Response` whose headers are immutable) in one place, `responseHeaders` +
`withHeaders`, replacing the narrower `withRevision`/`REVISION_HEADER`-only
version. `REVISION_HEADER` and its behavior are unchanged.

New `tests/server/security_headers_test.ts`:
- proves HSTS with `max-age >= 15552000` on a page (`/`), an API document
  (`/api/v1/capabilities`) and a problem response (`/no/such/route`, 404);
- proves the 404 is still a well-formed `application/problem+json` document
  carrying the header;
- proves the header is absent for `http://localhost:8000` on all three
  shapes;
- unit-tests `isSecureRequest` directly against a bare HTTPS request, a
  forwarded HTTP request with `x-forwarded-proto: https` (including a
  comma-separated value), and both local-HTTP cases;
- proves `nosniff` and `same-origin` on both an HTTPS and an HTTP request.

**Verification, run against production:**

```
$ curl -sS -D - -o /dev/null https://learn-joshhale.legoguy32109.deno.net/
strict-transport-security: max-age=31536000; includeSubDomains
$ curl -sS -D - -o /dev/null https://learn-joshhale.legoguy32109.deno.net/api/v1/capabilities
strict-transport-security: max-age=31536000; includeSubDomains
```

`deno task audit:prod`: both `hsts · Strict-Transport-Security is present on
the shell` and `hsts · Strict-Transport-Security is present on an API
response` pass, as part of 377 passed, 0 failed overall (the other 375
include ticket 25's checks, worked in the same pass — see issue 25's report).

`deno task check` (132 checks), `deno task test` (132 passed, including the
4 new cases above) and `deno task e2e` (8 passed) all pass.

**Decisions:** Left the five optional headers the ticket names as
not-required (`content-security-policy`, `x-frame-options`,
`permissions-policy`) unset; only added the two the ticket calls out as cheap
(`x-content-type-options`, `referrer-policy`). Did not add a CSP, since
designing one is a separate scoped decision this ticket does not ask for.
