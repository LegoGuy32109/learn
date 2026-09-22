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

**Status:** done 3b41f80

- [x] The production smoke fails when the database's applied migrations do not
      match the repository's migration history.
- [x] `deno task deploy` refuses or warns on a pending production migration.
- [x] `docs/deno-deploy.md` documents the migration step in the deploy order.
- [x] The application still never migrates at startup.
- [x] `deno task check`, `deno task test` and `deno task test:db` pass.

## Verification

```bash
deno task deploy
deno task check && deno task test && deno task test:db
```

## Report

Built both nets, as a shared, read-only comparison so there is one place
that decides what "pending" means, not two:

- `scripts/production-migrations.ts` — new. Parses `TURSO_DB_URL` and
  `TURSO_DB_TOKEN` straight out of the `.env.prod` file (never
  `Deno.env`/the process environment), exactly how this repo already reads
  `LEARN_OWNER_TOKEN` for `smoke:prod` and for the same reason: a caller
  that loaded `.env` first (`deno task deploy` does) must not silently hand
  this check a different database's credentials. It calls the new
  `pendingMigrations(db)` and returns the pending version list. It runs no
  migration and writes nothing.
- `src/server/migrations.ts` — refactored, not rewritten. `migrateDatabase`
  used to inline "read the ledger, diff against disk, apply what's missing"
  as one block; that diff is now `pendingAgainst(history, applied)`, a pure
  function (no I/O) exported alongside the two thin I/O wrappers it needs
  (`migrationHistory()` reads `migrations/`; `appliedLedger(db)` reads
  `schema_migrations`, creating it if absent, same as before) and a new
  read-only `pendingMigrations(db)`. `migrateDatabase` now calls the same
  `pendingAgainst` instead of carrying its own copy of the comparison.
- `scripts/deploy.ts` — calls `pendingProductionMigrations()` as its very
  first step, before touching `deno.json` or invoking the Deploy CLI. A
  non-empty result prints every pending version and exits 1; nothing is
  uploaded. No override flag: the ticket's own framing is "must be
  impossible," and there is no legitimate reason in this project's single
  main line to deploy code past a schema gap on purpose.
- `scripts/smoke-prod.ts` — runs the identical check as its first `PASS`/
  `FAIL` line, `migrations`. This is the second, independent net: it fires
  whenever the smoke runs, whether or not `scripts/deploy.ts`'s own guard
  was the thing that triggered that run, so a deploy that somehow bypassed
  the pre-flight (a manual `deno deploy` invocation, say) is still caught
  the moment anyone runs the smoke.
- `deno.json` — the `deploy` task gained `--allow-net` (the pre-flight
  check needs it; `--allow-read` was already unrestricted, so `.env.prod`
  needed no new grant). `smoke:prod`'s task needed no permission change:
  it already reads `.env.prod` (via `--allow-read`, not `--allow-env`) and
  already had `--allow-net`.
