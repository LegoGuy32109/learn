# 16 — The first authenticated request after a deploy answers 401

**What to build:** `deno task deploy` ends green. Today it publishes the
revision, runs the production smoke, and the smoke fails on its last check
every time: `GET /api/v1/lessons` with the production owner token answers
`401` on the first request after a deploy, then `200` on every rerun a few
seconds later. This has happened on three consecutive deploys on 2026-09-21
(revisions after `v36npwymtpk1`). The smoke's single retry after two seconds
does not cover it.

Find the cause, not a longer retry. Candidates to rule in or out, in order:

- The new isolate's first database query fails or times out and some layer
  maps that failure to `unauthenticated` instead of `500`. Check every path
  from the bearer header to the token row, including the `last_used_at`
  update, and make a database error surface as a `500` problem response, never
  as `401`.
- Two revisions serve during the rollout and the smoke hits one whose
  Production context variables are not yet applied. Check what the platform
  reports for the revision that answered, for example by echoing the
  deployment revision in a response header on every response.
- The smoke's own token loading, for example a stale `.env.prod` read before
  the owner task rewrote it.

Then make the smoke print the response body and the revision header on a
failure, so the next person does not have to guess.

Second, smaller item in the same ticket: `deno task deploy` leaves `deno.json`
modified by a trailing newline. Find which step rewrites it and stop it, or
restore the file after the step.

**Demo path:** Run `deno task deploy` three times in a row. Each run ends with
`Smoke passed` and a clean `git status`.

**Blocked by:** None — can start immediately.

**Status:** done 4b37189 (implementation commit; report follows in the next commit)

- [x] The cause is named in the report with the evidence that proves it, not
      a guess.
- [x] A database or network failure during authentication answers `500` with
      a problem document, and a unit test proves it.
- [x] Every response carries a header naming the serving revision, and the
      smoke prints it and the response body on any failure.
- [x] Three consecutive `deno task deploy` runs end green with a clean tree.
- [x] `deno task check`, `deno task test` and `deno task test:db` pass.

## Verification

```bash
deno task deploy && git status --short
deno task check && deno task test && deno task test:db
```

## Report

### Cause

The server never answered 401 to the production token. The smoke sent the
wrong token. Evidence:

1. `.env` and `.env.prod` both define `LEARN_OWNER_TOKEN`, with different
   values (compared in-process, not printed: `both set: true same value: false`).
2. Deno 2.9.6 does not let `--env-file` override a variable the parent process
   already set. Probe: a parent exporting `PRECEDENCE_PROBE=fromparent` ran
   `deno eval --env-file=probe.env` where the file said `fromfile`; the child
   printed `fromparent`.
3. `deno task deploy` runs `scripts/deploy.ts` with `--env-file=.env`, then
   spawns `deno task smoke:prod`, whose `--env-file=.env.prod` therefore left
   the inherited local `LEARN_OWNER_TOKEN` in place. The smoke sent the
   `learn-local` owner token to `learn-prod`, which does not know it, so
   `GET /api/v1/lessons` answered 401. Rerunning `deno task smoke:prod` by
   hand has no parent that loaded `.env`, so it loaded the production token
   and got 200. "A few seconds later" was a coincidence of the rerun.
4. Reproduced without a deploy, against the revision already serving:

   ```
   == smoke run the way deploy.ts runs it (parent loaded .env) ==
   PASS shell: 200 /
   PASS capabilities: 200 /api/v1/capabilities
   PASS schema: 200 /api/v1/schemas/lesson/v1
   PASS validator: 200 /tools/lesson-validator.js
   PASS resolve: 200 /api/v1/lesson-resolutions
   FAIL list lessons: expected 200, got 401
   Smoke failed: list lessons
   == smoke run directly ==
   PASS list lessons: 200 /api/v1/lessons
   Smoke passed against https://learn-joshhale.legoguy32109.deno.net
   ```

Candidates ruled out:

