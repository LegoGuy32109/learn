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

**Status:** ready-for-agent

- [ ] The overview Back control measures at least 44 by 44 pixels.
- [ ] The two audit checks above pass in `deno task audit:phone`.

## Verification

```bash
deno task audit:phone
```
