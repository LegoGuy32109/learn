# Deno Deploy

The application runs as one Deno Deploy application on the current
(post-Classic) platform.

| Item | Value |
| --- | --- |
| Organization | `legoguy32109` |
| Application | `learn-joshhale` |
| Default URL | `https://learn-joshhale.legoguy32109.deno.net` |
| Custom domain | `learn.joshhale.me`, attached by Josh |
| Runtime | dynamic, entrypoint `./main.ts` |
| Region | `us` |

The application slug `learn` was not available on Deno Deploy, so the
application is named `learn-joshhale`. The custom domain hides the slug.

Every deploy happens from this repository with a Deno task. There is no GitHub
Action. `DENO_DEPLOY_TOKEN` in the ignored `.env` file authenticates the CLI.
Never print it, and never paste it into a prompt.

## Contexts and environment variables

Environment variables are scoped to contexts. Each context maps to one Turso
database from `docs/turso-databases.md`.

| Context | When it applies | Database | Source file |
| --- | --- | --- | --- |
| `Production` | The production timeline at the default URL and the custom domain | `learn-prod` | `.env.prod` |
| `Preview` | Any branch or ad-hoc preview deploy | `learn-dev` | `.env.dev` |
| `Local` | Running the application on your own machine through Deploy tooling | `learn-local` | `.env` |
| `Build` | Only during the build step, not at runtime | unused | none |

Two facts that the platform documentation does not make obvious:

- The documentation calls the branch-and-preview bucket "Development". That
  name does not exist as a context. The real name is `Preview`, and
  `Development` fails with `Context "Development" not found`.
- `Local` is a fourth context that the documentation does not mention. It is
  for variables that apply when the app runs on your own machine.

The application reads only `TURSO_DB_URL` and `TURSO_DB_TOKEN`. Both need a
different value in every context, which is the whole point of separate
databases. `deno deploy env add` cannot do that: every `add` writes an
all-contexts entry, and the backend then refuses a second entry for the same
key. Use the script instead:

```bash
deno task deploy:env   # Production <- .env.prod, Preview <- .env.dev, Local <- .env
```

The task runs `scripts/set-deploy-env.ts` once per context. The script reads
the two keys from the named env file, so no secret appears on the command line
or in shell history. It marks `TURSO_DB_TOKEN` secret. For one variable in one
context it also accepts an explicit value:

```bash
deno run --env-file=.env -A --no-lock scripts/set-deploy-env.ts Preview SOME_KEY "value" [secret]
```

The script imports the CLI's own `createTrpcClient` and `tokenStorage` helpers
from `jsr:@deno/deploy` and calls the `envVarsContexts.updateEnvVars` mutation
with a real `context_ids` array. That mutation supports context IDs; the CLI
subcommand never exposed a flag for them.

Viewing and deleting variables:

```bash
deno run -A --no-lock jsr:@deno/deploy@0.0.9904 env list --json --non-interactive --org legoguy32109 --app learn-joshhale
deno run -A --no-lock jsr:@deno/deploy@0.0.9904 env delete SOME_KEY --org legoguy32109 --app learn-joshhale
```

Secret values always list as `null`. Deleting a key removes every context entry
under it at once. Both commands need `DENO_DEPLOY_TOKEN` in the environment.

Run the CLI as `deno run -A --no-lock jsr:@deno/deploy@0.0.9904 <subcommand>`.
The `deno deploy <subcommand>` shim in Deno 2.9.6 duplicates its arguments and
fails with `Too many arguments`. `--no-lock` keeps the CLI's own dependencies
out of this repository's `deno.lock`; the deploy tasks pass it for the same
reason.

## Deploy

```bash
deno task deploy
```

The task runs `scripts/deploy.ts`, which:

1. Uploads the working tree as a production revision with
   `--prod --non-interactive`. The upload honors `.gitignore` and the
   `deploy.exclude` list in `deno.json`, so `.env`, `.env.dev`, `.env.prod`,
   tests and docs never leave the machine. The unit test in
   `tests/server/deploy_config_test.ts` guards the exclude list.
2. Waits for the build and prints the revision id and the production URL.
   The CLI re-serializes `deno.json` during the upload and drops the trailing
   newline. The script restores the bytes it found, so the tree stays clean.
3. Runs `deno task smoke:prod`. A failed smoke fails the task.

Deploy only from a clean checkout of a commit you intend to serve. Apply any
new migration to `learn-prod` with `deno task db:migrate:prod` before you
deploy code that needs it. The serving application never runs migrations.

Pass `--no-smoke` to `scripts/deploy.ts` only when you deliberately deploy
something the smoke cannot yet pass, and run the smoke by hand afterwards.

## Production smoke

```bash
deno task smoke:prod
```

