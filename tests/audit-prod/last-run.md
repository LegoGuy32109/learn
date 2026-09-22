## Deployed phone experience

367 passed, 12 failed, 15 observations

### Failed

- hsts · Strict-Transport-Security is present on the shell
  ```
  no strict-transport-security header
  expect(received).toBeTruthy()
  Received: null
  ```
- hsts · Strict-Transport-Security is present on an API response
  ```
  no strict-transport-security header
  expect(received).toBeTruthy()
  Received: null
  ```
- content types · /sw.js is served as text/javascript with the build hash substituted
  ```
  {"type":"about:blank","title":"Not found","status":404,"detail":"No such file or directory (os error 2): readfile '/app/src/src/client/pwa/sw.js'"}
  expect(received).toBe(expected) // Object.is equality
  Expected: 200
  Received: 404
  ```
- worker · the service worker registers and controls the page after the first visit
  ```
  no registration; GET /sw.js answered 404: {"type":"about:blank","title":"Not found","status":404,"detail":"No such file or directory (os error 2): readfile '/app/src/src/client/pwa/sw.js'"}
  expect(received).toBe(expected) // Object.is equality
  Expected: true
  Received: false
  ```
- worker · one versioned shell cache holds the shell and no /api/ path
  ```
  caches: []
  expect(received).toBe(expected) // Object.is equality
  Expected: 1
  Received: 0
  ```
- offline · after one visit the start URL opens the shelf with the network off
  ```
  expect(received).toBe(expected) // Object.is equality
  Expected: "shell rendered offline"
  Received: "reload offline failed: page.reload: net::ERR_INTERNET_DISCONNECTED"
  ```
- offline · reloading the learning URL with the network off shows the cached overview
  ```
  expect(received).toBe(expected) // Object.is equality
  Expected: "ok"
  Received: "page.reload: net::ERR_INTERNET_DISCONNECTED"
  ```
- reload · overview after Back from first Card · surface comes back
  ```
  expect(received).toEqual(expected) // deep equality
  - Expected  -  9
  + Received  + 14
    Object {
      "belief": null,
  -   "cardHeading": null,
  +   "cardHeading": "A fresh response can be reused",
      "controls": Array [
  ```
- first step · reload after Back-to-overview shows the overview (recovering)
  ```
  Reload landed on https://learn-joshhale.legoguy32109.deno.net/learn/bcfb3097-3e0d-401d-bcd0-41f06e6f7724
  ```
- first step · browser Back leaves the URL at the shelf path
  ```
  expect(received).toBe(expected) // Object.is equality
  Expected: "/"
  Received: "/learn/bcfb3097-3e0d-401d-bcd0-41f06e6f7724"
  ```
- reload · shelf after browser Back from first Card · surface comes back
  ```
  expect(received).toEqual(expected) // deep equality
  - Expected  -  7
  + Received  + 13
    Object {
      "belief": null,
  -   "cardHeading": null,
  +   "cardHeading": "A fresh response can be reused",
      "controls": Array [
  ```
- listeners · the browser logged no failed service-worker script fetch
  ```
  38 page loads logged: error: A bad HTTP response code (404) was received when fetching the script.
  expect(received).toBe(expected) // Object.is equality
  Expected: 0
  Received: 38
  ```

### Observations

- token source: The owner token came from the .env.prod file.
- header · content-security-policy: absent on the shell (not required by the ticket)
- header · x-content-type-options: absent on the shell (not required by the ticket)
- header · referrer-policy: absent on the shell (not required by the ticket)
- header · x-frame-options: absent on the shell (not required by the ticket)
- header · permissions-policy: absent on the shell (not required by the ticket)
- content types · validator declarations: 200 text/plain; charset=utf-8 (text/plain is what the asset route gives .ts files)
- manifest · Page.getInstallabilityErrors: [] (headless Chromium reports an empty list for every page, so this proves nothing on its own)
- wrap-up retry: The missed Concept came back as Wrap-up Question 4 of 4, asked with the same Question.
- Learned summary line: The Learned summary shows ["Concepts learned\n3 of 3"]; a count, never a score.
- drill option order · Validators and conditional requests: 2 distinct option order(s) across this Concept's MCQs in one run.
- drill option order · Cache directives and revalidation: 2 distinct option order(s) across this Concept's MCQs in one run.
- drill option order · Freshness and age: 2 distinct option order(s) across this Concept's MCQs in one run.
- learning loop: 308 walk checks passed and 4 failed against production; the walk is the ticket 12 script with the production lesson path.
- console: 38 messages were the failed /sw.js fetch (see the worker checks); 1 came from deliberately reopening the used invite (410).

