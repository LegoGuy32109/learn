# 01 — Split the browser app and server routes into domain modules

**What to build:** No learner-visible change. The browser learning app and the
server request handler are each one dense file today. Split them so that the
tickets that follow can land in parallel without editing the same file.

Browser side: one entry module per surface (shelf, overview, learning shell),
one module for the flow controller, one for rendering the Card, Question,
feedback and corrective views, and the storage repositories already under the
client storage boundary. Server side: keep bootstrap in the entry file, keep
the request handler as the composition point, and move route groups into
domain modules (pages, lesson API, discovery, static assets) that export
handlers the composition point wires.

Keep the dependency direction from `docs/architecture.md`: shared code imports
no DOM, IndexedDB, HTTP or database code. Format the split code so a line holds
one statement. The current files pack several statements per line, which makes
review and merge conflicts hard.

**Demo path:** The demo lesson plays exactly as before on a phone viewport, and
every existing test passes without edits to its assertions.

**Blocked by:** None — can start immediately.

**Status:** done 109718d

- [x] The browser code has one entry module per major surface and no module
      longer than about 200 lines.
- [x] The server request handler contains only composition; each route group
      lives in its own domain module.
- [x] No shared module imports a browser, Deno, IndexedDB or Turso API.
- [x] Existing unit, server, database and browser tests pass unchanged in
      what they assert. Import paths may change.
- [x] `deno task check`, `deno task test`, `deno task test:db` and
      `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task test:db && deno task e2e
```

## Report

Implementation commit: `109718d` on branch `ticket/01`. The ticket update is
the following commit on the same branch.

### Verification output

`deno task check && deno task test && deno task test:db && deno task e2e`

```text
Task check deno check main.ts src/app.ts public/js/*.js src/shared/**/*.js src/client/**/*.js src/server/**/*.ts scripts/*.ts
Check main.ts
Check src/app.ts
Check public/js/app.js
Check public/js/learn.js
Check public/js/overview.js
Check public/js/shelf.js
Check src/shared/authoring/resolver.js
Check src/shared/learning/checkpoint.js
Check src/shared/learning/evaluate.js
Check src/shared/learning/progress.js
Check src/shared/learning/shuffle.js
Check src/shared/learning/transitions.js
Check src/shared/lessons/lesson.js
Check src/client/learning/flow.js
Check src/client/learning/session.js
Check src/client/learning/views.js
Check src/client/storage/repository.js
Check src/client/ui/controls.js
Check src/server/repositories/lessons.ts
Check src/server/routes/assets.ts
Check src/server/routes/discovery.ts
Check src/server/routes/lessons.ts
Check src/server/routes/pages.ts
Check src/server/routes/route.ts
Check src/server/views/page.ts
Check scripts/bootstrap-owner.ts
Check scripts/generate-tools.ts
Check scripts/migrate.ts
Check scripts/provision-databases.ts
Check scripts/seed-demo.ts

Task test deno test --allow-read tests/shared tests/client tests/server
running 5 tests from ./tests/client/flow_test.ts
Continue walks every Card, then opens a shuffled Check for that Concept ... ok
a wrong Check answer offers another Question; the last one moves to the next Concept ... ok
I don't know ends the Check, names the answer, and points at the correcting Card ... ok
the Wrap-up asks one Question per Concept, retries misses, and finishes on the summary ... ok
Back inspects the previous Card and never touches Questions ... ok
running 3 tests from ./tests/server/api_test.ts
capability discovery is public ... ok
resolver reports diagnostics without authentication ... ok
draft persistence requires a bearer token ... ok
running 3 tests from ./tests/server/resolver_test.ts
lesson/v1 resolver is deterministic and write-free ... ok
resolver requires explicit provenance ... ok
declined provenance is explicit and valid ... ok
running 6 tests from ./tests/shared/learning_test.ts
demo fixture satisfies structural invariants ... ok
answer evaluation is exact and normalized ... ok
progress reducer is monotonic and derives learned ... ok
shuffling is stable and seed-sensitive ... ok
checkpoint reconstruction chooses the last immutable checkpoint ... ok
Check and Wrap-up transitions preserve their distinct retry rules ... ok
ok | 17 passed | 0 failed (144ms)

Task test:db deno test --env-file=.env --allow-env --allow-net --allow-read tests/db
running 1 test from ./tests/db/draft_api_test.ts
authenticated draft API persists idempotently in Turso ... ok (2s)
ok | 1 passed | 0 failed (2s)

Task e2e deno test --allow-all tests/e2e
running 1 test from ./tests/e2e/contract_regressions_test.ts
resume, corrective routing, and I don't know obey the flow contract ... ok (2s)
running 1 test from ./tests/e2e/happy_path_test.ts
phone learner resumes and reaches Learned ... ok (2s)
ok | 2 passed | 0 failed (4s)
```