- Database failure mapped to 401: every throw from `TokenAuthenticator`,
  including the `last_used_at` update, propagates to the `createApp` catch and
  becomes a 500 problem document. `tests/server/auth_failure_test.ts` now
  proves it for the lookup, the update, and the log redaction.
- Two revisions during rollout: the new `x-learn-revision` header matched the
  id `deno task deploy` printed on all three runs, and the reproduction above
  fails against a stable revision with no deploy in flight.

### Changes

- `scripts/smoke-prod.ts` reads `LEARN_OWNER_TOKEN` from the `.env.prod` file
  itself (`@std/dotenv/parse`), notes when the environment carries a different
  value, and on any failure prints status, `x-learn-revision` and the body
  (truncated to 2000 bytes, bearer tokens redacted). The final line names the
  revision(s) that served the checks.
- `src/app.ts` sets `x-learn-revision` on every response; `main.ts` feeds it
  `DENO_DEPLOY_BUILD_ID` (the platform's id of the running revision), `local`
  otherwise, and tolerates a denied env read so restricted `--allow-env` lists
  keep working. `Dependencies.revision` is the new optional field.
- `scripts/deploy.ts` snapshots `deno.json` before the CLI and restores it
  after. The step that rewrote it is the `jsr:@deno/deploy` upload: it
  re-serializes the file and adds one byte (3861 -> 3862), the trailing
  newline the ticket describes. The task gains `--allow-write=deno.json`.
- Docs: `docs/deno-deploy.md` (smoke token loading, restore step, header) and
  `docs/api-v1.md` (500 meaning, header).

### Verification

`deno task deploy && git status --short`, three consecutive runs (revisions
wfa79k9m8da2, d85dt05t2d2r, 9smkhq7evf7t). Runs 2 and 3, verbatim:

```
Restored deno.json after the deploy CLI rewrote it (3862 bytes back to 3861).
Deployed revision d85dt05t2d2r to https://learn-joshhale.legoguy32109.deno.net.
NOTE the environment carries a different LEARN_OWNER_TOKEN; the smoke uses the one in .env.prod
PASS shell: 200 /
PASS capabilities: 200 /api/v1/capabilities
PASS schema: 200 /api/v1/schemas/lesson/v1
PASS validator: 200 /tools/lesson-validator.js
PASS resolve: 200 /api/v1/lesson-resolutions
PASS list lessons: 200 /api/v1/lessons
Smoke passed against https://learn-joshhale.legoguy32109.deno.net (served by revision d85dt05t2d2r)
deploy exit: 0
--- git status --short:
(empty)
=== deploy run 3 ===
Restored deno.json after the deploy CLI rewrote it (3862 bytes back to 3861).
Deployed revision 9smkhq7evf7t to https://learn-joshhale.legoguy32109.deno.net.
NOTE the environment carries a different LEARN_OWNER_TOKEN; the smoke uses the one in .env.prod
PASS shell: 200 /
PASS capabilities: 200 /api/v1/capabilities
PASS schema: 200 /api/v1/schemas/lesson/v1
PASS validator: 200 /tools/lesson-validator.js
PASS resolve: 200 /api/v1/lesson-resolutions
PASS list lessons: 200 /api/v1/lessons
Smoke passed against https://learn-joshhale.legoguy32109.deno.net (served by revision 9smkhq7evf7t)
deploy exit: 0
--- git status --short:
(empty)
```

Run 1 was made from the uncommitted working tree, so its `git status` showed
this ticket's own edits and nothing else; the CLI rewrite was already restored.

`deno task check && deno task test && deno task test:db`:

```
ok | 76 passed | 0 failed (1s)
ok | 3 passed (17 steps) | 0 failed (18s)
```

### Decisions

- The smoke keeps its single two-second retry for a genuinely cold isolate. It
  was never the fix and the ticket asked for the cause, so it was not lengthened.
- The `NOTE` line stays in the output so a future caller that loads `.env`
  learns why the smoke ignores the environment.
- `deno.lock` gained `@std/dotenv@0.225.8`, pinned in the smoke import.
- Nothing was left undone.