### Passed

- https · plain http redirects to https
  GET http://learn-joshhale.legoguy32109.deno.net/ -> 301
  location: https://learn-joshhale.legoguy32109.deno.net/
- https · the shell is served over HTTPS with the revision header
  GET / -> 200
  content-type: text/html; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- content types · capability document is application/json with the v1 contract
  GET /api/v1/capabilities -> 200
  content-type: application/json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- content types · well-known capability document is the same JSON
  GET /.well-known/learn-joshhale.json -> 200
  content-type: application/json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- content types · validator is text/javascript and exports resolveLesson
  GET /tools/lesson-validator.js -> 200
  content-type: text/javascript; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- content types · lesson schema is application/json draft 2020-12
  GET /api/v1/schemas/lesson/v1 -> 200
  content-type: application/json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- content types · OpenAPI document is application/json and names this origin
  GET /openapi.json -> 200
  content-type: application/json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- content types · manifest is application/manifest+json
  GET /manifest.webmanifest -> 200
  content-type: application/manifest+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- cors · /api/v1/capabilities with a foreign Origin gets no wildcard or reflected Access-Control-Allow-Origin
  GET /api/v1/capabilities -> 200
  content-type: application/json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- cors · /api/v1/shelf with a foreign Origin gets no wildcard or reflected Access-Control-Allow-Origin
  GET /api/v1/shelf -> 200
  content-type: application/json; charset=utf-8
  cache-control: private, no-store
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=not-cacheable
  age: 0
- cors · /api/v1/session with a foreign Origin gets no wildcard or reflected Access-Control-Allow-Origin
  GET /api/v1/session -> 200
  content-type: application/json; charset=utf-8
  cache-control: private, no-store
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=not-cacheable
  age: 0
- cors · /openapi.json with a foreign Origin gets no wildcard or reflected Access-Control-Allow-Origin
  GET /openapi.json -> 200
  content-type: application/json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- cors · a preflight from a foreign origin is not granted
  OPTIONS /api/v1/shelf -> 404
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=method
- csrf · a passkey ceremony started from another site is refused with 403
  POST /api/v1/passkeys/authentication-options -> 403
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=method
- passkeys · authentication options name this host as the relying party
  POST /api/v1/passkeys/authentication-options -> 200
  content-type: application/json; charset=utf-8
  cache-control: private, no-store
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=method
- not served · /.env answers 404
  GET /.env -> 404
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- not served · /.env.prod answers 404
  GET /.env.prod -> 404
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- not served · /deno.json answers 404
  GET /deno.json -> 404
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- not served · /main.ts answers 404
  GET /main.ts -> 404
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- not served · /src/server/auth.ts answers 404
  GET /src/server/auth.ts -> 404
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- not served · /src/server/db.ts answers 404
  GET /src/server/db.ts -> 404
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- not served · /migrations/001_initial.sql answers 404
  GET /migrations/001_initial.sql -> 404
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- not served · /tests/audit/last-run.md answers 404
  GET /tests/audit/last-run.md -> 404
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- auth · the shelf without a credential is a 401 problem document, not a page or a trace
  GET /api/v1/shelf -> 401
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=not-cacheable
  age: 0
- auth · an invalid personal token cannot mint an invite (401)
  POST /api/v1/sign-in-invites -> 401
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=method
- auth · the owner token lists the shelf and the read is private, no-store
  GET /api/v1/shelf -> 200
  content-type: application/json; charset=utf-8
  cache-control: private, no-store
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=not-cacheable
  age: 0
- errors · an unknown route is a 404 problem document without a stack trace
  GET /api/v1/nothing-here -> 404
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- invite · an unknown invite link is a plain 404 page, not a trace
  GET /sign-in/not-a-real-invite-token -> 404
  content-type: text/html; charset=utf-8
  cache-control: private, no-store
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=not-cacheable
  age: 0
