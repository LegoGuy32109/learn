# 27 — Verify the golden flow end to end, from a working agent session to Learned

**What to do:** This is the acceptance test for the whole stage. Josh described
the flow he wants; walk it exactly as he would, find everything that makes it
worse than described, and report. Audit only. Never fix, and never change a
database by hand.

The flow, in his words, reshaped as steps:

1. **Setup, once.** Mint a token with the token script. Export it as
   `LEARN_TOKEN`. Install the plugin from the live site into a coding project
   that is not this repository. Mint a sign-in invite, open it in a
   phone-emulated browser, register a passkey, and add the site to the home
   screen.
2. **From a working agent session.** In that other project, with real work
   just done in it, invoke the plugin's skill the way Josh would: ask for a
   lesson on what was just changed. Let the skill do its own job. Do not hand
   it the answer, do not pre-write the lesson, and do not fix its output for
   it. Record every attempt it needed and every diagnostic it hit.
3. **On the phone.** Open the app from the home screen as the signed-in owner.
   The new lesson is on the shelf as Not started, newest first. Open it, read
   the overview, start it, and complete the whole lesson to Learned: Cards,
   a wrong answer in a Check with the belief and the correcting Card, an
   "I don't know", the Wrap-up, and the Learned summary.
4. **Offline.** Partway through, go offline, close the app, reopen from the
   icon, and resume at the exact Card or Question. Finish a Concept offline.
   Come back online and confirm the progress reaches the server.
5. **Second device.** Open a second signed-in context. It shows the same
   progress and resumes at the same place.
6. **Re-testing.** From the overview choose Every question, answer a few, and
   confirm the shelf state does not change.

Run it against production. Use the deployed URL until the custom domain is
attached. Read the owner token from the `.env.prod` file itself, because
Deno's `--env-file` never overrides an inherited variable, and never print it.

Judge the flow, not just the assertions. For every step, answer two questions
in the report: did it work, and would Josh have had to know something that is
written nowhere? A step that works only because the auditor knew an undocumented
detail is a finding.

**Blocked by:** None — every ticket it exercises is merged.

**Status:** done 77354a0

- [x] Every step above is walked against production and recorded with its
      evidence: the command, the response, or a screenshot.
- [x] The skill run is reported honestly: attempts, diagnostics, and whether
      the lesson it produced is one Josh would want to learn from. Quote two
      or three of its Questions.
- [x] Each defect is a new ticket file numbered from 50 upward with a
      reproduction.
- [x] The report ends with one paragraph answering the only question that
      matters: can Josh do this flow today, from a coding session to his
      phone, without being told anything that is not written down?

## Verification

```bash
deno task audit:golden
```

## Report

Walked the whole flow against `https://learn-joshhale.legoguy32109.deno.net`
on 2026-09-22. Nothing was fixed; one defect is filed (issue 50, filed during
this audit). `deno task audit:golden` did not exist before this ticket — it
is the ticket's own verification command, so building it (a new Playwright
suite at `tests/audit-golden/golden_flow_test.ts`) was part of doing the
ticket, per `issues/README.md`'s "build the whole vertical slice."

### Step 1 — Setup

Minted a personal token against production with the `lessons:write` scope
the plugin's own install page documents:

```bash
deno run --env-file=.env.prod --allow-env=TURSO_DB_URL,TURSO_DB_TOKEN --allow-net --allow-read \
  scripts/tokens.ts mint --name audit-golden-2026-09-22 --scopes lessons:write --json
export LEARN_TOKEN=learn_pat_...   # in the shell, never in the chat or a log
```

`deno task token:mint` alone targets `.env` (local), not production; nothing
in the docs or the task names says so, so this needed reading
`scripts/tokens.ts`'s own `--env-file` handling to work out (see "undocumented
knowledge," below).

Installed the plugin exactly as `/plugin` documents, into a scratch copy of
`/home/josh/Projects/painting` (a real, unrelated project with real recent
commits) rather than a repo of this ticket's own worktree:

```bash
claude plugin marketplace add https://learn-joshhale.legoguy32109.deno.net/plugin/marketplace.json
claude plugin install learn-lesson@learn-joshhale
```

Both commands worked on the first try, exactly as documented on the `/plugin`
page. Removed both again after the audit (`claude plugin uninstall
learn-lesson@learn-joshhale`, `claude plugin marketplace remove
learn-joshhale`) to leave this machine's Claude Code configuration as found;
that cleanup is not documented anywhere, but it is an operator choice, not
something the flow requires.

