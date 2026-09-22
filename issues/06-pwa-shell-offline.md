# 06 — Installable PWA shell that reopens a cached lesson offline

**What to build:** Josh adds the site to his phone's home screen. With the
network off, he opens it from the icon, sees his shelf, opens a lesson he
already opened once, and resumes exactly where he left.

Add a web app manifest with icons from the UI reference's icon set, standalone
display, the theme colors already in the page shell, and the stable start URL.
Add a service worker that caches only the versioned application shell and
static assets: the HTML shell, CSS, browser modules, icons and the manifest.
Lesson content and progress stay in IndexedDB as `docs/architecture.md`
requires. Never cache an API response or a mutation.

Version the cache by a build hash. A new deploy activates the new worker on the
next launch and removes the old cache. Show a small "Update ready" affordance
when a new version is waiting, without interrupting a Question.

**Demo path:** Install to the home screen, open the demo lesson to Card 2, turn
on airplane mode, close and reopen from the icon, and see Card 2.

**Blocked by:** 01 — Split the browser app and server routes into domain modules.

**Status:** done d26f462

- [x] The manifest passes an installability check in Chromium: name, icons at
      192 and 512, start URL, display standalone, theme color.
- [x] The service worker precaches the shell and static assets and serves them
      offline. A request to any `/api/` path is never served from the worker's
      cache.
- [x] A phone-sized Playwright test loads the app once, goes offline with the
      browser context, reloads, and resumes the same Card from IndexedDB.
- [x] A changed asset hash results in a new cache name, and the old cache is
      deleted after activation.
- [x] Every request the worker handles is covered by a unit test of its routing
      decision, run without a browser.
- [x] `deno task check`, `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task e2e
```

## Report

Implemented at d26f462 on branch `ticket/06`.

### Verification

`deno task check && deno task test && deno task e2e` passed twice in a row. Condensed
output of the second run (type-check `Check` lines omitted):

```text
running 5 tests from ./tests/client/flow_test.ts
Continue walks every Card, then opens a shuffled Check for that Concept ... ok (922µs)
a wrong Check answer offers another Question; the last one moves to the next Concept ... ok (392µs)
I don't know ends the Check, names the answer, and points at the correcting Card ... ok (315µs)
the Wrap-up asks one Question per Concept, retries misses, and finishes on the summary ... ok (261µs)
Back inspects the previous Card and never touches Questions ... ok (88µs)
running 7 tests from ./tests/client/sw_routing_test.ts
every /api/ path bypasses the cache, even when it is a GET ... ok (524µs)
every mutation bypasses the cache regardless of path ... ok (82µs)
page loads are navigations, whatever the path ... ok (36µs)
precached shell assets are served from the versioned cache ... ok (37µs)
the worker scripts, discovery documents and unknown paths pass through untouched ... ok (37µs)
the cache is named by the build hash and only stale shell caches are swept ... ok (137µs)
an update may not interrupt an unanswered Question ... ok (84µs)
running 3 tests from ./tests/server/api_test.ts
capability discovery is public ... ok (5ms)
resolver reports diagnostics without authentication ... ok (1ms)
draft persistence requires a bearer token ... ok (291µs)
running 6 tests from ./tests/server/pwa_test.ts
the manifest is installable: name, 192 and 512 icons, start URL, standalone, theme color ... ok (6ms)
the page shell links the manifest and both theme colors; the offline shell inlines no lesson ... ok (308µs)
the served worker carries the build hash and precache list and is never HTTP-cached ... ok (13ms)
a changed asset byte changes the build hash, so the cache name changes ... ok (2ms)
renderWorker substitutes both placeholders and refuses a source without them ... ok (222µs)
the inlined lesson keeps ordinary spaces and escapes only the line separators ... ok (192µs)
running 3 tests from ./tests/server/resolver_test.ts
lesson/v1 resolver is deterministic and write-free ... ok (2ms)
resolver requires explicit provenance ... ok (189µs)
declined provenance is explicit and valid ... ok (279µs)
running 6 tests from ./tests/server/token_test.ts
personal tokens carry at least 256 bits of random material behind the prefix ... ok (432µs)
redaction keeps the prefix and removes the secret from any text ... ok (381µs)
a missing or invalid token gets 401 and a valid token without the scope gets 403 ... ok (13ms)
a bearer token passed into an error path never reaches the error message or the log ... ok (4ms)
scope validation rejects unknown and empty scope lists ... ok (242µs)
token script helpers parse durations and list only metadata columns ... ok (422µs)
running 6 tests from ./tests/shared/learning_test.ts
demo fixture satisfies structural invariants ... ok (637µs)
answer evaluation is exact and normalized ... ok (227µs)
progress reducer is monotonic and derives learned ... ok (197µs)
shuffling is stable and seed-sensitive ... ok (149µs)
checkpoint reconstruction chooses the last immutable checkpoint ... ok (144µs)
ok | 36 passed | 0 failed (316ms)
running 1 test from ./tests/e2e/contract_regressions_test.ts
resume, corrective routing, and I don't know obey the flow contract ...Listening on http://0.0.0.0:8002/ (http://localhost:8002/)
running 1 test from ./tests/e2e/happy_path_test.ts
phone learner resumes and reaches Learned ...Listening on http://0.0.0.0:8001/ (http://localhost:8001/)
running 1 test from ./tests/e2e/pwa_offline_test.ts
phone reopens a cached lesson offline and takes an update between Questions ...Listening on http://0.0.0.0:8003/ (http://localhost:8003/)
ok | 3 passed | 0 failed (6s)
```