- manifest · Chromium parses the manifest with no errors: name, standalone, start URL, theme colour, 192 and 512 icons
  Page.getAppManifest: {"url":"https://learn-joshhale.legoguy32109.deno.net/manifest.webmanifest","errors":[],"name":"learn","display":"kStandalone","startUrl":"https://learn-joshhale.legoguy32109.deno.net/","icons":["192x192","512x512","512x512"]}
- manifest · /icons/icon-192.png is served as image/png
  GET /icons/icon-192.png -> 200
  content-type: image/png
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- manifest · /icons/icon-512.png is served as image/png
  GET /icons/icon-512.png -> 200
  content-type: image/png
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- manifest · /icons/icon-512-maskable.png is served as image/png
  GET /icons/icon-512-maskable.png -> 200
  content-type: image/png
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- manifest · /icons/apple-touch-icon-180.png is served as image/png
  GET /icons/apple-touch-icon-180.png -> 200
  content-type: image/png
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=bypass; detail=zero-ttl
  age: 0
- worker · an /api/ response is never stored in or served from the worker cache
  second GET /api/v1/session: {"status":200,"age":"0","cacheStatus":"deno; fwd=bypass; detail=not-cacheable","cacheControl":"private, no-store"}; /api/ entries in caches: 0 of 0
- invite · deno task invite:mint pointed at production returns a ten-minute link
  invite expires in 600 s (link withheld)
- invite · the invite page opens for Josh's account with one Register a passkey button
  GET /sign-in/c-FmdTp… -> 200; invite names "Josh Hale"; screenshot: tests/audit-prod/screenshots/01-invite-page.jpg
- passkey · registering with the platform authenticator lands on the shelf signed in
  screenshot: tests/audit-prod/screenshots/02-shelf-signed-in-after-registration.jpg
- cookie · learn_session is HttpOnly, Secure, SameSite=Lax, Path=/, host-only and expires in about 30 days
  Set-Cookie: learn_session=[redacted]; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure
  browser sees: httpOnly=true secure=true sameSite=Lax path=/ domain=learn-joshhale.legoguy32109.deno.net lifetime=30.0 days
- cookie · the Set-Cookie header itself carries HttpOnly, Secure and SameSite=Lax
  Set-Cookie: learn_session=[redacted]; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure
- passkey · sign out shows Guest and clears the cookie; Sign in with a passkey signs back in
  sign count after sign-in: 2; screenshot: tests/audit-prod/screenshots/03-shelf-signed-in-with-passkey.jpg
- invite · opening the used invite again is a plain 410 page saying it was already used
  GET /sign-in/c-FmdTp… -> 410; screenshot: tests/audit-prod/screenshots/04-invite-already-used.jpg
- invite · registration options for the used invite are refused with a 410 problem document
  POST /api/v1/passkeys/registration-options -> 410
  content-type: application/problem+json; charset=utf-8
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=method
- session · the session survives a context restart: the reopened app is still signed in
  GET /api/v1/session -> {"signedIn":true,"displayName":"Josh Hale"}; screenshot: tests/audit-prod/screenshots/05-shelf-after-restart.jpg
- shelf · the owner token creates a draft whose title starts with audit-
  POST /api/v1/lessons -> 201
  content-type: application/json; charset=utf-8
  location: /api/v1/lessons/42dc71e5-4e44-4f09-8fe3-71477edd70c0/revisions/87076213-46ab-4d3e-9bd8-d65073f5d7f9
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=method
  lessonId 42dc71e5-4e44-4f09-8fe3-71477edd70c0
  revisionId 87076213-46ab-4d3e-9bd8-d65073f5d7f9
- shelf · after a refresh the new draft is first on the shelf, Not started, not Outdated
  screenshot: tests/audit-prod/screenshots/06-shelf-with-audit-draft.jpg
- shelf · the Refresh shelf control re-reads the server in place
  Refresh shelf tapped; the draft stayed first
- shelf · opening the draft shows its overview at the learning URL and caches the revision in IndexedDB
  IndexedDB lessons has 87076213-46ab-4d3e-9bd8-d65073f5d7f9; progress_streams pins epoch 0; screenshot: tests/audit-prod/screenshots/07-audit-draft-overview.jpg
- offline · with the network off the first Concept completes from IndexedDB
  4 learning events recorded offline against revision 1; screenshot: tests/audit-prod/screenshots/08-concept-2-reached-offline.jpg
