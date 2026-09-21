# Phone portal: ticket set

Goal: make learn.joshhale.me the phone version of the `quiz` Claude plugin.
An agent in any coding session authors a lesson from real work, the site
validates and stores it, and Josh learns it on his phone with the same
pedagogy the plugin fixes in its renderer. Later, the site schedules spaced
reviews so the lesson becomes Retained.

The plugin is copied at `docs/reference/quiz-plugin-0.2.0/`. Its `SKILL.md`,
`references/authoring.md`, `references/lesson-schema.md`, `assets/renderer.html`
and `scripts/validate.mjs` are the source of the pedagogy rules. When a ticket
says "the plugin", it means that copy.

## How to work a ticket

1. Start from the committed baseline. All of `deno task check`, `deno task test`,
   `deno task test:db` and `deno task e2e` pass there.
2. Take a ticket whose **Blocked by** tickets are all done. Work in your own Git
   worktree.
3. Read `AGENTS.md` and every document it names, then the ticket.
4. Build the whole vertical slice. Every ticket names what can be demoed when it
   is done. If you cannot demo it, the ticket is not done.
5. Run the ticket's verification commands. Paste their output in your report.
6. Update the ticket's checkboxes and set **Status** to `done`, with the commit
   SHA. The implementer, not the coordinator, updates the ticket.

Rules from `docs/implementation/README.md` apply: `001_initial.sql` is
immutable, never print an ignored env file, never create `learn-prod` outside
ticket 06, no publish API, no validation bypass.

## Order and edges

| # | Ticket | Blocked by | Kind |
| --- | --- | --- | --- |
| 01 | Split the browser app and server routes into domain modules | none | prefactor |
| 02 | Lesson content follows the plugin model: shared three-option set, misconceptions, reserved question | 01 | implement |
| 03 | Author-quality diagnostics ported from the plugin validator, with validator parity | 02 | implement |
| 04 | Complete JSON Schema, OpenAPI and diagnostic-code documentation for lesson/v1 | 03 | implement |
| 05 | Installable agent plugin served by the site | 04 | implement |
| 06 | Production deployment at learn.joshhale.me | none (needs Josh's go) | implement |
| 07 | Installable PWA shell that reopens a cached lesson offline | 01 | implement |
| 08 | Phone sign-in with a passkey from a one-time invite link | 01 | implement |
| 09 | Mine shelf lists the account's lessons from the server and caches them on open | 02, 08 | implement |
| 10 | Every-question drill mode that never awards Learned | 02 | implement |
| 11 | Server progress sync: event union, cursor pull, canonical checkpoint | 01 | implement |
| 12 | Client progress sync: outbox, merge, sync status, epoch discard | 09, 11 | implement |
| 13 | Spaced review: due Concepts on the shelf, review flow, Retained | 09, 12 | implement |
| 14 | API-token lifecycle: mint, list, revoke, rotate, scope errors | none | implement |
| 15 | Verify the learning loop on a phone viewport | 02, 10 | verify |
| 16 | Verify the authoring contract and the plugin end to end | 04, 05 | verify |
| 17 | Verify the deployed phone experience | 06, 07, 08, 09 | verify |
| 18 | Verify cross-device sync | 12 | verify |
| 19 | Verify spaced review across simulated days | 13 | verify |

The frontier at the start is 01, 06 and 14. After 01 lands, 02, 07, 08 and 11
open. After 02 lands, 03, 09 (with 08) and 10 open.

## Left out on purpose

Publish to Library, Library Listings, tags, discovery, flags and reviews;
active-time tracking; browser UI for token management; public account creation.
Each is a designed boundary in `docs/architecture.md` and can be ticketed later.
