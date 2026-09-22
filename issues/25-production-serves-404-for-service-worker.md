# 25 — Production serves 404 for /sw.js, so nothing installs or works offline

**What to build:** `GET /sw.js` on production must return the rendered service
worker as `text/javascript`, the way it does locally, so a phone that has
visited once can reopen the shelf and a cached lesson with the network off.

Today production answers:

```text
GET https://learn-joshhale.legoguy32109.deno.net/sw.js
HTTP/2 404
content-type: application/problem+json; charset=utf-8
x-learn-revision: h649s2fpr17r   (also on p6jad39tqqge, deployed later the same day)

{"type":"about:blank","title":"Not found","status":404,
 "detail":"No such file or directory (os error 2): readfile '/app/src/src/client/pwa/sw.js'"}
```

The route in `src/server/routes/pwa.ts` reads `src/client/pwa/sw.js` from
disk and the file is not in the deployed bundle. Its sibling
`/src/client/pwa/sw-routing.js` and `/src/client/pwa/register.js` are served
with 200 through the asset route, while `/src/client/pwa/sw.js` is also 404,
so exactly one file is missing from the upload.

The strongest candidate cause: `deno.json` has a top-level
`"exclude": ["src/client/pwa/sw.js"]`, added by ticket 06 so that
`deno check src/client/**/*.js` skips the worker (it is type-checked
separately under `deno.worker.json` with the `webworker` lib). The Deno
Deploy CLI honors `exclude` in `deno.json` when it builds the upload, so the
same entry removes the file from the bundle. `deploy.exclude` in the same
file is a different list and does not name it. Confirm with an upload run
under `--debug` and look for `src/client/pwa/sw.js` in the file list, as
ticket 05's report did for the env files.

Consequences on a phone, all reproduced by `deno task audit:prod`:

- The browser logs `A bad HTTP response code (404) was received when fetching
  the script.` on every page load and never registers a worker.
- `caches.keys()` is empty; nothing is precached.
- With the network off, reloading `/` or a learning URL fails with
  `net::ERR_INTERNET_DISCONNECTED`. Ticket 06's demo path (airplane mode,
  reopen from the icon, see Card 2) cannot pass. Ticket 08's offline
  completion works only while the page stays open, because IndexedDB holds
  the lesson; a reload loses the shell.
- The "Update ready" affordance can never appear.

The fix is the implementer's call: keep the worker out of the dom-lib check
without a top-level `exclude` (for example list the checked files
explicitly, or move the worker source under a directory the check glob does
not cover), or exclude it from the check in a way the deploy CLI does not
read. Whatever the change, add a production smoke check for `GET /sw.js`
(200, `text/javascript`, no `__BUILD_HASH__` placeholder) so a deploy that
drops the worker fails its smoke.

**Reproduction:**

```bash
curl -sS -D - https://learn-joshhale.legoguy32109.deno.net/sw.js
curl -sS -o /dev/null -w '%{http_code}\n' https://learn-joshhale.legoguy32109.deno.net/src/client/pwa/sw.js
curl -sS -o /dev/null -w '%{http_code}\n' https://learn-joshhale.legoguy32109.deno.net/src/client/pwa/sw-routing.js
deno task audit:prod
```

Failing audit checks:

- `content types · /sw.js is served as text/javascript with the build hash substituted`
- `worker · the service worker registers and controls the page after the first visit`
- `worker · one versioned shell cache holds the shell and no /api/ path`
- `offline · after one visit the start URL opens the shelf with the network off`
- `offline · reloading the learning URL with the network off shows the cached overview`
- `listeners · the browser logged no failed service-worker script fetch`

**Blocked by:** None.

**Status:** done 5ec0a73

- [x] `GET /sw.js` on production answers 200 `text/javascript` with the
      build hash and precache list substituted.
- [x] `deno task smoke:prod` checks `/sw.js` and fails when it is missing.
- [x] `deno task audit:prod` passes the six checks above, including the
      offline reload of `/` and of a learning URL.
- [x] `deno task check` still type-checks the worker under the `webworker`
      lib and `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task deploy
deno task audit:prod
```

