# 19 — The overview's Back to shelf control is 29 pixels tall

**What to build:** Every control is at least 44 pixels on its shortest side.
The overview renders `backButton("shelf", "Back to shelf")`, a `<button
class="back">`, directly inside `.page.overview`. The only size rules for
`.back` are scoped to `.shellhead .back` and `.actions .back`, so this button
falls back to the browser default and renders 29 pixels tall and about 30
wide, centred at the top of the page (see
`tests/audit/screenshots/02-overview-fresh-light.jpg`). Give it the 44 by 44
square treatment the shell header uses, or place it in a header row.

**Reproduction:** `deno task audit:phone`. Failing checks:

- `visual · overview fresh · every control is at least 44px on its shortest side`
- `visual · overview after Back from first Card · every control is at least 44px on its shortest side`

Failing assertion: `expect(small).toEqual([])` received
`[{ label: "Back to shelf", w: 30, h: 29 }]` (width may vary by a pixel).

**Also on production:** reproduced on 2026-09-22 against
`https://learn-joshhale.legoguy32109.deno.net` revision `h649s2fpr17r` by
`deno task audit:prod`, the ticket 14 audit. Revision `p6jad39tqqge`,
deployed later the same day, no longer fails these checks.

**Blocked by:** None.

**Status:** done de1242e

- [x] The overview Back control measures at least 44 by 44 pixels.
- [x] The two audit checks above pass in `deno task audit:phone`.

## Verification

```bash
deno task audit:phone
```

## Report

Changed `public/css/app.css`: the 44 by 44 square rule now reads
`.close,.shellhead .back,.overview>.back{width:44px;height:44px;...}`, so the overview's
Back to shelf button gets the shell header's treatment. I chose the extra selector over a
header row because the overview markup and `overview.js` stay untouched.

Passing in `tests/audit/last-run.md`:

```
- visual · overview fresh · every control is at least 44px on its shortest side
- visual · overview after Back from first Card · every control is at least 44px on its shortest side
```

Audit run on this branch (`deno task audit:phone`, three runs, identical results): walk
307 passed / 11 failed, probes 7 passed / 7 failed. Every failure belongs to tickets
17, 20 and 21 (reload landing, double-tap, dead square Back), which another worker owns,
or to a stale audit helper: `projection()` in `tests/audit/support.ts` looks up the
projection id `checkpoint` / `progress`, but since the ticket 08 merge the keys are
`checkpoint:<revisionId>:<epoch>`, so the seven "Cannot read properties of null" walk
checks (Back inspection checkpoint, Try another queue, I don't know state, wrap-up
Learned 2 to 4, Learned summary) read null. That predates this branch and is outside
these tickets; I tried a prefix match and reverted it because it uncovered further stale
expectations, which need their own ticket.

`deno task check`: passes. `deno task test`: 109 passed, 0 failed. `deno task e2e`:
7 passed, 0 failed.
