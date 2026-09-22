# 14 — Verify the deployed phone experience

**What to do:** Prove that the production site does what Josh will do on his
phone, using mobile-emulated Playwright against the production URL from ticket 05's
report, or `https://learn.joshhale.me` once Josh has attached it,
and then hand Josh a five-minute checklist for a real device. Report defects
as new ticket files. Do not fix anything, and do not create or change any
database.

Automated, against production:

- Manifest and service worker: installability passes, the shell loads offline
  after one visit, and no `/api/` response is ever served from cache.
- Sign-in: with a virtual authenticator, an invite link registers a passkey
  and the session survives a context restart. A reused invite fails cleanly.
- Shelf: a draft created with the owner token appears after refresh, opens,
  caches, and completes offline. A second revision shows Outdated, and the
  discard flow needs confirmation.
- Learning: the full loop from ticket 12's script, run against production.
- Security: HTTPS only, HSTS present, cookie flags correct, no wildcard CORS,
  the capability document and validator served with correct content types,
  and no secret in any response body.

For Josh on a real phone, write a checklist of ten steps or fewer that covers
install to home screen, invite and passkey, open a lesson from a laptop-created
draft, airplane mode resume, and drill mode. Leave space for him to mark each.

**Blocked by:** 05 — Production deployment; 06 — Installable PWA shell; 07 —
Phone sign-in with a passkey; 08 — Mine shelf lists the account's lessons.

**Status:** done d93edf2

- [x] The production audit is a rerunnable Playwright suite that takes the
      base URL and the owner token from the environment and creates only
      lessons whose title starts with `audit-`, then deletes nothing and lists
      what it created in the report.
- [x] Every check above has a pass or fail line in the report with the
      response or screenshot that proves it.
- [x] The real-device checklist is in the report and in the docs directory.
- [x] Every defect is a ticket file with a reproduction.

## Verification

```bash
deno task audit:prod        # LEARN_BASE_URL optional; the owner token is read from .env.prod
deno task smoke:prod
deno task check && deno task test
```

## Report

Audited on 2026-09-22 against `https://learn-joshhale.legoguy32109.deno.net`.
Nothing was fixed and no database was created or changed. Two new defects are
filed as tickets 25 and 26; the remaining failures reproduce tickets 17, 18
and 19 on production and are noted in those tickets.

Production changed under the audit: revision `h649s2fpr17r` served the first
three runs and revision `p6jad39tqqge` was deployed by someone else during
the smoke that followed. The committed report `tests/audit-prod/last-run.md`
and the screenshots are from the final run against `p6jad39tqqge`. Ticket 18
(safe-area padding) and ticket 19 (29px Back control) failed on
`h649s2fpr17r` and pass on `p6jad39tqqge`; their tickets say so.

### The audit suite

`deno task audit:prod` runs `tests/audit-prod/deployed_phone_test.ts`, one
Playwright test in mobile-emulated Chromium (390 by 844, touch, 3x, iPhone
user agent) against `LEARN_BASE_URL` (default: the production URL). The
owner token is read from the `.env.prod` file, as `scripts/smoke-prod.ts`
does, because Deno's `--env-file` never overrides an inherited variable;
`LEARN_OWNER_TOKEN` in the environment is the fallback when the file is
absent, and `LEARN_ENV_FILE` points at another file. Nothing prints a token,
cookie or invite link: every piece of evidence passes through a redactor
that knows the `.env.prod` credential values and the token shapes, and the
final run's report and all four run logs were checked for every `.env.prod`
value and for token-shaped strings (none present).

Sections, in order: transport and security by plain `fetch`; manifest,
service worker and offline from a phone context; sign-in with a virtual
platform authenticator from an invite minted by spawning
`deno task invite:mint --json --base-url <production>`; the shelf from a
signed-in context restored from the stored cookies; the ticket 12 learning
loop; a secret scan over every response body seen (276 in the final run);
page-error and console listeners for the whole run. Failing checks are
collected, not thrown, and the test fails at the end when any check failed,
so the suite is a gate once the tickets land. Every pass and fail line in
`tests/audit-prod/last-run.md` carries its evidence: the request, status and
headers, a JSON excerpt, or a screenshot path under
`tests/audit-prod/screenshots/` (45 JPEGs, regenerated every run).

