# 50 — Every progress-sync route answers 500 in production

**What to build:** Find why `GET /api/v1/progress/checkpoint`, `GET /api/v1/progress/learning-events`,
`GET /api/v1/progress/navigation-events` and `POST /api/v1/progress/learning-events` all answer
`500 Internal server error` against production, and fix it. The leading hypothesis, from the
evidence below, is that ticket 10's migration (the tables these routes read and write —
`progress_streams` and the event tables) was never run against the `learn-prod` Turso database,
even though the route code is deployed and live. Confirm the real cause before treating that as
the fix; a verification ticket does not run production migrations, so this is filed rather than
run here.

Found by ticket 27's golden-flow audit, walking the flow end to end against
`https://learn-joshhale.legoguy32109.deno.net`.

## The claim under test

Tickets 10 and 11 are merged, and ticket 27 is "Blocked by: None — every ticket it exercises is
merged," meaning the whole golden flow, including cross-device progress sync, should work against
production today.

## Why it is false

Every progress-sync route answers 500, unconditionally, for every account, every revision, and
every request shape tried, including a completely untouched revision (zero prior progress) and an
empty push (`events: []`). The break is total, not conditional on any particular event content:

```bash
# A freshly minted lessons:read token, a revision nothing has ever touched (fcb277f5-...):
curl -sS -o - -w '\n%{http_code}\n' \
  'https://learn-joshhale.legoguy32109.deno.net/api/v1/progress/checkpoint?revision=fcb277f5-8466-4288-88ea-e0634cd41c5e&epoch=0' \
  -H 'authorization: Bearer <lessons:read token>'
# -> {"type":"about:blank","title":"Internal server error","status":500,"detail":"The request could not be completed."}
# -> 500

curl -sS -o - -w '\n%{http_code}\n' \
  'https://learn-joshhale.legoguy32109.deno.net/api/v1/progress/learning-events?revision=fcb277f5-8466-4288-88ea-e0634cd41c5e&epoch=0' \
  -H 'authorization: Bearer <lessons:read token>'
# -> 500, same body

curl -sS -o - -w '\n%{http_code}\n' \
  'https://learn-joshhale.legoguy32109.deno.net/api/v1/progress/navigation-events?revision=fcb277f5-8466-4288-88ea-e0634cd41c5e&epoch=0' \
  -H 'authorization: Bearer <lessons:read token>'
# -> 500, same body

curl -sS -o - -w '\n%{http_code}\n' -X POST \
  'https://learn-joshhale.legoguy32109.deno.net/api/v1/progress/learning-events' \
  -H 'authorization: Bearer <lessons:write token>' -H 'content-type: application/json' \
  --data '{"lessonRevisionId":"fcb277f5-8466-4288-88ea-e0634cd41c5e","epoch":0,"events":[]}'
# -> 500, same body
```

Reproduced against three different revisions: a revision driven to Learned in this same audit run,
a revision only partway through with real offline-recorded events pending, and the completely
untouched revision above. All three 500 identically.

By contrast, every other authenticated route tried with the same tokens against the same account
answers normally: `GET /api/v1/shelf` (200, lists lessons), `GET
/api/v1/lessons/{lessonId}/revisions/{revisionId}` (200, full content). This rules out the account,
the bearer scopes (`lessons:read` / `lessons:write`, exactly what the OpenAPI document names for
these routes) and the revision lookup itself, all three of which those passing routes also
exercise. The failure is isolated to `src/server/routes/progress.ts`'s shared `readScope` helper
and the route bodies built on it — concretely, the first thing they do that no passing route does
is `dependencies.progress.stream(accountId, revision.lessonId)`
(`src/server/repositories/progress.ts:99`), `SELECT * FROM progress_streams WHERE account_id = ?
AND lesson_id = ?`, or the sibling reads/writes against the learning/navigation event tables. A
missing table or column on `learn-prod` (migration never applied there) would produce exactly this:
every one of these routes throws on its very first query, the app's generic error handler turns it
into 500, and nothing route-specific (event shape, revision, account) matters — matching every
observation above. `deno task test`'s `progress_test.ts` passes locally against the in-memory and
fixture-backed repositories, so this is not a logic bug the local suite would catch; it is
specific to what is actually applied to the production database, or possibly to a stale production
deploy that predates ticket 10 despite what `main` now contains.

## Consequence for the golden flow

Client-side learning is unaffected — IndexedDB is authoritative on-device, so a learner completes
an entire lesson to Learned, offline or online, without ever calling these routes. But **cross-device
sync does not work on production right now**: the outbox never drains (every push attempt gets a
500 and backs off), so a second signed-in device never sees progress made on the first, and
"come back online" never actually reaches the server. See ticket 27's report for the full audit
this was found during.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] The real cause is confirmed (read the production `learn-prod` schema state, or the actual
      deployed revision's code, rather than assuming the hypothesis above).
- [ ] All four routes named above answer correctly in production: `checkpoint` and the two pulls
      200 with an empty/selected result on data that exists, the push 200/207 as documented; the
      empty-push and untouched-revision reproductions above pass.
- [ ] A regression test (or an addition to `tests/audit-prod` or `tests/audit-golden`) asserts this
      against production so a future deploy or migration drift is caught before another audit finds
      it by hand.