`deno task check` now also runs `deno check --config deno.worker.json src/client/pwa/sw.js`,
which type-checks the worker under the `webworker` lib. `deno.json` excludes that one file
from the dom-lib pass. I confirmed the worker pass is real by adding a type error to a
temporary copy and watching it fail.

### What was built

- `public/manifest.webmanifest`: name, short name, `id` and `start_url` `/`, `scope` `/`,
  `display: standalone`, `theme_color #eae2d3`, `background_color #f2ede3`, icons at 192,
  512 and a 512 maskable. `public/icons/` holds the PNGs rendered from the reference icon
  set's Tabler `book-2` glyph on the bronze accent, plus the SVG source and a 180px
  apple-touch icon. The page shell links the manifest, the icons and keeps both
  `theme-color` metas.
- `src/server/build.ts`: hashes every shell file (`/css`, `/js`, `/icons`, `/src/client`,
  `/src/shared`, the manifest, and the `/shell` HTML) into a 12-hex build hash and derives
  the precache list. Computed once per process; tests inject their own provider through
  `Dependencies.build`.
- `src/server/routes/pwa.ts`: serves `/manifest.webmanifest`, the lesson-free `/shell`
  document, `/sw.js` rendered from `src/client/pwa/sw.js` with the hash and precache list
  substituted (`cache-control: no-cache`), and `/sw-routing.js`.
- `src/client/pwa/sw-routing.js`: pure `classifyRequest`, `cacheName`, `staleCaches`.
  `sw.js`: install precaches, activate deletes every other `learn-shell-*` cache and claims
  clients, fetch routes by classification. Non-GET and `/api/` requests are never handled.
  Navigations are network first with the cached `/shell` as fallback.
- `src/client/pwa/register.js` and `update-policy.js`: registration, "Update ready"
  affordance with a Reload button that posts `SKIP_WAITING` and reloads on
  `controllerchange`. `canInterrupt` holds the affordance while a Question is unanswered;
  `app.js` re-offers it after every render.
- `public/js/app.js` boots from the inlined lesson when present, otherwise from the Lesson
  Revisions cached in IndexedDB (`localRepository.lessons()`), picking the one the
  `/learn/<id>` URL names.
- Docs: `CONTEXT.md` and `docs/architecture.md` no longer say the service worker is later
  work and describe the versioned shell.

### Tests

- `tests/client/sw_routing_test.ts`: every routing kind (API GETs, mutations, navigations,
  precached assets, worker scripts and unknown paths), cache naming, stale-cache sweep, and
  the update policy. Runs without a browser.
- `tests/server/pwa_test.ts`: manifest fields and real PNG dimensions, shell markup, the
  rendered worker (hash, precache contents, every precached URL serves 200, nothing under
  `/api/` or `/src/server/`), a changed asset byte changes the hash, placeholder
  substitution, and an inline-JSON regression test (see Decisions).
- `tests/e2e/pwa_offline_test.ts` at 390x844: waits for the worker to control the page,
  asserts the cache holds exactly the precache list and no `/api/` entry, reaches Card 2,
  goes offline with `context.setOffline(true)`, reloads and sees Card 2 from a shell with no
  inlined lesson, opens a second page at `/` offline, resumes to Card 2, confirms an `/api/`
  fetch fails offline instead of being served, then swaps the build hash, calls
  `registration.update()`, confirms "Update ready" is absent while a Question is unanswered,
  answers it, sees the affordance, clicks Reload, and confirms only the new
  `learn-shell-<hash>` cache remains.

### Decisions

- **Installability check.** Chromium's `Page.getInstallabilityErrors` returns an empty list
  for every page in headless Chromium, including pages with no manifest, so it proves
  nothing. The e2e test instead uses `Page.getAppManifest`, Chromium's own manifest parser,
  and asserts zero parse errors plus the parsed name, `kStandalone` display, start URL,
  theme color and the 192 and 512 icons. The server test checks the same fields and the
  PNG dimensions. A real install prompt on a phone is what ticket 14 verifies.
- **Worker versioning without hashed URLs.** Asset URLs stay unhashed. The build hash is
  embedded in the served `/sw.js`, so any shell change changes the worker bytes and the
  browser's byte comparison triggers the update. This is simpler than the painting app's
  content-addressed URLs and sufficient for a cache-first shell.
- **Lesson-free `/shell`.** The regular page inlines the featured lesson, which is content,
  not shell. The worker therefore precaches a separate `/shell` document with no lesson and
  the boot module reads the lesson from IndexedDB, which keeps the "shell only" rule exact.
- **Navigations are network first.** Online, a page load always gets the current deploy and
  the current featured lesson. Offline, the cached `/shell` is served.
- **Update affordance placement.** A small fixed pill at the bottom above the safe area, with
  a 44px Reload button, styled from tokens. It is a `role="status"` element and never a
  modal.
- **Regression I introduced and fixed before commit.** `inlineJson` in `page.ts` escapes the
  literal U+2028 and U+2029 characters. Rewriting the file turned those invisible literals
  into plain spaces, which made every space in the inlined lesson a line separator and broke
  the existing e2e tests. Restored the literal code points and added a server test that the
  inlined lesson contains no U+2028 and parses back to the fixture title.

### Not done

Nothing in scope was left out. Requesting persistent storage and an install banner were not
asked for and were not added.