The ticket 12 walk moved from `tests/audit/learning_loop_phone_test.ts` into
`tests/audit/walk.ts` with the lesson path, timeout and context options as
parameters, because the demo lesson on production has a server-assigned ID.
The local `deno task audit:phone` imports it unchanged. Two helper fixes
were needed and are documented in the code: `projection()` now finds the
`<name>:<revision>:<epoch>` keys ticket 08 introduced (before that it always
returned null, so the "checkpoint rebuilt from events" checks were vacuous;
they are real now and pass at every learning surface), the shelf no longer
gets that comparison (no lesson is open there), and the two drill "stores
never changed" snapshots compare the evidence stores plus the shelf's own
status line instead of derived projections. `deno task audit:phone` after
the change: walk 302 passed, 12 failed; probes 4 passed, 10 failed; the
failing checks are exactly the ones tickets 17 to 24 already list (the
browser-Back URL probe now passes on main). Its committed report and
screenshots were left as ticket 12 wrote them.

### Counts, final run against `p6jad39tqqge`

| Suite | Passed | Failed | Observations |
| --- | --- | --- | --- |
| Deployed phone experience | 367 | 12 | 15 |

Of the 367, 308 are the ticket 12 walk and drill against production.

### Pass or fail per check the ticket names

| Check | Result | Evidence |
| --- | --- | --- |
| Manifest installability | PASS | `Page.getAppManifest`: no parse errors, name `learn`, `kStandalone`, start URL `/`, theme `rgba(234,226,211,1)`, icons 192 and 512; the four PNG icons serve as `image/png`. Headless Chromium's `getInstallabilityErrors` is always empty and is recorded as an observation only. |
| Shell loads offline after one visit | FAIL, ticket 25 | `GET /sw.js` -> 404 `readfile '/app/src/src/client/pwa/sw.js'`; no registration, `caches.keys()` empty; reload offline: `net::ERR_INTERNET_DISCONNECTED` for `/` and for the learning URL. |
| No `/api/` response from cache | PASS, with a caveat | No cache exists to serve from (ticket 25). Two fetches of `/api/v1/session` answered `cache-control: private, no-store`, `age: 0`, `cache-status: deno; fwd=bypass; detail=not-cacheable`; 0 `/api/` entries in caches. |
| Invite link registers a passkey | PASS | `deno task invite:mint` link expires in 600 s; invite page 200 "Invite for Josh Hale"; registration lands on `/` reading "Signed in as Josh Hale" (screenshot 02). |
| Session survives a context restart | PASS | New context from stored cookies: shelf "Signed in as Josh Hale"; `GET /api/v1/session` -> `{"signedIn":true,"displayName":"Josh Hale"}` (screenshot 05). |
| Reused invite fails cleanly | PASS | Second open -> 410 page "already used", no trace (screenshot 04); registration options for the used invite -> 410 problem document `Invite already used`. |
| Draft appears after refresh, opens, caches | PASS | `POST /api/v1/lessons` -> 201 revision 1; first on the shelf, Not started (screenshot 06); overview at `/learn/<id>` with the revision in IndexedDB `lessons` and `progress_streams` pinned at epoch 0 (screenshot 07). |
| Completes offline | PASS in-page, FAIL on reload | With the network off the first Concept completed from IndexedDB, 4 events against revision 1 (screenshot 08). Reloading the learning URL offline failed (ticket 25). |
| Second revision shows Outdated | PASS | `POST .../revisions` -> 201 revision 2; shelf shows In progress and Outdated (screenshot 09); Resume this revision keeps revision 1 at Card 1 of Concept 2. |
| Discard needs confirmation | PASS | Discard shows `#discard-confirm` (screenshot 10); Keep my progress changes nothing; confirming pins revision 2 at epoch 1, keeps the old events, opens the new overview Not started (screenshots 11, 12). |
| Learning: ticket 12 loop on production | PASS except ticket 17 | 308 passed, 4 failed: the reload-after-Back and browser-Back URL cases ticket 17 already describes. Sixteen surfaces screenshotted in light and dark. |
| HTTPS only | PASS | `GET http://…/` -> 301 `location: https://…/`; every response over HTTPS carries `x-learn-revision`. |
| HSTS present | FAIL, ticket 26 | No `strict-transport-security` on the shell or on `/api/v1/capabilities`. |
| Cookie flags | PASS | `Set-Cookie: learn_session=[redacted]; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure`; the browser sees httpOnly, secure, Lax, host-only, 30.0 days. |
| No wildcard CORS | PASS | Foreign `Origin` on capabilities, shelf (with token), session and OpenAPI: no `access-control-allow-origin` at all; a preflight is not granted; a cross-site passkey ceremony is refused 403 `Cross-site request`. |
| Capability document and validator content types | PASS | `/api/v1/capabilities` and `/.well-known/learn-joshhale.json` `application/json` with `apiVersion v1`; `/tools/lesson-validator.js` `text/javascript` exporting `resolveLesson`; schema and OpenAPI `application/json`; manifest `application/manifest+json`. `/sw.js` FAILS (ticket 25). |
| No secret in any response body | PASS | 276 bodies (shell, discovery documents, validator, shelf and revision JSON with the owner token, invite and sign-in responses, problem documents, every page load) contain no `.env.prod` credential and no token-shaped string. `/.env`, `/.env.prod`, `/deno.json`, `/main.ts`, `/src/server/*`, `/migrations/*` and `/tests/*` answer 404. |
| Listeners | PASS with the worker exception | No `pageerror`. Console: 37 identical errors, all the failed `/sw.js` fetch (ticket 25), plus one 410 from deliberately reopening the used invite. |