`scripts/smoke-prod.ts` reads `LEARN_OWNER_TOKEN` from the `.env.prod` file
itself and checks the default URL over HTTPS:

- `GET /` returns the HTML shell naming the demo lesson.
- `GET /api/v1/capabilities` returns the capability document.
- `GET /api/v1/schemas/lesson/v1` returns the lesson schema.
- `GET /tools/lesson-validator.js` returns the downloadable validator.
- `POST /api/v1/lesson-resolutions` resolves the demo fixture as valid without
  persisting it.
- `GET /api/v1/lessons` with the owner token lists a published revision.

It prints one `PASS` or `FAIL` line per check and never prints a token. A
`FAIL` line also carries the status, the `x-learn-revision` header and the
response body. The last line names the revision that served the checks. Set
`LEARN_BASE_URL` to smoke another origin, such as the custom domain once it is
attached. One retry after two seconds covers a cold isolate on the first
request after a deploy.

The smoke reads the owner token from the file, not from the process
environment, on purpose. `--env-file` never overrides a variable the parent
process already set. `deno task deploy` loads `.env`, which has the local
`LEARN_OWNER_TOKEN`, so a smoke that trusted its environment inherited the
local token and production answered `401`. Ticket 16 records the evidence.

## Revision header

Every response carries `x-learn-revision` with the value of
`DENO_DEPLOY_BUILD_ID`, the id of the revision that served it. Locally the
header says `local`. Compare it with the id `deno task deploy` printed when a
response looks like it came from the wrong revision.

## Rollback

Deno Deploy keeps every revision. Two ways to roll back:

1. **Redeploy a known-good commit.** In a clean worktree:

   ```bash
   git checkout <good sha>
   deno task deploy
   ```

   This creates a new production revision with the old code and runs the smoke.
   It is the path that leaves a record in the repository.

2. **Promote an earlier revision in the console.** Open
   `https://console.deno.com/legoguy32109/learn-joshhale`, choose the earlier
   successful revision and promote it to production. Then run
   `deno task smoke:prod`. The CLI can list revisions but cannot promote one:

   ```bash
   deno run -A --no-lock jsr:@deno/deploy@0.0.9904 deployments list --json --non-interactive --org legoguy32109 --app learn-joshhale
   ```

Database changes do not roll back with code. Migrations are forward-only and
additive, so older code keeps working against a newer schema. If a rollback
must also undo data, write a new migration.

## The one step Josh does: attach the custom domain

1. Add a `CNAME` record for `learn.joshhale.me` pointing at the target the
   console shows under the application's Domains page, or the `A`/`AAAA`
   records it lists.
2. In the console, add `learn.joshhale.me` as a custom domain on the
   `learn-joshhale` application and attach it to the Production timeline. The
   platform provisions the TLS certificate.
3. Run the smoke against the domain:

   ```bash
   LEARN_BASE_URL=https://learn.joshhale.me deno task smoke:prod
   ```

4. Switch the public origin the generated texts name. The agent plugin, its
   marketplace manifest (whose archive URL the Claude Code CLI downloads) and
   the OpenAPI default server all read one constant, `DEFAULT_PUBLIC_ORIGIN`
   in `src/server/plugin/links.ts`, currently
   `https://learn-joshhale.legoguy32109.deno.net`. Change it to
   `https://learn.joshhale.me`, regenerate and deploy:

   ```bash
   deno task plugin:generate
   deno task check && deno task test
   deno task deploy
   ```

   `LEARN_PUBLIC_ORIGIN=<origin> deno task plugin:generate` overrides the
   constant for one generation without editing the file. The tests read the
   same value, so they stay green either way. Until this step runs,
   `claude plugin install learn-lesson@learn-joshhale` downloads the archive
   from the Deno Deploy hostname, which is why route 1 works before DNS.

Nothing in the repository waits on DNS. The default URL keeps serving.

## First-time setup record

Production was set up on 2026-09-21 in this order:

1. `deno task db:provision:prod` created `learn-prod` with `use_tursodb` and
   minted its database token into `.env.prod`.
2. `deno task db:migrate:prod` applied `001_initial.sql`. Its checksum matches
   the `learn-local` ledger.
3. `deno task db:owner:prod` created Josh's account and the `owner-cli` token.
   The full token was written once to `.env.prod` and shown nowhere else.
4. `deno task db:seed:prod` stored the demo lesson as a published revision.
5. The application was created with `deno run -A jsr:@deno/deploy@0.0.9904
   create --source local --runtime-mode dynamic --entrypoint main.ts --region us`.
   Its first revision failed at the warming step because no database
   variables existed yet.
6. `deno task deploy:env` populated Production, Preview and Local.
7. `deno task deploy` published a working revision and the smoke passed.