- `docs/deno-deploy.md` — the deploy section now numbers the pre-flight
  migration check as step 1 (before upload), names ticket 50/51 as the
  reason, states the deploy order explicitly ("`db:migrate:prod` before
  `deploy`, every time"), and the smoke section lists `migrations` as its
  first check. `docs/turso-databases.md` already said the serving
  application never runs a migration itself; that sentence did not need to
  change, and nothing in this ticket touches it.

### The application still never migrates at startup

Unchanged and reconfirmed: `grep -rn "migrateDatabase" src/ main.ts` finds
it called only from `scripts/migrate.ts` and `scripts/bootstrap-owner.ts`,
both operator scripts, never from `src/app.ts`, `main.ts` or any route.

### Demo path, run for real

```bash
# 1. A temporary no-op migration, not committed:
#    migrations/999_demo_noop.sql — "SELECT 1;"
$ deno task deploy
Refusing to deploy: learn-prod has not applied 1 migration(s) this checkout carries: 999_demo_noop.sql.
Run `deno task db:migrate:prod` first, then deploy again.
$ echo $?
1
```

Exit 1, before the Deploy CLI ran, before `deno.json` was touched, before
anything was uploaded. Removed the temporary file (`migrations/999_demo_noop.sql`)
rather than applying it to `learn-prod`: a fake, permanent, no-op entry in
production's real migration ledger is not something worth leaving behind
just to finish a demo. The "apply it and it succeeds" half is proved
instead by `tests/server/migrations_test.ts`'s `pendingMigrations reports
exactly the migrations missing from an under-migrated database` test,
which seeds a fake database missing the newest real migration, confirms
the check names exactly that gap, applies it, and confirms the gap is
gone — the same sequence, without leaving a junk migration in a real
database.

Then, with the checkout back to its normal three migrations (all already
applied to `learn-prod` since ticket 50's fix), ran the real command the
ticket's own Verification section names:

```
$ deno task deploy
Deployed revision g467h70zjjph to https://learn-joshhale.legoguy32109.deno.net.
PASS migrations: learn-prod matches this checkout's migration history
PASS shell: 200 /
PASS service worker: 200 /sw.js
PASS capabilities: 200 /api/v1/capabilities
PASS schema: 200 /api/v1/schemas/lesson/v1
PASS validator: 200 /tools/lesson-validator.js
PASS resolve: 200 /api/v1/lesson-resolutions
PASS list lessons: 200 /api/v1/lessons
Smoke passed against https://learn-joshhale.legoguy32109.deno.net (served by revision g467h70zjjph)
```

The new `migrations` smoke check passed against the real, currently-correct
production database — the happy path is not just untested by the guard's
absence, it is actively exercised.

### Verification

- `deno task check` — passes.
- `deno task test` — 165 passed, 0 failed (157 before this ticket, plus 8
  new tests in `tests/server/migrations_test.ts`).
- `deno task test:db` — 4 passed (25 steps), 0 failed, including
  `progress_sync_test.ts`'s own `migration 003 applied; 001 and 002 are
  untouched` step against a real ephemeral Turso database, confirming the
  `migrateDatabase` refactor changed no observable behavior.
- `deno task e2e` — 10 passed, 0 failed (not in this ticket's own
  Verification list, run anyway per `issues/README.md`'s baseline).
- `deno task deploy` — refused with a pending migration (demo path,
  above), and succeeded with none, both run for real against production.

### Decisions

- No escape-hatch flag on the deploy refusal. The ticket's brief says the
  goal is to make the failure "impossible," not merely unlikely, and there
  is no branch/release workflow in this repository today where deploying
  past a known schema gap on purpose would be legitimate. If that changes,
  the check is one `if` away from a `--force`, but adding it speculatively
  now is exactly the kind of unused escape hatch that gets reached for
  under pressure and defeats the guard.
- Put the shared check in its own `scripts/production-migrations.ts`
  rather than duplicating the `.env.prod`-parsing-plus-Turso-client
  boilerplate in both `deploy.ts` and `smoke-prod.ts`, or inlining the
  network/file I/O into `src/server/migrations.ts` itself (which stays
  free of Turso-client construction and `.env` parsing; it only ever
  receives an already-constructed `Client`).
- Did not add an HTTP endpoint for "what migrations does the server
  expect." Both checks that need this run from an operator's own checkout,
  which already has the exact `migrations/` directory that either just got
  deployed (the pre-flight, run before upload) or was deployed a moment
  ago by the same script (the smoke, run right after) — asking the
  deployed server over HTTP would add public surface revealing internal
  schema/version identifiers for a question the operator's own filesystem
  already answers, with no gain against the one drift this ticket cares
  about (database vs. code, not local-checkout vs. deployed-code, which
  the existing "deploy only from a clean checkout of a commit you intend
  to serve" discipline already covers).
- Left `migrations/001_initial.sql`, `002_passkeys_and_invites.sql` and
  `003_progress_sync.sql` untouched; this ticket is about the deploy
  pipeline, not the schema.
