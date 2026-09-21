# Architecture

## Decision summary

The application is one Deno modular monolith. It will eventually deploy as one
Deno Deploy project backed by one Turso database. The browser receives
server-rendered page shells and uses core Datastar plus small JavaScript modules
for interaction. Datastar Rocket is not part of the baseline.

Use browser JavaScript with `// @ts-check`, JSDoc, and focused `.d.ts` files.
Use TypeScript for server modules and scripts. Keep shared domain code as pure
JavaScript so the browser and server can run the same reducers, validators, and
answer evaluators.

## Dependency direction

The top-level structure is layer-first, with domain subdivisions inside each
runtime layer:

```text
learn/
  AGENTS.md
  CONTEXT.md
  deno.json
  main.ts
  public/
    css/
    icons/
    js/
    tools/                 # generated validator downloads, later
  fixtures/
    lessons/
      browser-http-cache.json
  src/
    app.ts
    shared/
      lessons/
      learning/
      review/
      verification/
      activity/
      authoring/
      identity/
      library/
    client/
      learning/
      library/
      storage/
    server/
      routes/
      repositories/
      views/
  scripts/
  tests/
    shared/
    client/
    server/
    db/
    e2e/
  docs/
```

Create directories only when the milestone has code for them. `main.ts` is
bootstrap only. `src/app.ts` constructs the request handler. Group server
routes by domain. Put server-rendered views in `src/server/views`.

The dependency direction is:

```text
server adapters  -> shared domain <- browser adapters
server routes    -> application    <- client surfaces
```

Shared domain modules must not import DOM, IndexedDB, HTTP-server, or database
code. Repository contracts use domain-shaped values. IndexedDB and future Turso
adapters must not expose storage row shapes to the domain.

Use a separate browser entry module for each major surface. The first milestone
needs a Library surface and a Learning surface.

## Content ownership

The database owns normalized Lesson records. Markdown is not canonical. The
alpha authoring contract accepts JSON `lesson/v1` documents. A deterministic
resolver validates and normalizes input and returns diagnostics, schema
version, and a fingerprint. Separate authenticated endpoints rerun that same
resolver before they persist a private draft.

The immutable revision envelope is relational. The complete normalized Lesson
content is stored as one JSON document because it is small, loaded as a unit,
fingerprinted as a unit, and copied to IndexedDB as a unit. Structured sources,
ownership, token metadata, and lifecycle fields remain relational. SQL
projection tables can be added if later discovery or reporting needs them.

## Offline and synchronization boundary

IndexedDB is the browser source for cached Lesson Revisions, immutable events,
and rebuildable projections. Opened lessons will eventually cache
automatically. A later service worker caches only the versioned shell and
static assets; lesson content and progress remain in IndexedDB.

Guest progress is authoritative locally. An account later adds cross-device
sync by accepting the idempotent union of immutable UUIDv4 events. A progress
stream epoch prevents an old offline device from restoring deliberately
discarded progress.

Navigation checkpoints must also survive cross-device pickup. They are
projections over immutable `navigation_checkpointed` events, not local-only
mutable state. The server will eventually rebuild and return the canonical
checkpoint. It must reject a stale checkpoint as canonical when that checkpoint
depends on less progress than the existing one. Specify simultaneous-device
conflict resolution with the sync API; do not invent that API in this milestone.

## Future deployment model

The intended production shape is one Deno Deploy application and one Turso
database. Use plural snake_case table names, including `lessons`,
`lesson_revisions`, `listings`, `progress_events`, and `activity_intervals`.
This naming is a boundary for later migrations, not a request to create empty
tables now.

## Planning records

Keep durable project context in `CONTEXT.md`, architecture here, and executable
scope in `docs/first-milestone.md`. Add an ADR only for a decision with a real,
long-lived alternative and consequence. Do not create an ADR for every choice.
