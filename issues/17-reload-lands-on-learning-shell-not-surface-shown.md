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

**Status:** ready-for-agent

- [ ] Reload after square Back from Card 1 shows the overview with Resume.
- [ ] Browser Back at the first learning step leaves the URL at `/` and a
      reload shows the shelf.
- [ ] After any browser Back, the URL names the surface on screen, and a
      reload shows that surface.
- [ ] Reload on the overview of a Learned lesson shows the overview.
- [ ] The five audit checks above pass in `deno task audit:phone`; `deno task
      check`, `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task audit:phone
deno task check && deno task test && deno task e2e
```
