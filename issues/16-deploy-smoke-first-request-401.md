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

**Status:** ready-for-agent

- [ ] The cause is named in the report with the evidence that proves it, not
      a guess.
- [ ] A database or network failure during authentication answers `500` with
      a problem document, and a unit test proves it.
- [ ] Every response carries a header naming the serving revision, and the
      smoke prints it and the response body on any failure.
- [ ] Three consecutive `deno task deploy` runs end green with a clean tree.
- [ ] `deno task check`, `deno task test` and `deno task test:db` pass.

## Verification

```bash
deno task deploy && git status --short
deno task check && deno task test && deno task test:db
```
