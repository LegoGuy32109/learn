# 06 — Production deployment at learn.joshhale.me

**What to build:** Josh opens `https://learn.joshhale.me` on his phone and
completes the demo lesson. The application runs on Deno Deploy against a
`learn-prod` Turso database, with secrets in the Production context and
`learn-dev` values in the Development context.

Follow the production steps in `docs/turso-databases.md` in order: create
`learn-prod` with the same engine setting, mint a dedicated database token,
apply the complete migration history, bootstrap Josh's account and a production
owner token, seed only the demo lesson, store the secrets, then run smokes
before attaching the domain.

Add a deploy task and a production smoke task. The smoke fetches the shell, the
capability document, the schema and the validator, resolves the demo fixture
without persistence, and lists lessons with the owner token. Run it after every
deploy. Document the deploy and rollback steps.

This ticket creates `learn-prod`. Do not start it until Josh says go. Never
print any token or key, and never commit an env file.

**Demo path:** On a phone, over mobile data, open the site, start the demo
lesson, answer a Question, reload, and resume at the same Question.

**Blocked by:** None — can start immediately once Josh approves production.

**Status:** waiting-for-josh

- [ ] `learn-prod` exists, has every migration applied, and the migration
      ledger shows the same checksums as `learn-local`.
- [ ] The production owner account and token exist. The token was shown once
      and is stored only where Josh chose.
- [ ] Deno Deploy serves the app at the custom domain over HTTPS with the
      Production and Development contexts populated as the doc describes.
- [ ] The production smoke passes and its output is in the ticket report with
      tokens redacted.
- [ ] A search of the Git history finds no database URL, database token, API
      key or bearer token.
- [ ] The deploy and rollback procedure is documented next to the Turso doc.

## Verification

```bash
deno task smoke:prod
git log -p | rg -n "TURSO_DB_TOKEN=|TURSO_API_KEY=|learn_pat_" || echo "no secrets in history"
```
