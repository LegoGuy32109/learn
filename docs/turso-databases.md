# Turso databases

learn.joshhale.me uses Turso Cloud for durable server data. IndexedDB remains
the browser's immediate offline store. Turso stores accounts, API tokens,
Lesson identities, immutable Lesson Revisions, structured sources, passkey credentials, and the synchronized
learning and navigation event streams with their progress streams.

## Environments

| Database | Purpose | Lifecycle |
| --- | --- | --- |
| `learn-local` | Local application and database integration tests | Persistent, developer-owned |
| `learn-test-<uuid>` | Isolated database integration and end-to-end runs | Create and delete in one test run |
| `learn-prod` | Production data behind the Deno Deploy Production context | Persistent, created 2026-09-21 |

There are two environments, local and production, and no development database:
`learn-dev` and the Deploy `Preview` context it served were deleted on
2026-09-25 because nothing deploys from a branch. Both named databases use the
Turso database engine and have the full migration history, an owner account and
an owner API token. `learn-prod` holds only content approved for production; its
account was recreated empty on 2026-09-25. Which Deno
Deploy context reads which database is described in `docs/deno-deploy.md`.

## Credentials

The ignored `.env` file contains management credentials, the Deno Deploy
token, the `learn-local` connection, and the local owner token. The ignored `.env.prod` file contains the `learn-prod` connection and
the production owner token.

Never print, commit, or pass these values in an agent prompt:

- `TURSO_API_KEY`
- `TURSO_DB_TOKEN`
- `LEARN_OWNER_TOKEN`
- `DENO_DEPLOY_TOKEN`

`TURSO_API_KEY` is for provisioning scripts only. The serving application gets
only `TURSO_DB_URL` and `TURSO_DB_TOKEN`. Browsers and external agents never get
either database credential. External agents use a scoped
`LEARN_OWNER_TOKEN`-style bearer token.

## Commands

```bash
deno task db:provision  # Ensure learn-local exists; rotate its connection token
deno task db:migrate    # Apply pending migrations to learn-local
deno task db:owner      # Ensure Josh's local account, owner API token (with account:owner) and LEARN_SESSION_KEY exist
deno task db:seed       # Ensure the database-backed demo lesson exists
deno task test:db       # Draft persistence against learn-local; token lifecycle, passkey sign-in and progress sync each against an ephemeral learn-test-<uuid>
deno task token:mint    # Mint a named, scoped personal token; the full token is printed once
deno task token:list    # Show token metadata for the account
deno task token:revoke  # Revoke one token now
deno task token:rotate  # Replace a token's secret and revoke the old one once the new one is confirmed
deno task invite:mint   # Ask the running site for a one-time phone sign-in link using LEARN_OWNER_TOKEN
deno task invite:mint:prod  # The same against https://learn.joshhale.me with the production owner token in .env.prod
```

`deno task invite:mint` talks to `LEARN_BASE_URL` (default `http://localhost:8000`)
or `--base-url <url>`. The serving application also reads `LEARN_SESSION_KEY`
(browser session signing; without it sessions end at restart), and
`WEBAUTHN_RP_ID` plus `WEBAUTHN_ORIGINS` (the pinned passkey relying party; unset
means plain localhost only). Migration `002_passkeys_and_invites.sql` adds
`passkey_credentials`, `sign_in_invites` and `webauthn_challenges`. Migration
`003_progress_sync.sql` adds `progress_streams`, `progress_events` and
`navigation_events`. Run `deno task db:migrate` before serving code that needs
them.

Every `token:*` task accepts `--help`. To operate on `learn-prod`, run
`scripts/tokens.ts` with `--env-file=.env.prod` and the same permissions.

`deno task test:db` needs `TURSO_API_KEY` and `TURSO_ORG_SLUG` because the
token lifecycle test creates `learn-test-<uuid>`, runs against it in one process
and one spawned server process, and deletes it in the same run.

Production has its own tasks, each loading only `.env.prod`:

```bash
deno task db:provision:prod  # Ensure learn-prod exists; mint a token only when .env.prod has none
deno task db:migrate:prod    # Apply pending migrations to learn-prod
deno task db:owner:prod      # Ensure Josh's production account and owner API token exist
deno task db:seed:prod       # Ensure the demo lesson exists in learn-prod
```

`db:provision:prod` never rotates a production token on a rerun. Pass
`--rotate-token` to the script to mint a replacement on purpose, then run
`deno task deploy:env` so the Production context receives it.

## Migration rule

`001_initial.sql` has run in `learn-local` and `learn-prod`. It is immutable.
The migration runner stores its checksum and rejects a changed applied file.
Every schema change starts a new sequential file such as
`002_progress_events.sql`.

The serving application never runs migrations. Apply a migration before code
that requires it is deployed.

## Production setup

Production was approved and set up on 2026-09-21. The steps, in order, for the
record and for any future rebuild:

1. Create `learn-prod` with the same Turso engine setting
   (`deno task db:provision:prod`).
2. Mint a dedicated database token (the same task, into `.env.prod`).
3. Apply the complete immutable migration history
   (`deno task db:migrate:prod`).
4. Bootstrap Josh's account and mint a production owner API token
   (`deno task db:owner:prod`).
5. Seed only content approved for production (`deno task db:seed:prod`).
6. Store the URL and database token in the Deno Deploy `Production` context.
7. Store `learn-local` values in the `Local` context. Step 6 and this step are
   one task: `deno task deploy:env`. The `Preview` context is left empty.
8. Run the API smoke (`deno task smoke:prod`) and the browser demo path against
   the default Deploy URL before attaching the custom domain.

Deploying, rolling back and attaching the domain are in `docs/deno-deploy.md`.

