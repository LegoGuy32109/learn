# Turso databases

learn.joshhale.me uses Turso Cloud for durable server data. IndexedDB remains
the browser's immediate offline store. Turso stores accounts, API tokens,
Lesson identities, immutable Lesson Revisions, and structured sources. A later
migration will add synchronized learning and navigation events.

## Environments

| Database | Purpose | Lifecycle |
| --- | --- | --- |
| `learn-local` | Local application and database integration tests | Persistent, developer-owned |
| `learn-dev` | Development and preview deployments | Disposable before production |
| `learn-test-<uuid>` | Isolated database integration and end-to-end runs | Create and delete in one test run |
| `learn-prod` | Production data | Not created yet |

Both `learn-local` and `learn-dev` use the Turso database engine and have
`001_initial.sql`, an owner account, an owner API token, and the demo Lesson
Revision. Do not create `learn-prod` until a production deployment is approved.

## Credentials

The ignored `.env` file contains management credentials, the `learn-local`
connection, and the local owner token. The ignored `.env.dev` file contains the
`learn-dev` connection and its separate owner token.

Never print, commit, or pass these values in an agent prompt:

- `TURSO_API_KEY`
- `TURSO_DB_TOKEN`
- `LEARN_OWNER_TOKEN`

`TURSO_API_KEY` is for provisioning scripts only. The serving application gets
only `TURSO_DB_URL` and `TURSO_DB_TOKEN`. Browsers and external agents never get
either database credential. External agents use a scoped
`LEARN_OWNER_TOKEN`-style bearer token.

## Commands

```bash
deno task db:provision  # Ensure learn-local and learn-dev exist; rotate connection tokens
deno task db:migrate    # Apply pending migrations to learn-local
deno task db:owner      # Ensure Josh's local account and owner API token exist
deno task db:seed       # Ensure the database-backed demo lesson exists
deno task test:db       # Draft persistence against learn-local, token lifecycle against an ephemeral learn-test-<uuid>
deno task token:mint    # Mint a named, scoped personal token; the full token is printed once
deno task token:list    # Show token metadata for the account
deno task token:revoke  # Revoke one token now
deno task token:rotate  # Replace a token's secret and revoke the old one once the new one is confirmed
```

Every `token:*` task accepts `--help`. To operate on `learn-dev`, run
`scripts/tokens.ts` with `--env-file=.env.dev` and the same permissions.

`deno task test:db` needs `TURSO_API_KEY` and `TURSO_ORG_SLUG` because the
token lifecycle test creates `learn-test-<uuid>`, runs against it in one process
and one spawned server process, and deletes it in the same run.

To operate on development, run the underlying script with `.env.dev`:

```bash
deno run --env-file=.env.dev --allow-env=TURSO_DB_URL,TURSO_DB_TOKEN \
  --allow-net --allow-read scripts/migrate.ts

deno run --env-file=.env.dev --allow-env=TURSO_DB_URL,TURSO_DB_TOKEN \
  --allow-net --allow-read --allow-write scripts/bootstrap-owner.ts \
  --env-path=.env.dev

deno run --env-file=.env.dev --allow-env=TURSO_DB_URL,TURSO_DB_TOKEN \
  --allow-net --allow-read scripts/seed-demo.ts
```

## Migration rule

`001_initial.sql` has run in `learn-local` and `learn-dev`. It is immutable.
The migration runner stores its checksum and rejects a changed applied file.
Every schema change starts a new sequential file such as
`002_progress_events.sql`.

The serving application never runs migrations. Apply a migration before code
that requires it is deployed.

## Production setup

When production is approved:

1. Create `learn-prod` with the same Turso engine setting.
2. Mint a dedicated database token.
3. Apply the complete immutable migration history.
4. Bootstrap Josh's account and mint a production owner API token.
5. Seed only content approved for production.
6. Store the URL and database token as Deno Deploy Production secrets.
7. Store `learn-dev` values in the Development context.
8. Run API and browser smokes before attaching the custom domain.

