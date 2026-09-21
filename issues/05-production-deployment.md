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

**Status:** ready-for-agent

- [ ] `learn-prod` exists, has every migration applied, and the migration
      ledger shows the same checksums as `learn-local`.
- [ ] The production owner account and token exist. The token was shown once
      and is stored only where Josh chose.
- [ ] Deno Deploy serves the app at its default URL over HTTPS with the
      Production and Development contexts populated as the doc describes. The
      report names the URL so Josh can attach the domain.
- [ ] The production smoke passes and its output is in the ticket report with
      tokens redacted.
- [ ] A search of the Git history finds no database URL, database token, API
      key or bearer token.
- [ ] The deploy and rollback procedure is documented next to the Turso doc,
      including the one step Josh does: attaching the custom domain.

## Verification

```bash
deno task smoke:prod
git log -p | rg -n "TURSO_DB_TOKEN=|TURSO_API_KEY=|learn_pat_" || echo "no secrets in history"
```
