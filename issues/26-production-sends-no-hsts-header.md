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

**Status:** ready-for-agent

- [ ] Every response over HTTPS carries `strict-transport-security` with
      `max-age` of at least 15552000; a unit test proves it for a page, an
      API document and a problem response, and proves the header is absent
      for a plain `http://localhost` request.
- [ ] The two audit checks above pass in `deno task audit:prod`.
- [ ] `deno task check`, `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task deploy
deno task audit:prod
```