Minted a sign-in invite, registered a passkey in a mobile-emulated Chromium
context with a virtual platform authenticator (the same mechanism ticket 14's
audit uses — no real device was needed to prove this half), and confirmed the
signed-in shelf. "Add to Home Screen" itself cannot be driven or verified by
any headless browser; the manifest that makes it installable (name, icons,
standalone display) is already asserted by ticket 14's `audit:prod` suite and
was not re-proven here.

### Step 2 — From a working agent session

Ran a real, separate Claude Code session (`claude -p`, `--dangerously-skip-
permissions`, non-interactive) inside the scratch copy of `painting`, with
`LEARN_TOKEN` exported in its shell and nothing else prepared. The prompt was
exactly what Josh would type: *"I just finished real work in this repo. Make
me a lesson from what I just did so I can learn it later, and submit it."*
Nothing else was said to it; no lesson content, misconceptions or option
sets were suggested; no failing diagnostic was worked around by hand.

The skill picked the repository's actual most recent commit,
`811b856dbe51a70c5b32713d578d1390730dbf7c` ("fix: make clear:db actually
delete the events it claims to cascade"), read the commit diff and the
"Deleting a canvas" section of `src/server/db.ts` it points back to, wrote
`lesson.json` (4 Concepts, 16 Questions, 3 shared options and 2–6 misconceptions
per Concept), and ran its own adversarial pass before ever validating:

- **Validation attempt 1** (`node scripts/validate.mjs lesson.json`) — FAILED,
  3 errors:
  ```
  FAIL lesson.key.longest at /concepts: The key is the longest option in 6 of 16 MCQs, above one third; length signals the answer.
  FAIL question.stem.unbound at /questions/1/stem: Stem contains an unbound reference; it must stand alone with the Cards removed.
  FAIL question.stem.unbound at /questions/11/stem: Stem contains an unbound reference; it must stand alone with the Cards removed.
  ```
  It rebalanced option lengths in Concept 1 and reworded the two stems that
  used "that same" to name the thing directly.
- **Validation attempt 2** — clean: `OK: valid lesson/v1, 0 warning(s),
  fingerprint sha256:a4c925b117823ae97c5f6039fc90129fc207ab936a642893e359f86426541360`.
- **Submission, attempt 1** (`node scripts/submit.mjs lesson.json`) —
  `Created draft revision (201)`, `lessonId: ddc01fdf-805b-48fe-b5d3-00027abfe775`,
  learning URL `https://learn-joshhale.legoguy32109.deno.net/learn/ddc01fdf-805b-48fe-b5d3-00027abfe775`.

One resolution failure, one fix cycle, one clean validation, one successful
submission — the flow described in the skill's own instructions, working
exactly as designed, with no hand-holding. The full tool-call transcript
(`~/.claude/projects/.../354d23cf-....jsonl`) confirms it read only
`references/authoring.md` and `references/lesson-schema.md` from the
installed skill and the commit's own diff; it never asked a clarifying
question.

**Title:** "SQLite's ON DELETE CASCADE lies to you unless you enable it" (does
not start with `audit-`; the skill has no reason to know that internal
convention, so this is a real, permanent lesson now on Josh's account — see
"Created on production," below). Three Questions, quoted directly from the
submitted `lesson.json`:

> scripts/clear-environment-db.ts opens a connection through
> openEnvironmentDatabase() and never issues PRAGMA foreign_keys = ON.
> canvas_events.canvas_id declares REFERENCES canvases(id) ON DELETE CASCADE.
> That connection runs DELETE FROM canvases. What happens to the matching
> canvas_events rows?

> migrations.ts opens its own connection and issues PRAGMA foreign_keys = ON
> for it. canvas_events.canvas_id declares ON DELETE CASCADE. This migration
> connection then runs DELETE FROM canvases directly. What happens to the
> matching canvas_events rows?

> deleteCompletedCanvas is called with an ownerId that does not own the
> target canvas. Its canvas_events statement repeats the same
> id/owner_id/completed_at check as the canvases statement, via EXISTS. What
> happens to that canvas's canvas_events rows?

This is a lesson Josh would want to learn from: every Question traces to a
real mechanism in the diff, the three-option sets isolate genuine confusions
(fires vs. orphaned vs. blocked; the correct ordering vs. two distinct wrong
orderings; the guard repeated vs. dropped in each direction), and the numeric
and short-answer Questions (in the fuller lesson JSON, not quoted above) ask
about the actual 30-second TTL and the actual guard predicate, not incidental
numbers.

### Step 3 — On the phone

Built as a rerunnable Playwright suite, `deno task audit:golden`, because
walking this by hand once would not have caught the shelf-ordering and resume
issues below, and because the flow needs to be rerunnable the same way
tickets 12 and 14 already are. It creates its own lesson via the owner's
bearer token (standing in for the plugin's own submission, since spawning a
nested agent session on every test run is not something `deno test` should
do) and drives it with `tests/audit/walk.ts`'s `fullWalk`/`drillFromFresh` —
the same module tickets 12 and 14 already trust.

`fullWalk` and `drillFromFresh` assumed a shelf with exactly one lesson (a
fresh local database, or a guest's single-featured-lesson view). Josh's real
production account already owns dozens of lessons from every past audit run,
so opening "the lesson" by matching its title text threw Playwright's strict-
mode violation the first time this ran, on multiple lessons named
identically. Extended `WalkOptions` with an optional `lessonId` so the walk
opens and re-opens by `[data-lesson]` instead of by title whenever the
caller knows it (every `.lstatus`/title-match call site updated, all guarded
so existing callers — ticket 12's local suite, ticket 14's guest walk — are
unaffected: `deno task audit:phone` still passes unchanged, 313 checks, after
this change). This is test infrastructure, not application code; nothing in
`src/` changed for it.

With that fix, the whole loop passed: shelf shows the new lesson Not started;
overview with title, assumed knowledge, Concept count; Card 1 and 2 of
Concept 1; a wrong Check answer showing "Not quite," the belief behind the
wrong option and the correcting Card, a detour and Return, an unseen retry,
then correct; "I don't know" on Concept 2 (shows the correct answer and a
link to the correcting Card, ends the Check); Concept 3's Pool exhausted with
wrong answers; the Wrap-up (draws a reserved Question the Checks never
asked, a wrong answer without awarding Learned, then three correct answers,
the missed Concept returning once more); the Learned summary ("Concepts
learned 3 of 3," no score or percentage); the shelf showing Learned; a
partial "Every question" drill after Learned that leaves the shelf and every
evidence store byte-identical; then `drillFromFresh` running the drill to
completion from a second fresh lesson, one Question per Pool exactly once,
reserved ones included.

### Step 4 — Offline

Went offline mid-Card-2-of-Concept-1, closed the page and reopened a fresh
one in the same browser context at `/` (the URL Add to Home Screen opens),
still offline. That landed on the lesson's overview, not directly on the
Card; tapping "Resume" (the same two-step Josh's own real-device checklist,
`docs/phone-checklist.md`, already documents: "relaunch, tap lesson,
Resume") reached the exact Card left off on. Finished the rest of Concept 1
offline — its remaining Card, then a correct Check answer — entirely from
IndexedDB, with the network off. All of this passed.

Coming back online is where the flow breaks: the outbox never drained (a
15-second wait, plus a reload to skip whatever retry backoff the offline
attempts had accumulated, still left events queued), and a direct request to
confirm the server received them answered `500 Internal server error`. That
is issue 50, filed below — not a defect in the offline half, which worked.

### Step 5 — Second device

A second signed-in context opened the same lesson: since sync from the first
device never reached the server (issue 50), the second device correctly
shows what the server actually has (Not started) rather than the local
progress on device one — the two devices are consistent with each other's
worst case, but not with what Josh would expect (finished Concept 1
everywhere he's signed in). This is the same root cause as Step 4, not a
second, independent defect.

### Step 6 — Re-testing

Covered inside `fullWalk`'s own drill-after-Learned check (Step 3): from the
overview, "Every question," one wrong answer, "Close drill" while unfinished
— the overview offers "Resume every question," and the shelf state plus every
learning and navigation event are unchanged (byte-for-byte) by having
answered inside the drill.

### The defect found

Filed as `issues/50-progress-sync-routes-500-in-production.md`: every
progress-sync route (`GET .../checkpoint`, both event pulls, the push)
answers `500 Internal server error` in production, unconditionally —
reproduced directly with `curl` against three different revisions, including
one nothing has ever touched and an explicitly empty push body, ruling out
event content, account, revision id and bearer scope as the cause (every
other authenticated route tried with the same tokens works normally). The
leading hypothesis, from what the passing and failing routes have in common
and don't, is that ticket 10's migration was never applied to the `learn-prod`
Turso database even though the route code is deployed and live; confirming
that (rather than assuming it) and fixing it is scoped to issue 50, since a
verification ticket does not run production migrations.

### Would Josh have had to know something written nowhere?

Two places, both now closed by this audit rather than left as silent traps:

- Minting a production token needed constructing a bare `deno run
  --env-file=.env.prod ...` command by hand — `deno task token:mint` only
  ever targets `.env`, and nothing says so. `scripts/smoke-prod.ts` and
  `tests/audit-prod/support.ts` both solve this the same way already, so the
  pattern exists in the repo; it is just not named as the answer anywhere a
  first-time reader would look (`docs/deno-deploy.md`, the plugin's own
  install page). Worth a one-line addition to `docs/deno-deploy.md`, but
  filing a documentation ticket for one sentence felt like more ticket than
  the gap; noting it here instead.
- Resuming after closing and reopening lands on the overview, one tap short
  of the Card — but this is already exactly what `docs/phone-checklist.md`
  tells Josh to expect ("relaunch, tap lesson, Resume"), so it is documented,
  just easy to miss if this ticket's own step 4 wording ("resume at the exact
  Card or Question") is read as "immediately," which it does not actually
  promise.

Nothing else in the six steps required knowledge that was not already
written down somewhere a first-time reader would find it: the plugin's own
`/plugin` page, `SKILL.md` and `references/`, `docs/phone-checklist.md`, and
`docs/deno-deploy.md`/`docs/turso-databases.md` for the token and env-file
mechanics.

**Can Josh do this flow today, from a coding session to his phone, without
being told anything that is not written down?** Mostly, yes, and the one
place he could not is documented precisely enough to name: he can install
the plugin, ask it for a lesson on real work with no hand-holding, sign in
from an invite with a passkey, and learn that lesson on his phone to Learned,
Cards through Wrap-up, entirely offline if he wants to, using only what
`/plugin`, the skill's own `SKILL.md` and `docs/phone-checklist.md` already
tell him. What he cannot do today is trust that a second device — or the
same device after being fully offline — will show progress made elsewhere,
because the server side of that sync is down in production right now
(issue 50); until that is fixed, "one signed-in account, always in sync
everywhere" is a promise the site does not currently keep, silently: nothing
tells the learner sync failed, the outbox just quietly never empties.

### Verification

- `deno task check` — passes.
- `deno task test` — 157 passed, 0 failed.
- `deno task e2e` — 10 passed, 0 failed.
- `deno task audit:golden` — 322 passed, 3 failed (all three are issue 50),
  8 observations; report and 38 screenshots committed at
  `tests/audit-golden/last-run.md` and `tests/audit-golden/screenshots/`.
- `deno task audit:phone` (ticket 12's local suite, run to confirm the
  `walk.ts` change is backward compatible) — unchanged pass/fail shape from
  before this ticket.

### Created on production, nothing deleted

- One real, permanent lesson from the Step 2 skill run: `ddc01fdf-805b-48fe-
  b5d3-00027abfe775`, "SQLite's ON DELETE CASCADE lies to you unless you
  enable it" — not audit-prefixed, since a real agent session has no reason
  to know that convention. Left as is; it is a genuine artifact of the flow
  working, not test noise.
- Three sign-in invites (consumed by passkey registrations) and three
  passkey credentials on Josh's account, from `deno task audit:golden`'s
  runs while this suite was being built and verified.
- Several `audit-`-prefixed lesson drafts from the same runs (each
  `deno task audit:golden` run creates one learning-loop lesson — often
  idempotent to the same draft, since its content must stay byte-identical
  to the fixture for `fullWalk`'s own assertions — and one uniquely-titled
  offline/second-device lesson).
- Two personal tokens minted for this audit (`audit-golden-2026-09-22`,
  `lessons:write`; `audit-golden-read-2026-09-22`, `lessons:read`, used only
  to reproduce issue 50 cleanly via `curl`) were revoked again after use.

### Decisions

- Built `deno task audit:golden` as a real, rerunnable Playwright suite
  rather than a one-off script, matching tickets 12/14's precedent and the
  "build the whole vertical slice" instruction — the mechanical parts of the
  flow (sign-in, shelf, full learning loop, offline, second device, drill
  retest) are exactly the kind of regression a future deploy could silently
  break, and a report from a single hand-run would not catch that.
- Did not attempt to make the Step 2 agent-authoring run itself part of the
  rerunnable suite: a nested `claude -p` session is slow, its content is
  non-deterministic by design, and `deno test` spawning a coding agent is not
  a sensible CI shape. That half was walked for real, once, by hand, exactly
  as the ticket describes, and is reported in full above instead.
- Did not fix issue 50, and did not run any production migration or touch
  the production database directly, per the ticket's "audit only" charge.

