# Phone portal: ticket set

Goal: make learn.joshhale.me the phone version of the `quiz` Claude plugin.
An agent in any coding session authors a lesson from real work, the site
validates and stores it, and Josh learns it on his phone with the same
pedagogy the plugin fixes in its renderer.

The plugin is copied at `docs/reference/quiz-plugin-0.2.0/`. Its `SKILL.md`,
`references/authoring.md`, `references/lesson-schema.md`, `assets/renderer.html`
and `scripts/validate.mjs` are the source of the pedagogy rules. When a ticket
says "the plugin", it means that copy. The plugin will keep improving inside
this application; the copy is the starting point, not a contract.

## Decisions Josh made on 2026-09-21

These are settled. Do not reopen them in a ticket.

- `lesson/v1` changes to the plugin's content model. No lesson outside the
  demo exists, so breaking the current shape is fine.
- Production is approved: create `learn-prod` and the Deno Deploy project.
  Josh attaches `learn.joshhale.me` himself later.
- Phone sign-in is a one-time invite link plus a passkey. No public sign-up.
- Spaced review is deferred to a later stage. Its tickets live in `later/`.
- The agent plugin reads its bearer token from `LEARN_TOKEN`.
- The plugin is served from the site only, not from another marketplace.

## How to work a ticket

1. Start from the committed baseline on `main`. All of `deno task check`,
   `deno task test`, `deno task test:db` and `deno task e2e` pass there.
2. Take a ticket whose **Blocked by** tickets are all done. Work in your own Git
   worktree.
3. Read `AGENTS.md` and every document it names, then the ticket.
4. Build the whole vertical slice. Every ticket names what can be demoed when it
   is done. If you cannot demo it, the ticket is not done.
5. Run the ticket's verification commands. Paste their output in your report.
6. Update the ticket's checkboxes and set **Status** to `done`, with the commit
   SHA. The implementer, not the coordinator, updates the ticket.

Verification tickets never fix. They file each defect as a new ticket file in
this directory, numbered after the last one, with a reproduction.

Rules from `docs/implementation/README.md` apply: `001_initial.sql` is
immutable, never print an ignored env file, no publish API, no validation
bypass. `learn-prod` is created only by ticket 05.

## Order and edges

| # | Ticket | Blocked by | Kind |
| --- | --- | --- | --- |
| 01 | Split the browser app and server routes into domain modules | none | prefactor |
| 02 | Lesson content follows the plugin model, with the plugin's author-quality diagnostics and validator parity | 01 | implement |
| 03 | Complete JSON Schema, OpenAPI and diagnostic-code documentation | 02 | implement |
| 04 | Installable agent plugin served by the site | 03 | implement |
| 05 | Production deployment on Deno Deploy with learn-prod | none | implement |
| 06 | Installable PWA shell that reopens a cached lesson offline | 01 | implement |
| 07 | Phone sign-in with a passkey from a one-time invite link | 01 | implement |
| 08 | Mine shelf lists the account's lessons from the server and caches them on open | 02, 07 | implement |
| 09 | Every-question drill mode that never awards Learned | 02 | implement |
| 10 | Progress sync: server event union and checkpoint, client outbox and merge | 08 | implement |
| 11 | API-token lifecycle: mint, list, revoke, rotate, scope errors | none | implement |
| 12 | Verify the learning loop on a phone viewport | 02, 09 | verify |
| 13 | Verify the authoring contract and the plugin end to end | 03, 04 | verify |
| 14 | Verify the deployed phone experience | 05, 06, 07, 08 | verify |
| 15 | Verify cross-device sync | 10 | verify |
| 16 | The first authenticated request after a deploy answers 401 | none | defect |
| 17 | Reload and browser Back land on the learning shell instead of the surface on screen | 08 | defect |
| 18 | Shelf and overview have no bottom safe-area padding | none | defect |
| 19 | The overview's Back to shelf control is under 44px | none | defect |
| 20 | A double tap on the action after feedback skips an unseen Question | none | defect |
| 21 | The square Back control does nothing on Questions, feedback and the correcting Card | none | defect |
| 22 | The Wrap-up can re-ask a missed Concept immediately | none | defect |
| 23 | Every MCQ in an attempt shows the options in the same order | none | defect |
| 24 | Enter in the answer field does not submit the answer | none | defect |
| 17 | Reload and browser Back land on the learning shell instead of the surface on screen | none | defect |
| 18 | Shelf and overview have no bottom safe-area padding | none | defect |
| 19 | The overview's Back to shelf control is 29 pixels tall | none | defect |
| 20 | A double tap on the action after feedback skips an unseen Question | none | defect |
| 21 | The square Back control does nothing on Questions, feedback, the correcting Card and later first Cards | none | defect |
| 22 | The Wrap-up can re-ask a missed Concept immediately | none | defect |
| 23 | Every MCQ in an attempt shows the Concept's options in the same order | none | defect |
| 24 | Enter in the answer field does not submit the answer | none | defect |
| 25 | Production serves 404 for /sw.js, so nothing installs or works offline | none | defect |
| 26 | Production sends no Strict-Transport-Security header | none | defect |

The frontier at the start is 01, 05 and 11. After 01 lands, 02, 06 and 07
open. After 02 lands, 03, 09 and, with 07, 08 open.

## Later

`later/` holds spaced review and its audit. They are written and blocked on 08
and 10, but Josh deferred them. Do not start them in this stage.

## Left out on purpose

Publish to Library, Library Listings, tags, discovery, flags and reviews;
active-time tracking; browser UI for token management; public account creation.
Each is a designed boundary in `docs/architecture.md` and can be ticketed later.
