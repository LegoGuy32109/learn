# 51 — A deploy can ship code whose migration was never applied

**What to build:** `deno task deploy` must make it impossible to serve routes
against tables that do not exist. Ticket 50 happened because a migration
merged to main and deployed while `learn-prod` had never run it: every
progress-sync route answered 500 for hours, and no smoke, test or deploy step
noticed.

Two changes, either of which would have caught it, and both are cheap:

- The production smoke asks the server which migrations it expects and
  compares that with what the database reports, failing when they differ.
- `deno task deploy` refuses to publish, or warns loudly and asks, when
  `learn-prod` has pending migrations, and `docs/deno-deploy.md` names
  `deno task db:migrate:prod` as a required step before publishing code that
  needs a new schema.

The application must still never run a migration itself at startup, as
`docs/turso-databases.md` requires.

**Demo path:** Add a new no-op migration file, do not apply it, and run
`deno task deploy`. It stops and names the pending migration. Apply it and the
same command succeeds.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The production smoke fails when the database's applied migrations do not
      match the repository's migration history.
- [ ] `deno task deploy` refuses or warns on a pending production migration.
- [ ] `docs/deno-deploy.md` documents the migration step in the deploy order.
- [ ] The application still never migrates at startup.
- [ ] `deno task check`, `deno task test` and `deno task test:db` pass.

## Verification

```bash
deno task deploy
deno task check && deno task test && deno task test:db
```
