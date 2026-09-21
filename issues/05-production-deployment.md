# 05 — Production deployment at learn.joshhale.me

**What to build:** Josh opens the production site on his phone and completes
the demo lesson. The application runs on Deno Deploy against a `learn-prod`
Turso database, with secrets in the Production context and `learn-dev` values
in the Development context. Josh approved creating `learn-prod` and the Deno
Deploy project on 2026-09-21. Create the Deploy project named `learn`; it
serves at its default `deno.dev` URL. Josh assigns `learn.joshhale.me` to it
himself later, so do not wait on DNS and do not try to change it.

Follow the production steps in `docs/turso-databases.md` in order: create
`learn-prod` with the same engine setting, mint a dedicated database token,
apply the complete migration history, bootstrap Josh's account and a production
owner token, seed only the demo lesson, store the secrets, then run smokes
against the default Deploy URL.

Add a deploy task and a production smoke task. The smoke fetches the shell, the
capability document, the schema and the validator, resolves the demo fixture
without persistence, and lists lessons with the owner token. Run it after every
deploy. Document the deploy and rollback steps.

Never print any token or key, and never commit an env file. If Deno Deploy
needs an interactive login, stop and ask Josh to run it; do not paste a token
into a prompt.

**Demo path:** On a phone, over mobile data, open the Deploy URL, start the
demo lesson, answer a Question, reload, and resume at the same Question.

**Blocked by:** None — can start immediately.

**Status:** done b064651

- [x] `learn-prod` exists, has every migration applied, and the migration
      ledger shows the same checksums as `learn-local`.
- [x] The production owner account and token exist. The token was shown once
      and is stored only where Josh chose.
- [x] Deno Deploy serves the app at its default URL over HTTPS with the
      Production and Development contexts populated as the doc describes. The
      report names the URL so Josh can attach the domain.
- [x] The production smoke passes and its output is in the ticket report with
      tokens redacted.
- [x] A search of the Git history finds no database URL, database token, API
      key or bearer token.
- [x] The deploy and rollback procedure is documented next to the Turso doc,
      including the one step Josh does: attaching the custom domain.

## Verification

```bash
deno task smoke:prod
git log -p | rg -n "TURSO_DB_TOKEN=|TURSO_API_KEY=|learn_pat_" || echo "no secrets in history"
```

## Report

### What exists now

| Item | Value |
| --- | --- |
| Turso database | `learn-prod`, engine `use_tursodb`, group `default` |
| Deno Deploy app | `learn-joshhale` in org `legoguy32109` |
| Default URL | `https://learn-joshhale.legoguy32109.deno.net` |
| Production revision | `v36npwymtpk1` |
| Domain step for Josh | attach `learn.joshhale.me` to `learn-joshhale`, see `docs/deno-deploy.md` |

### Decisions

- **App name.** The ticket asked for the slug `learn`. Deno Deploy rejected it
  with `Slug is not available.` (trace `83f0e1f810ff573045eee39e7a942fa3`), so
  the app is `learn-joshhale`. The custom domain hides the slug. Renaming
  later means creating a new app, moving the env vars with
  `deno task deploy:env` and redeploying.
- **Default URL.** New apps on the current platform serve at
  `<app>.<org>.deno.net`, not `deno.dev`. The ticket's wording was from the
  older platform.
- **Contexts.** The platform has `Production`, `Preview`, `Local` and `Build`.
  There is no `Development` context. `learn-dev` values went to `Preview`
  and `learn-local` values to `Local`. `docs/turso-databases.md` was corrected
  and `docs/deno-deploy.md` explains the contexts.
- **Production owner token.** `deno task db:owner:prod` wrote the token once
  to the ignored `.env.prod` in this worktree and printed only its prefix.
  Nothing else holds it. `.env.prod` is the file the smoke loads. Copy it to
  the main checkout or a password manager as you prefer.
