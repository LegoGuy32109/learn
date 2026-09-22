# 17 — Reload and browser Back land on the learning shell instead of the surface on screen

**What to build:** The surface a learner is looking at must come back after a
reload, and the URL must always name that surface. Today both the overview and
the learning shell live at `/learn/<lesson-id>`, and the boot routine picks
the learning shell whenever a checkpoint exists. Four reproducible cases from
the ticket 12 audit break the "reload at every surface" contract:

1. Start the lesson, tap the square Back on Card 1. The overview shows
   "Resume". Reload: the learning shell opens on Card 1, not the overview.
2. Start the lesson, press browser Back at the first learning step. The shelf
   shows, as required, but the URL stays `/learn/<lesson-id>`. Reload: the
   learning shell opens on Card 1, not the shelf.
3. On Card 2, press browser Back twice. The learning shell stays on screen
   while the URL becomes `/`. Reload: the shelf opens. The URL and the surface
   disagree after every browser Back that is not at the first step.
4. Finish the lesson to Learned, go Back to shelf, open the overview. Reload:
   the Learned summary opens, not the overview.

The fix is the implementer's call: encode the surface in the URL (for example
a distinct overview path), or make `popstate` and `nav.show` keep the URL and
`session.surface` in step, or both. The stable learning URL `/learn/<lesson-id>`
and the rule that Card and Question position stay out of the URL still hold.

**Reproduction:** `deno task audit:phone`. Failing checks:

- `reload · overview after Back from first Card · surface comes back` — expected
  `surface: "overview"`, received `surface: "learn"`, `cardHeading: "A fresh
  response can be reused"`.
- `first step · browser Back leaves the URL at the shelf path` — expected `/`,
  received `/learn/7a1f7700-0000-4000-8000-000000000001`.
- `reload · shelf after browser Back from first Card · surface comes back` —
  expected `surface: "shelf"`, received `surface: "learn"`.
- `browser Back mid-lesson · the URL always names the surface on screen` —
  second Back shows `learn` at `/`.
- `reload · overview of a Learned lesson comes back as the overview` — expected
  `overview`, received `learn`.

Code: `public/js/app.js` `boot()` and the `popstate` handler; `public/js/learn.js`
`goBack()` calls `nav.show("overview")` without a path.

**Also on production:** reproduced on 2026-09-22 against
`https://learn-joshhale.legoguy32109.deno.net` (revisions `h649s2fpr17r` and `p6jad39tqqge`) by
`deno task audit:prod`, the ticket 14 audit, which runs the same walk with the
production lesson path. The failing check names are the same.

**Blocked by:** None.

**Status:** done 9d309ee

- [x] Reload after square Back from Card 1 shows the overview with Resume.
- [x] Browser Back at the first learning step leaves the URL at `/` and a
      reload shows the shelf.
- [x] After any browser Back, the URL names the surface on screen, and a
      reload shows that surface.
- [x] Reload on the overview of a Learned lesson shows the overview.
- [x] The five audit checks above pass in `deno task audit:phone`; `deno task
      check`, `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task audit:phone
deno task check && deno task test && deno task e2e
```

## Report

### What changed

The overview and the learning shell keep sharing `/learn/<lesson-id>`, and Card
and Question position stay out of the URL. The surface is recorded on the
history entry instead: every `nav.show` now writes `{ surface }` with
`pushState` or `replaceState`, and boot and `popstate` both go through one
`restoreFromLocation()` that reads that record (`history.state.surface`, which
survives a reload and comes back with Back and Forward) and restores the flows
from the saved checkpoints. So the URL and the surface on screen never
disagree, and a reload shows the surface the learner was looking at.

Decisions, in `public/js/app.js`, `public/js/learn.js`, `public/js/drill.js`:

- Start or Resume replaces the overview's history entry with the learning
  shell's (`nav.show("learn", path, { replace: true })`). Browser Back from the
  learning shell therefore lands on the shelf at `/`, as `docs/first-milestone.md`
  requires at the first step, and consistently at every later step too. The
  overview is one square Back away.
- Square Back at the first Card (and on the Learned summary) rewrites the same
  entry as the overview, so a reload shows the overview with Resume.
- Closing the drill rewrites the drill entry as the overview, so Back after
  closing does not reopen a drill. Entering the drill still pushes, so browser
  Back from the drill returns to the overview with Resume every question, as the
  audit requires.
- A `/learn/<id>` URL typed or followed fresh carries no record and opens the
  overview, where Resume waits. `/learn/<id>/drill` opens the drill when a drill
  checkpoint exists and otherwise falls back to the overview, correcting the URL.
- Browser Back in the audit's mid-lesson probe now leaves the app on the second
  press (the stack above the shelf is one entry deep). The probe steps forward
  again and judges the app's own entries; the observation records it.

### Ticket checks

```
- reload · overview after Back from first Card · surface comes back        PASS
- first step · browser Back leaves the URL at the shelf path                PASS
- reload · shelf after browser Back from first Card · surface comes back    PASS
- browser Back mid-lesson · the URL always names the surface on screen      PASS
- reload · overview of a Learned lesson comes back as the overview          PASS
```

Also passing: `reload · card 1 of concept 1`, every other `reload · … · surface
comes back`, `drill · browser Back returns to the overview with Resume every
question`, and the e2e suite's reloads at Cards, feedback and in the drill.
### Verification

`deno task audit:phone` (both audit tests still exit non-zero because of checks
owned by tickets 18, 19, 22, 23 and 24; every check named by this ticket passes):

```
Adversarial probes: 18 passed, 3 failed, 4 observations
  Failed (other tickets): keyboard · Enter in the answer field submits the answer (24);
    wrap-up · a missed Concept is never re-asked immediately (22);
    options · MCQs in one Concept Check attempt do not all share one option permutation (23)
Learning loop walk: 305 passed, 8 failed, 5 observations
  Failed (other tickets): 6 × visual · … · bottom safe-area padding (18);
    2 × visual · overview … · every control is at least 44px (19, "Back to shelf" is 29px)
```

```
deno task check   -> ok (exit 0)
deno task test    -> ok | 110 passed | 0 failed
deno task e2e     -> ok | 8 passed | 0 failed
```

### Audit helper fix (asked for by the coordinator)

`tests/audit/support.ts` `projection()` looked up records by the bare ids
`checkpoint` and `progress`, but since ticket 08 the app keys projections per
revision and epoch (`checkpoint:<revisionId>:<epoch>`). Every projection read
returned null, which made seven walk checks vacuous or fail with "Cannot read
properties of null". The helper now matches the bare name as a prefix and takes
the newest epoch. Making the helper real exposed two audit expectations that
compared derived projections across a projection-clearing reload on the shelf,
where no lesson session exists to rebuild them: `reloadSame` now skips the
checkpoint comparison on the shelf, and the two drill snapshot checks compare
the immutable event streams byte for byte and the projections whenever the
earlier snapshot had them (`expectSameEvidence`). Nothing in the app changed
for these; the checkpoint is rebuilt from `navigation_events` when the lesson
opens, exactly as before.