- shelf · the owner token creates a second revision of the audit lesson
  POST /api/v1/lessons/42dc71e5-4e44-4f09-8fe3-71477edd70c0/revisions -> 201
  content-type: application/json; charset=utf-8
  location: /api/v1/lessons/42dc71e5-4e44-4f09-8fe3-71477edd70c0/revisions/b049d8b1-d0dd-4bdb-86ed-1e4dd8637ebb
  x-learn-revision: p6jad39tqqge
  cache-status: deno; fwd=method
  revisionId b049d8b1-d0dd-4bdb-86ed-1e4dd8637ebb
- outdated · the shelf marks the lesson In progress and Outdated once a newer revision exists
  screenshot: tests/audit-prod/screenshots/09-shelf-outdated.jpg
- outdated · Resume this revision keeps the old revision and its checkpoint
  resumed at Card 1 of Concept 2 on revision 1; stream still pinned to revision 1, epoch 0
- discard · Discard asks for confirmation, and Keep my progress changes nothing
  screenshot: tests/audit-prod/screenshots/10-discard-confirmation.jpg
- discard · confirming advances the epoch and opens the new revision from Not started, keeping the old evidence
  stream now revision 2, epoch 1; 4 old events kept; screenshot: tests/audit-prod/screenshots/11-new-revision-overview.jpg
- discard · back on the shelf the lesson shows the new title, Not started, without Outdated
  screenshot: tests/audit-prod/screenshots/12-shelf-after-discard.jpg
- guest · the learning URL of an owned lesson asks a guest to sign in and inlines only the featured demo
  inlined lesson for the guest: "How browser HTTP caching works"; screenshot: tests/audit-prod/screenshots/13-guest-sign-in-prompt.jpg
- learning · the shell inlines the published demo lesson with the fixture's content
  demo lessonId bcfb3097-3e0d-401d-bcd0-41f06e6f7724, revisionId b6604cc4-cb43-40e6-be8f-b973250af281