### Failed checks mapped to tickets

| Ticket | Failing checks in the final run |
| --- | --- |
| 25 (new) | `content types · /sw.js …`; `worker · the service worker registers …`; `worker · one versioned shell cache …`; `offline · after one visit …`; `offline · reloading the learning URL …`; `listeners · the browser logged no failed service-worker script fetch` |
| 26 (new) | `hsts · … on the shell`; `hsts · … on an API response` |
| 17 | `reload · overview after Back from first Card · surface comes back`; `first step · reload after Back-to-overview …`; `first step · browser Back leaves the URL at the shelf path`; `reload · shelf after browser Back from first Card · surface comes back` |
| 18, 19 | Failed on `h649s2fpr17r` (six safe-area checks, two 44px checks); pass on `p6jad39tqqge`. |

### Observations, not filed

- The shell carries none of `content-security-policy`,
  `x-content-type-options`, `referrer-policy`, `x-frame-options` or
  `permissions-policy`. Ticket 26 mentions the two cheap ones.
- The production account's display name is "Josh Hale", so the shelf reads
  "Signed in as Josh Hale" where tickets 07 and 08 wrote "Signed in as Josh".
  The suite reads the name from the invite page.
- `/tools/lesson-validator.d.ts` is served as `text/plain`; the asset route
  has no better type for `.ts`.
- Public discovery documents have no `cache-control`; the edge reports
  `zero-ttl` bypass for them. Account reads are `private, no-store`.
- Every run of the suite registers one more passkey credential on Josh's
  production account, from a virtual authenticator that no real device holds.
  Ticket 07 left listing and removing passkeys out of scope; four such
  credentials now exist (see below).
- The overview of an outdated revision keeps "Every question" available, as
  ticket 08 decided.

### Created on production, nothing deleted

Four runs of the suite (three while fixing the suite's own assumptions about
the display name and the secret list, one final):

- Four sign-in invites, each consumed by that run's passkey registration.
- Four passkey credentials on Josh's account, ids starting `AM/0dYaF53pA`,
  `wCUo4mx8jC3D`, `Txv+3Gktai50`, `oUe6z3hHtDR7`.
- Three lessons, each with two revisions, owned by Josh's account:
  `b7bdd896-3037-470b-9978-a946a2a2ee73` "audit-2026-09-22T05-25-54",
  `55902361-e040-4c55-957f-5679d50f09f3` "audit-2026-09-22T05-28-05",
  `42dc71e5-4e44-4f09-8fe3-71477edd70c0` "audit-2026-09-22T05-29-51",
  the second revision of each titled "… (revision 2)". The first run created
  no lesson because its sign-in section stopped at the display-name check.

### Real-device checklist

`docs/phone-checklist.md`, ten steps with a box to mark each: add to home
screen, invite and passkey, reused invite, kill and reopen, laptop-created
draft on the shelf, open to Card 2, airplane-mode reopen and Resume, answer
offline and reconnect, drill mode, sign out and back in. It tells Josh up
front that step 7 fails today because of ticket 25.

### Other verification

`deno task smoke:prod` passed all six checks (served by `p6jad39tqqge`).
`deno task check` exit 0. `deno task test` 107 passed. `deno task audit:phone`
as above.

### Decisions

- Mobile emulation is Chromium with an iPhone viewport, touch and user agent.
  WebKit is not installed for Playwright here, and the virtual authenticator
  is a Chromium CDP feature; a real Safari run is what the checklist is for.
- The learning loop runs as a guest on the featured demo lesson, as ticket 12
  did, with a 10 s per-action timeout for the network.
- The offline checks record both the reload (needs the worker) and the
  in-page completion (needs only IndexedDB) so the report separates what
  ticket 25 breaks from what still works.
- Tickets 17, 18 and 19 got a short "Also on production" note rather than
  duplicate tickets.
- One task, `audit:prod`, was added to `deno.json`. No application file was
  changed.

### Not done

- Nothing in scope was left out. The real-phone run is Josh's, with the
  checklist.
- The cause named in ticket 25 (the top-level `exclude` in `deno.json`
  reaching the deploy upload) is the strongest candidate from the evidence,
  not a confirmed upload listing; confirming it needs a deploy with `--debug`,
  which a verification ticket does not run.