No existing test file changed. Their assertions and import paths are as they
were on `main`.

Extra checks run by hand: every module URL in the browser import graph returns
`200 text/javascript`; `/src/server/*`, `/src/app.ts`, `/src/client/../server/db.ts`
and `/src/client/%2e%2e/server/db.ts` all return `404`; `rg` over `src/shared`
finds no `Deno.`, `indexedDB`, `document.`, `window.`, `fetch(` or Turso
import (the only textual hit is the diagnostic code string `document.object`).
Longest module is `src/client/learning/flow.js` at 196 lines.

### Layout after the split

Browser (`public/js` entries, `src/client` modules):

- `public/js/app.js` boots the session, picks the surface from the URL, handles
  `popstate`, and routes between surfaces through a small `nav` object.
- `public/js/shelf.js`, `public/js/overview.js`, `public/js/learn.js` each
  render one surface and own that surface's actions.
- `src/client/learning/flow.js` is the flow controller: pure transitions over
  the checkpointed flow (`continueFromCard`, `submitAnswer`, `advance`,
  `enterCorrective`, `leaveCorrective`, `stepBack`, `startWrapUp`). Seeds and
  attempt IDs are parameters, so it is unit-tested in `tests/client/flow_test.ts`.
  It reuses the shared `advanceCheck` and `advanceWrapUp` rules instead of
  re-implementing them inline.
- `src/client/learning/views.js` renders Card, Question, feedback, corrective,
  summary, footer and rail as HTML strings. Class names and button labels are
  unchanged, so the e2e selectors still match.
- `src/client/learning/session.js` holds loaded evidence and appends learning
  and navigation events through `src/client/storage/repository.js`.
- `src/client/ui/controls.js` holds icon, button and event-binding helpers.

Server (`src/server/routes`):

- `route.ts` defines the `Route` contract (`method`, `URLPattern`, `handle`)
  and `dispatch`.
- `pages.ts`, `discovery.ts`, `lessons.ts`, `assets.ts` each export a function
  returning routes. `src/app.ts` concatenates them in the original order and
  keeps only the 404/500 mapping.
- `http.ts` holds `json`, `html`, `problem` and `jsonBody`; `dependencies.ts`
  holds the `Dependencies` interface bootstrap fills in.

### Decisions

- **Duplicated browser copies removed.** `public/js/{evaluate,progress,shuffle,
  checkpoint,repository}.js` were byte-identical copies of `src/shared/learning`
  and `src/client/storage`. The ticket asks the browser to use the repositories
  already under the client storage boundary, so the asset route now serves
  `src/client` and `src/shared` under `/src/client/` and `/src/shared/`. Entry
  modules import them with relative paths, which resolve the same way for
  `deno check` and in the browser, so the `/js/` import-map entry in `deno.json`
  became dead and was removed. `src/server` is not served.
- **`deno.json` changes were kept minimal:** `check` now includes
  `src/client/**/*.js` (it was unchecked before) and `test` includes
  `tests/client`. Nothing else changed.
- **Shared and storage modules were also reformatted** to one statement per
  line, even though they were not split, because the ticket flags the dense
  formatting as a review and merge hazard and ticket 02 edits those files next.
  Behaviour is unchanged and the existing shared tests cover them.
- **Two small hard-coded strings became derived:** shelf meta
  (`3 concepts · 9 questions`) and overview fact (`3 concepts`) now read counts
  from the lesson. The demo fixture yields the same text. The Wrap-up position
  `conceptIndex` uses `concepts.length - 1` instead of the literal `2`. The
  summary sentence "all three concepts" is unchanged.
- **`docs/architecture.md`** gained one paragraph describing the entry modules,
  served paths and route groups so tickets 02, 06 and 07 can find them.
- The unused draft `src/client/learning/flow.js` from the baseline was replaced
  rather than kept beside a second controller.

### Not done

Nothing in scope was left out. `public/js/globals.d.ts` is kept as is; it is
not part of `deno check` globs and `app.js` still casts `window` explicitly.