- shelf · fresh browser shows the demo lesson Not started
- forbidden · shelf fresh · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · shelf fresh · says Question, not Item
- visual · shelf fresh · panel is not blank
- visual · shelf fresh · every control is at least 44px on its shortest side
- visual · shelf fresh · no horizontal overflow at 390px
- visual · shelf fresh · bottom safe-area padding on page shelf
- scheme · shelf fresh · light and dark render different backgrounds
- reload · shelf fresh · surface comes back
- overview · title, assumed knowledge, Concept count, state and Start lesson
- forbidden · overview fresh · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · overview fresh · says Question, not Item
- visual · overview fresh · panel is not blank
- visual · overview fresh · every control is at least 44px on its shortest side
- visual · overview fresh · no horizontal overflow at 390px
- visual · overview fresh · bottom safe-area padding on page overview
- scheme · overview fresh · light and dark render different backgrounds
- reload · overview fresh · surface comes back
- reload · overview fresh · checkpoint rebuilt from events
- card · Start lesson opens Card 1 of Concept 1 at the stable learning URL
- forbidden · card 1 of concept 1 · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · card 1 of concept 1 · says Question, not Item
- visual · card 1 of concept 1 · panel is not blank
- visual · card 1 of concept 1 · every control is at least 44px on its shortest side
- visual · card 1 of concept 1 · no horizontal overflow at 390px
- visual · card 1 of concept 1 · bottom safe-area padding on shell
- scheme · card 1 of concept 1 · light and dark render different backgrounds
- reload · card 1 of concept 1 · surface comes back
- reload · card 1 of concept 1 · checkpoint rebuilt from events
- first step · square Back returns to the overview with Resume
- forbidden · overview after Back from first Card · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · overview after Back from first Card · says Question, not Item
- visual · overview after Back from first Card · panel is not blank
- visual · overview after Back from first Card · every control is at least 44px on its shortest side
- visual · overview after Back from first Card · no horizontal overflow at 390px
- visual · overview after Back from first Card · bottom safe-area padding on page overview
- reload · overview after Back from first Card · checkpoint rebuilt from events
- first step · Resume from the overview reopens Card 1
- first step · close returns to the shelf showing In progress
- forbidden · shelf in progress after close · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · shelf in progress after close · says Question, not Item
- visual · shelf in progress after close · panel is not blank
- visual · shelf in progress after close · every control is at least 44px on its shortest side
- visual · shelf in progress after close · no horizontal overflow at 390px
- visual · shelf in progress after close · bottom safe-area padding on page shelf
- reload · shelf in progress after close · surface comes back
- first step · browser Back returns to the shelf
- forbidden · shelf after browser Back from first Card · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · shelf after browser Back from first Card · says Question, not Item
- visual · shelf after browser Back from first Card · panel is not blank
- visual · shelf after browser Back from first Card · every control is at least 44px on its shortest side
- visual · shelf after browser Back from first Card · no horizontal overflow at 390px
- visual · shelf after browser Back from first Card · bottom safe-area padding on page shelf
- first step · learner is back on Card 1 after the Back probes
- card · Continue marks Card 1 Seen exactly once and shows Card 2
- forbidden · card 2 of concept 1 · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · card 2 of concept 1 · says Question, not Item
- visual · card 2 of concept 1 · panel is not blank
- visual · card 2 of concept 1 · every control is at least 44px on its shortest side
- visual · card 2 of concept 1 · no horizontal overflow at 390px
- visual · card 2 of concept 1 · bottom safe-area padding on shell
- reload · card 2 of concept 1 · surface comes back
- reload · card 2 of concept 1 · checkpoint rebuilt from events
- card · Back inspects Card 1 without recording evidence
- card · Back inspection does not replace the canonical checkpoint
- reload · inspecting Card 1 resumes at the canonical Card 2 · surface comes back
- reload · inspecting Card 1 resumes at the canonical Card 2 · checkpoint rebuilt from events
- card · Continue on an already Seen Card records no duplicate card_seen
- check 1 · the Check opens on an unanswered drawable Question of Concept 1
- check 1 question · exactly three shared options, I don't know present, field blank
- forbidden · check 1 unanswered Question · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 1 unanswered Question · says Question, not Item
- visual · check 1 unanswered Question · panel is not blank
- visual · check 1 unanswered Question · every control is at least 44px on its shortest side
- visual · check 1 unanswered Question · no horizontal overflow at 390px
- visual · check 1 unanswered Question · I don't know is contained away from the screen edge
- visual · check 1 unanswered Question · bottom safe-area padding on shell
- scheme · check 1 unanswered Question · light and dark render different backgrounds
- reload · check 1 unanswered Question · surface comes back
- reload · check 1 unanswered Question · checkpoint rebuilt from events
- check 1 · an unanswered short-answer draft reloads blank
- check 1 wrong · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Try another from this concept
- forbidden · check 1 wrong feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 1 wrong feedback · says Question, not Item
- visual · check 1 wrong feedback · panel is not blank
- visual · check 1 wrong feedback · every control is at least 44px on its shortest side
- visual · check 1 wrong feedback · no horizontal overflow at 390px
- visual · check 1 wrong feedback · bottom safe-area padding on shell
- scheme · check 1 wrong feedback · light and dark render different backgrounds
- reload · check 1 wrong feedback · surface comes back
- reload · check 1 wrong feedback · checkpoint rebuilt from events
- check 1 · Review opens the correcting Card as a detour with Return to questions
- forbidden · check 1 corrective Card · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 1 corrective Card · says Question, not Item
- visual · check 1 corrective Card · panel is not blank
- visual · check 1 corrective Card · every control is at least 44px on its shortest side
- visual · check 1 corrective Card · no horizontal overflow at 390px
- visual · check 1 corrective Card · bottom safe-area padding on shell
- scheme · check 1 corrective Card · light and dark render different backgrounds
- reload · check 1 corrective Card · surface comes back
- reload · check 1 corrective Card · checkpoint rebuilt from events
- check 1 · Return restores the same feedback and the detour recorded no event
- check 1 · Try another asks an unseen Question from the same Concept
- check 1 retry question · exactly three shared options, I don't know present, field blank
- forbidden · check 1 retry Question · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 1 retry Question · says Question, not Item
- visual · check 1 retry Question · panel is not blank
- visual · check 1 retry Question · every control is at least 44px on its shortest side
- visual · check 1 retry Question · no horizontal overflow at 390px
- visual · check 1 retry Question · I don't know is contained away from the screen edge
- visual · check 1 retry Question · bottom safe-area padding on shell
- reload · check 1 retry Question · surface comes back
- reload · check 1 retry Question · checkpoint rebuilt from events
- check 1 · a correct answer shows Correct with the key's feedback and Continue, never auto-advancing
- forbidden · check 1 correct feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 1 correct feedback · says Question, not Item
- visual · check 1 correct feedback · panel is not blank
- visual · check 1 correct feedback · every control is at least 44px on its shortest side
- visual · check 1 correct feedback · no horizontal overflow at 390px
- visual · check 1 correct feedback · bottom safe-area padding on shell
- scheme · check 1 correct feedback · light and dark render different backgrounds
- reload · check 1 correct feedback · surface comes back
- reload · check 1 correct feedback · checkpoint rebuilt from events
- concept 2 · Continue after the Check opens Card 1 of Concept 2
- check 2 · the Check opens for Concept 2
- check 2 question · exactly three shared options, I don't know present, field blank
- check 2 · I don't know shows the correct answer, a link to the correcting Card and ends the Check
- check 2 · I don't know carries no penalty: progress state is unchanged
- forbidden · check 2 I don't know feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 2 I don't know feedback · says Question, not Item
- visual · check 2 I don't know feedback · panel is not blank
- visual · check 2 I don't know feedback · every control is at least 44px on its shortest side
- visual · check 2 I don't know feedback · no horizontal overflow at 390px
- visual · check 2 I don't know feedback · bottom safe-area padding on shell
- scheme · check 2 I don't know feedback · light and dark render different backgrounds
- reload · check 2 I don't know feedback · surface comes back
- reload · check 2 I don't know feedback · checkpoint rebuilt from events
- concept 3 · I don't know then Continue opens Card 1 of Concept 3
- check 3 question 1 · exactly three shared options, I don't know present, field blank
- check 3 wrong 1 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Try another from this concept
- check 3 question 2 · exactly three shared options, I don't know present, field blank
- check 3 wrong 2 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Try another from this concept
- forbidden · check 3 second wrong feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 3 second wrong feedback · says Question, not Item
- visual · check 3 second wrong feedback · panel is not blank
- visual · check 3 second wrong feedback · every control is at least 44px on its shortest side
- visual · check 3 second wrong feedback · no horizontal overflow at 390px
- visual · check 3 second wrong feedback · bottom safe-area padding on shell
- reload · check 3 second wrong feedback · surface comes back
- reload · check 3 second wrong feedback · checkpoint rebuilt from events
- check 3 question 3 · exactly three shared options, I don't know present, field blank
- check 3 wrong 3 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Continue
- check 3 · every wrong answer was re-asked from an unseen Question until the Pool was exhausted
- wrap-up · opens with one Question drawn from the reserved Questions the Checks never showed
- wrap-up question 1 · exactly three shared options, I don't know present, field blank
- forbidden · wrap-up Question 1 · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · wrap-up Question 1 · says Question, not Item
- visual · wrap-up Question 1 · panel is not blank
- visual · wrap-up Question 1 · every control is at least 44px on its shortest side
- visual · wrap-up Question 1 · no horizontal overflow at 390px
- visual · wrap-up Question 1 · I don't know is contained away from the screen edge
- visual · wrap-up Question 1 · bottom safe-area padding on shell
- scheme · wrap-up Question 1 · light and dark render different backgrounds
- reload · wrap-up Question 1 · surface comes back
- reload · wrap-up Question 1 · checkpoint rebuilt from events
- wrap-up · shelf shows Seen before any Wrap-up answer, and Resume returns to the same Question
- wrap-up · a wrong answer shows feedback and Continue, and does not award Learned
- forbidden · wrap-up wrong feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · wrap-up wrong feedback · says Question, not Item
- visual · wrap-up wrong feedback · panel is not blank
- visual · wrap-up wrong feedback · every control is at least 44px on its shortest side
- visual · wrap-up wrong feedback · no horizontal overflow at 390px
- visual · wrap-up wrong feedback · bottom safe-area padding on shell
- scheme · wrap-up wrong feedback · light and dark render different backgrounds
- reload · wrap-up wrong feedback · surface comes back
- reload · wrap-up wrong feedback · checkpoint rebuilt from events
- wrap-up · Question 2 is a reserved Question the Checks never showed
- forbidden · wrap-up Question 2 · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · wrap-up Question 2 · says Question, not Item
- visual · wrap-up Question 2 · panel is not blank
- visual · wrap-up Question 2 · every control is at least 44px on its shortest side
- visual · wrap-up Question 2 · no horizontal overflow at 390px
- visual · wrap-up Question 2 · I don't know is contained away from the screen edge
- visual · wrap-up Question 2 · bottom safe-area padding on shell
- reload · wrap-up Question 2 · surface comes back
- reload · wrap-up Question 2 · checkpoint rebuilt from events
- wrap-up · correct answer 2 marks its Concept Learned
- wrap-up · Question 3 is a reserved Question the Checks never showed
- forbidden · wrap-up retried or third Question · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · wrap-up retried or third Question · says Question, not Item
- visual · wrap-up retried or third Question · panel is not blank
- visual · wrap-up retried or third Question · every control is at least 44px on its shortest side
- visual · wrap-up retried or third Question · no horizontal overflow at 390px
- visual · wrap-up retried or third Question · I don't know is contained away from the screen edge
- visual · wrap-up retried or third Question · bottom safe-area padding on shell
- reload · wrap-up retried or third Question · surface comes back
- reload · wrap-up retried or third Question · checkpoint rebuilt from events
- wrap-up · correct answer 3 marks its Concept Learned
- wrap-up · Question 4 is a reserved Question the Checks never showed
- wrap-up · correct answer 4 marks its Concept Learned
- forbidden · wrap-up final correct feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · wrap-up final correct feedback · says Question, not Item
- visual · wrap-up final correct feedback · panel is not blank
- visual · wrap-up final correct feedback · every control is at least 44px on its shortest side
- visual · wrap-up final correct feedback · no horizontal overflow at 390px
- visual · wrap-up final correct feedback · bottom safe-area padding on shell
- reload · wrap-up final correct feedback · surface comes back
- reload · wrap-up final correct feedback · checkpoint rebuilt from events
- wrap-up · one Question per Concept, and the missed Concept returned once more, later in a shuffled queue
- learned · the summary reads Learned and every Concept is Learned
- forbidden · Learned summary · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · Learned summary · says Question, not Item
- visual · Learned summary · panel is not blank
- visual · Learned summary · every control is at least 44px on its shortest side
- visual · Learned summary · no horizontal overflow at 390px
- visual · Learned summary · bottom safe-area padding on shell
- scheme · Learned summary · light and dark render different backgrounds
- reload · Learned summary · surface comes back
- reload · Learned summary · checkpoint rebuilt from events
- learned · shelf shows Learned
- forbidden · shelf Learned · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · shelf Learned · says Question, not Item
- visual · shelf Learned · panel is not blank
- visual · shelf Learned · every control is at least 44px on its shortest side
- visual · shelf Learned · no horizontal overflow at 390px
- visual · shelf Learned · bottom safe-area padding on page shelf
- scheme · shelf Learned · light and dark render different backgrounds
- reload · shelf Learned · surface comes back
- drill after Learned · closing an unfinished drill leaves Resume every question on the overview
- drill after Learned · learning evidence, navigation evidence and the shelf state are byte-identical
- drill · starts at Question 1 of every Question on the drill URL
- drill question 1 · exactly three shared options, I don't know present, field blank
- forbidden · drill Question 1 · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill Question 1 · says Question, not Item
- visual · drill Question 1 · panel is not blank
- visual · drill Question 1 · every control is at least 44px on its shortest side
- visual · drill Question 1 · no horizontal overflow at 390px
- visual · drill Question 1 · I don't know is contained away from the screen edge
- visual · drill Question 1 · bottom safe-area padding on shell drill
- scheme · drill Question 1 · light and dark render different backgrounds
- reload · drill Question 1 · surface comes back
- reload · drill Question 1 · checkpoint rebuilt from events
- drill · correct at 1 shows Correct and Continue
- drill · correct at 2 shows Correct and Continue
- drill wrong at 3 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Continue
- forbidden · drill wrong feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill wrong feedback · says Question, not Item
- visual · drill wrong feedback · panel is not blank
- visual · drill wrong feedback · every control is at least 44px on its shortest side
- visual · drill wrong feedback · no horizontal overflow at 390px
- visual · drill wrong feedback · bottom safe-area padding on shell drill
- scheme · drill wrong feedback · light and dark render different backgrounds
- reload · drill wrong feedback · surface comes back
- reload · drill wrong feedback · checkpoint rebuilt from events
- drill · Review opens the correcting Card with Return to questions
- forbidden · drill corrective Card · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill corrective Card · says Question, not Item
- visual · drill corrective Card · panel is not blank
- visual · drill corrective Card · every control is at least 44px on its shortest side
- visual · drill corrective Card · no horizontal overflow at 390px
- visual · drill corrective Card · bottom safe-area padding on shell drill
- scheme · drill corrective Card · light and dark render different backgrounds
- reload · drill corrective Card · surface comes back
- reload · drill corrective Card · checkpoint rebuilt from events
- drill · square Back on the correcting Card returns to the feedback
- drill · I don't know at 4 shows the answer, the correcting Card and Continue
- drill · correct at 5 shows Correct and Continue
- drill wrong at 6 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Continue
- forbidden · drill feedback halfway · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill feedback halfway · says Question, not Item
- visual · drill feedback halfway · panel is not blank
- visual · drill feedback halfway · every control is at least 44px on its shortest side
- visual · drill feedback halfway · no horizontal overflow at 390px
- visual · drill feedback halfway · bottom safe-area padding on shell drill
- reload · drill feedback halfway · surface comes back
- reload · drill feedback halfway · checkpoint rebuilt from events
- forbidden · drill Question after halfway reload · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill Question after halfway reload · says Question, not Item
- visual · drill Question after halfway reload · panel is not blank
- visual · drill Question after halfway reload · every control is at least 44px on its shortest side
- visual · drill Question after halfway reload · no horizontal overflow at 390px
- visual · drill Question after halfway reload · I don't know is contained away from the screen edge
- visual · drill Question after halfway reload · bottom safe-area padding on shell drill
- reload · drill Question after halfway reload · surface comes back
- reload · drill Question after halfway reload · checkpoint rebuilt from events
- drill · browser Back returns to the overview with Resume every question
- drill · overview still says Not started while a drill is open
- drill · resuming returns to the same unanswered Question and position
- drill · correct at 7 shows Correct and Continue
- drill · I don't know at 8 shows the answer, the correcting Card and Continue
- drill wrong at 9 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Continue
- drill · correct at 10 shows Correct and Continue
- drill · correct at 11 shows Correct and Continue
- drill · I don't know at 12 shows the answer, the correcting Card and Continue
- drill · every Question in every Pool was asked exactly once, reserved ones included
- drill · summary lists each Concept and repeats that drill does not earn Learned, with no score or percentage
- forbidden · drill summary · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill summary · says Question, not Item
- visual · drill summary · panel is not blank
- visual · drill summary · every control is at least 44px on its shortest side
- visual · drill summary · no horizontal overflow at 390px
- visual · drill summary · bottom safe-area padding on shell drill
- scheme · drill summary · light and dark render different backgrounds
- reload · drill summary · surface comes back
- reload · drill summary · checkpoint rebuilt from events
- drill · leaving the summary closes the run and the overview offers Every question and Start lesson
- drill · shelf still says Not started and the learning stores never changed
- drill · the drill stream holds one answer per Question and a closing null checkpoint
- secrets · no value from .env.prod and no token-shaped string appears in any response body
  276 bodies scanned (177 distinct requests)
- listeners · no pageerror during the whole run
- listeners · no console error or warning beyond the failed worker fetch and the deliberate 410

### Run

- Base URL: https://learn-joshhale.legoguy32109.deno.net
- Started: 2026-09-22T05:29:35.727Z
- Served by revision(s): p6jad39tqqge
- Response bodies scanned for secrets: 276

### Created on production (nothing was deleted)

- sign-in invite /sign-in/c-FmdTp… (consumed by this run's passkey registration)
- passkey credential oUe6z3hHtDR7… on Josh's production account (from this run's virtual authenticator; it cannot sign in from any real device)
- lesson 42dc71e5-4e44-4f09-8fe3-71477edd70c0 "audit-2026-09-22T05-29-51" revision 1 87076213-46ab-4d3e-9bd8-d65073f5d7f9
- lesson 42dc71e5-4e44-4f09-8fe3-71477edd70c0 "audit-2026-09-22T05-29-51 (revision 2)" revision 2 b049d8b1-d0dd-4bdb-86ed-1e4dd8637ebb

