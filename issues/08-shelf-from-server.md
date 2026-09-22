# 08 — Mine shelf lists the account's lessons and caches them on open

**What to build:** An agent creates a lesson through the API on the laptop.
Josh pulls down on his phone's shelf and the lesson appears as Not started. He
taps it, the overview loads, and the revision is now in IndexedDB so the whole
lesson works offline from then on. The stable learning URL that the API and
plugin return opens that lesson's overview for the signed-in owner.

The shelf shows every lesson the account owns, newest first, with its progress
state derived from local events: Not started, In progress, Seen, Learned. A
guest sees only lessons already cached on the device. Opening a lesson stores
its Lesson Revision behind the existing local lesson repository, keyed by
revision ID. Progress stays pinned to that revision.

When the server has a newer revision than the one a learner has progress on,
the shelf card shows an Outdated mark. Opening it offers two actions: continue
the old revision, or discard progress and start the new one. Discarding is an
explicit confirmation and advances the progress epoch, as
`docs/domain-model.md` requires. Nothing moves progress across revisions.

Add the read routes the shelf needs. They accept the browser session cookie
from ticket 07 as well as a bearer token.

**Demo path:** Create a draft with curl and the owner token. Refresh the phone
shelf and see it. Open it, then go offline and complete the first Concept.
Create a second revision with curl. Come back online and see Outdated, keep
the old revision, then discard and start the new one.

**Blocked by:** 02 — Lesson content follows the plugin model; 07 — Phone
sign-in with a passkey from a one-time invite link.

**Status:** done 4e0b8ca

- [x] The shelf lists the signed-in account's lessons from the server and
      merges them with locally cached revisions without duplicates.
- [x] Opening a lesson caches its revision. A phone-sized Playwright test then
      goes offline and completes a Concept.
- [x] The learning URL from the API opens the overview for the owner and shows
      a sign-in prompt for a guest who has not cached it.
- [x] A newer revision shows Outdated. Continuing keeps the old revision.
      Discarding requires confirmation, advances the epoch, and starts the new
      revision from Not started.
- [x] A guest with no network and no cached lessons sees an empty shelf with a
      short explanation, not an error.
- [x] `deno task check`, `deno task test`, `deno task test:db` and
      `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task test:db && deno task e2e
```

## Report

Implemented at `4e0b8ca` on branch `ticket/08`.

### Verification output

`deno task check && deno task test && deno task test:db && deno task e2e`
exited 0. Condensed (type-check `Check` lines omitted, no token printed):

```text
Task check  deno check main.ts src/app.ts public/js/*.js src/shared/**/*.js src/client/**/*.js src/server/**/*.ts scripts/*.ts && deno check --config deno.worker.json src/client/pwa/sw.js
Task test
running 12 tests from ./tests/client/flow_test.ts
running 6 tests from ./tests/client/shelf_model_test.ts
server lessons and cached revisions merge into one entry per Lesson, newest first ... ok
a guest sees only what this device cached, and evidence pins the revision it was recorded against ... ok
Outdated appears only when progress exists on an older revision than the server's newest ... ok
evidence from another epoch or revision never counts ... ok
discarding advances the epoch and repins; opening pins at the current epoch ... ok
an empty device and no server answer is an empty shelf, not an error ... ok
running 7 tests from ./tests/client/sw_routing_test.ts
running 7 tests from ./tests/server/api_test.ts
running 3 tests from ./tests/server/deploy_config_test.ts
running 9 tests from ./tests/server/passkey_test.ts
running 6 tests from ./tests/server/pwa_test.ts
running 12 tests from ./tests/server/resolver_test.ts
running 5 tests from ./tests/server/shelf_test.ts
the shelf needs an account: 401 for nobody, 403 for a token without lessons:read ... ok
the shelf lists the account's lessons newest first with each newest revision, by cookie or by bearer ... ok
a revision and a lesson's newest revision are readable with the cookie, and only by their owner ... ok
the learning URL inlines the owner's newest revision for the signed-in owner and the featured lesson for anyone else ... ok
the in-memory repository behaves like the database one: idempotent fingerprints and owned revisions ... ok
running 6 tests from ./tests/server/token_test.ts
running 2 tests from ./tests/server/validator_parity_test.ts
running 7 tests from ./tests/shared/learning_test.ts
ok | 82 passed | 0 failed (1s)
Task test:db
authenticated draft API persists idempotently in Turso ... ok
passkey sign-in in an ephemeral database ... ok
token lifecycle in an ephemeral database ... ok
ok | 3 passed (17 steps) | 0 failed (24s)
Task e2e
resume, corrective routing, and I don't know obey the flow contract ... ok
phone learner resumes and reaches Learned ... ok
phone registers a passkey from an invite, stays signed in across reloads, signs out and back in ... ok
a wrong option shows the belief and the clamped correcting Card, and survives reload ... ok
phone reopens a cached lesson offline and takes an update between Questions ... ok
phone shelf lists the account's lessons, caches on open, works offline, and handles an outdated revision ... ok
ok | 6 passed | 0 failed (10s)
```

