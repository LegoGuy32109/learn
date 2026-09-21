# Agent instructions

Read these files before you change the application:

1. `CONTEXT.md`
2. `docs/architecture.md`
3. `docs/domain-model.md`
4. `docs/first-milestone.md`
5. `docs/api-v1.md`
6. `docs/turso-databases.md`
7. `docs/deno-deploy.md`

For coordinated follow-on work, also read `docs/implementation/README.md` and
the assigned workstream document. `migrations/001_initial.sql` has been applied
and is immutable.

The visual reference is `/home/josh/Downloads/learn-ui-reference.tar.gz`.
Inspect `tokens.css`, `app.css`, `components.html`, and `README.md` in that
archive before you implement the interface. The screenshot
`/home/josh/Downloads/learn-smoke-flow.png` is supporting evidence, but the CSS
reference is authoritative. Reuse its conventions and assets. Do not preserve
older vocabulary or behavior when it conflicts with the project documents.

Use Deno. Browser code is JavaScript with `// @ts-check` and JSDoc. Server and
script code can use TypeScript. Use core Datastar where hypermedia behavior is
useful. Do not add Datastar Rocket.

Keep the application a modular monolith. Prefer layer-first top-level
directories with domain subdivisions. Shared reducers and evaluators must be
pure and usable in the browser and on the server.

Run the checks in `docs/first-milestone.md` before you report completion. Do not
implement deferred systems merely to make their future directories exist.

## Ticketed work

Open tickets for the phone-portal stage live in `issues/`. Read `issues/README.md`
for the order, the blocking edges, and how to work a ticket.