## Report

**Cause confirmed.** `deno.json`'s top-level `"exclude": ["src/client/pwa/sw.js"]`
was read by both `deno check` (its intended purpose, to keep the worker out of
the dom-lib pass) and the Deno Deploy CLI's upload builder, which dropped the
file from the bundle. `deploy.exclude` is a separate list and never named it.

**Fix.** Removed the top-level `exclude` entirely. The `check` task's dom-lib
pass now lists `src/client/identity/*.js`, `src/client/learning/*.js`,
`src/client/library/*.js`, `src/client/storage/*.js`, `src/client/ui/*.js`,
and the three non-worker files in `src/client/pwa/` explicitly, instead of a
`src/client/**/*.js` glob that would have pulled the worker back in. The
worker is still checked on its own, unchanged, as
`deno check --config deno.worker.json src/client/pwa/sw.js`. A new case in
`tests/server/deploy_config_test.ts` asserts `config.exclude` is `undefined`
and pins the shape of the `check` task, so a future top-level `exclude` (or a
glob that re-includes the worker in the dom-lib pass) fails `deno task test`
before it ever reaches a deploy.

Added a `GET /sw.js` check to `scripts/smoke-prod.ts`: 200,
`text/javascript`, and neither the `__BUILD_HASH__` nor `__PRECACHE__`
placeholder left unsubstituted. It runs right after the shell check on every
`deno task deploy`.

**A second, related defect surfaced once /sw.js actually worked.** The
production audit's shelf section (`tests/audit-prod/deployed_phone_test.ts`)
opens a fresh browser context, opens the draft lesson, and immediately sets
the network offline to test the cached-shell reload. It never waited for that
context's newly registering service worker to finish precaching and take
control first, so the offline reload raced a worker still in the `installing`
state and failed with `net::ERR_INTERNET_DISCONNECTED` regardless of what
production served — confirmed with a throwaway Playwright probe showing
`controller: null, installing: "installing"` at the moment the test went
offline. Added the same
`await page.waitForFunction(() => navigator.serviceWorker.controller !== null, ...)`
wait already used elsewhere in `tests/e2e/*` before that context goes
offline. This is a fix to the audit's own timing, not to the application.

**Verification, run against production:**

```
$ deno task deploy
Deployed revision cdmtr0y4ksaj to https://learn-joshhale.legoguy32109.deno.net.
PASS shell: 200 /
PASS service worker: 200 /sw.js
PASS capabilities: 200 /api/v1/capabilities
PASS schema: 200 /api/v1/schemas/lesson/v1
PASS validator: 200 /tools/lesson-validator.js
PASS resolve: 200 /api/v1/lesson-resolutions
PASS list lessons: 200 /api/v1/lessons
Smoke passed against https://learn-joshhale.legoguy32109.deno.net (served by revision cdmtr0y4ksaj)

$ deno task audit:prod
377 passed, 0 failed, 15 observations
```

All six previously failing checks now pass: `content types · /sw.js ...`,
`worker · the service worker registers and controls the page ...`,
`worker · one versioned shell cache holds the shell ...`,
`offline · after one visit the start URL opens the shelf ...`,
`offline · reloading the learning URL with the network off ...`, and
`listeners · the browser logged no failed service-worker script fetch`.

`deno task check` (132 checks incl. the worker under `webworker`),
`deno task test` (132 passed) and `deno task e2e` (8 passed) all pass.

Curl reproduction against production, after the fix:

```
$ curl -sS -D - https://learn-joshhale.legoguy32109.deno.net/sw.js
HTTP/2 200
content-type: text/javascript; charset=utf-8
$ curl -sS https://learn-joshhale.legoguy32109.deno.net/sw.js | grep -c '__BUILD_HASH__\|__PRECACHE__'
0
```

**Decisions:** Worked ticket 26 in the same pass since both were assigned to
this worktree and both touch `src/app.ts`'s response wrapper and
`scripts/smoke-prod.ts`; see issue 26 for its own report. Nothing else was
widened beyond the two tickets' acceptance criteria.