- **Env var script.** `scripts/set-deploy-env.ts` follows the painting
  convention but adds a `--from=<env file>` form so no secret is typed on the
  command line. It runs with `-A` because the CLI's auth module imports npm
  packages that probe the OS. `--no-lock` keeps the CLI's dependencies out of
  `deno.lock`.
- **CLI invocation.** `deno deploy <subcommand>` under Deno 2.9.6 duplicates
  its arguments and fails with `Too many arguments`, so scripts and docs use
  `deno run -A --no-lock jsr:@deno/deploy@0.0.9904 ...`.
- **Upload contents.** The first upload was run with `--debug` and the file
  list captured: no `.env*` file was read or uploaded. `deno.json` gains a
  `deploy.exclude` list for `.env`, `.env.*`, tests and docs on top of the
  CLI's `.gitignore` handling, and `tests/server/deploy_config_test.ts`
  guards it.
- **Smoke retry.** The very first smoke after the first successful deploy got
  a `401` on `GET /api/v1/lessons` that did not reproduce in four immediate
  reruns; every later run passed. The smoke now retries a failing check once
  after two seconds and says so in its output.
- **First revision.** The `create` command deploys immediately, so revision
  `hh0a648090yn` failed at `warming` because no database variables existed
  yet. The env vars were then set and `deno task deploy` published
  `v36npwymtpk1`, which passed.

### Verification output

`deno task smoke:prod`:

```text
PASS shell: 200 /
PASS capabilities: 200 /api/v1/capabilities
PASS schema: 200 /api/v1/schemas/lesson/v1
PASS validator: 200 /tools/lesson-validator.js
PASS resolve: 200 /api/v1/lesson-resolutions
PASS list lessons: 200 /api/v1/lessons
Smoke passed against https://learn-joshhale.legoguy32109.deno.net
```

`git log -p | rg -n "TURSO_DB_TOKEN=|TURSO_API_KEY=|learn_pat_"` (at the
parent commit, before this ticket's commit):

```text
843:+TURSO_API_KEY=
846:+TURSO_DB_TOKEN=
1053:+Authorization: Bearer learn_pat_<prefix>_<secret>
2200:+    if (!token.startsWith("learn_pat_")) return null;
2472:+  return { token: `learn_pat_${prefix}_${secret}`, prefix };
4147:+git log -p | rg -n "TURSO_DB_TOKEN=|TURSO_API_KEY=|learn_pat_" || echo "no secrets in history"
```

Every match is an empty placeholder in `.env.example`, the token format in
`docs/api-v1.md` and `src/server`, or this ticket's own command. No database
URL, database token, API key or bearer token value appears. A tree-wide search
for `ddp_`, `eyJ` and `learn_pat_` followed by token characters, excluding
ignored env files, found nothing.

Migration ledger, `SELECT version, checksum FROM schema_migrations`:

```text
learn-local: 001_initial.sql 7c555e0f57ad2f89927864c3f5e8bfd93d86e2b9025075113b2030e5fa8455cf
learn-prod:  001_initial.sql 7c555e0f57ad2f89927864c3f5e8bfd93d86e2b9025075113b2030e5fa8455cf
```

`learn-prod` row counts: 1 account, 1 token, 1 lesson, 1 published revision.

Deno Deploy `env list` (secret values list as `null` by design):

```text
TURSO_DB_URL   Production, Preview, Local  (one value each)
TURSO_DB_TOKEN Production, Preview, Local  (secret, one value each)
```

Demo path against production with Playwright at 390x844: shelf over
`https:`, Start lesson, first Card, Continue to the first Question, reload
resumes at the same Question, answer correctly, reload again shows the same
Question with its Correct feedback. Output ended `DEMO PATH OK`.

`deno task check` exit 0. `deno task test` 15 passed. `deno task e2e` 2 passed.
`deno task test:db` 1 passed.

### Not done

- The phone-over-mobile-data run is Josh's to do; the Playwright run above
  covers the same steps at a phone viewport from this machine.
- Attaching `learn.joshhale.me` is Josh's step, documented in
  `docs/deno-deploy.md`.