### What was built

- **Read routes** (`src/server/routes/lessons.ts`): `GET /api/v1/shelf` lists
  the account's lessons newest first, each with its newest revision and
  Concept and Question counts, no content. `GET /api/v1/lessons/{id}` returns
  the newest owned revision. Every lesson `GET` now resolves the account
  through `currentAccount`, so the session cookie or a `lessons:read` bearer
  token works; writes still take a bearer token only. Reads answer
  `cache-control: private, no-store`.
- **Repository** (`src/server/repositories/lessons.ts`): `shelf()` and
  `latestRevision()` on the Turso adapter. `FixtureLessonRepository` became a
  real in-memory repository seeded with the demo as a published revision owned
  by the fixture account, so drafts and revisions can be created in
  database-free server and browser tests.
- **Page shell** (`src/server/routes/pages.ts`): `/learn/{lesson_id}` inlines
  that lesson's newest revision for its signed-in owner; everyone else still
  gets the featured lesson.
- **Storage** (`src/client/storage/repository.js`): IndexedDB version 2 adds
  `progress_streams` (one per Lesson: pinned `revisionId` and `epoch`);
  cached revisions record `cachedAt`. The upgrade only creates missing stores.
- **Session** (`src/client/learning/session.js`): scoped to one revision and
  epoch. Evidence for other revisions or epochs is filtered out
  (`evidenceFor`), new events carry the stream's epoch, and projections are
  keyed `progress:<revision>:<epoch>` / `checkpoint:<revision>:<epoch>`.
- **Shelf model** (`src/client/library/shelf-model.js`, pure): merges the
  server list with cached revisions into one entry per Lesson, newest first;
  pins each Lesson (stream, else evidence, else newest); derives progress;
  marks Outdated only when progress exists on an older revision; `discardTo`
  advances the epoch and repins. `remote.js` wraps the two fetches.
- **Surfaces**: `app.js` boots from the inlined lesson plus the shelf, opens
  `/learn/{id}` to the overview (or the checkpoint), caches a revision on
  open, and asks a guest to sign in when the lesson is not on the device.
  `shelf.js` renders cards with state and Outdated marks, a Refresh control
  for signed-in learners, an offline status line, and an empty state with a
  short explanation. `overview.js` offers "Resume this revision" or "Discard
  progress and start the new revision", and the discard is a two-step
  confirmation.
- Docs: `docs/api-v1.md` (shelf reads) and `docs/architecture.md` (streams).

### Decisions

- **Outdated needs progress.** An unstarted lesson quietly follows the server
  to the newest revision; nothing is lost, so nothing is asked.
- **Discard keeps the old evidence.** The stream's epoch advances and the pin
  moves; events under the old epoch stay in IndexedDB but are never read. No
  event is copied across revisions. The old projections are keyed by the old
  revision and epoch, so nothing collides.
- **The guest shelf still shows the featured demo online**, as the first
  milestone requires. Offline, the cached `/shell` carries a guest session, so
  the account panel reads Guest until the network returns; the cached lessons
  and progress are unaffected.
- **Refresh is a button plus a page reload.** A browser pull-to-refresh reloads
  the page, which refetches the shelf; the Refresh control does the same in
  place for standalone mode.
- **Legacy data.** Evidence recorded before streams existed pins the revision
  it was recorded against, so a phone that already started the demo keeps its
  place. The old unkeyed `checkpoint` projection is ignored and rebuilt from
  navigation events.
- **The e2e test injects the session cookie** issued by the server's own
  `sessions.issue`, since the passkey e2e already proves the ceremony. It runs
  against the in-memory repository, so `deno task e2e` stays database-free.
- **Bug fixed before commit:** my server test harness consumed a response body
  in an assertion message before parsing it. The reference `.notice` rule laid
  the overview notice out in two columns; `app.css` sets it to `display:block`.

### Not done

- The real-phone demo path (curl on the laptop, pull down on the phone) needs
  the deployed origin; the same path runs here in Playwright at 390x844.
- No change to `main.ts`, `deno.json` or migrations was needed.
