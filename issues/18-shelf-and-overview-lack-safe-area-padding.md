# 18 — Shelf and overview have no bottom safe-area padding

**What to build:** `.page` (the shelf and the overview) must include
`env(safe-area-inset-bottom)` in its bottom padding, as `.shell` already does.
Both surfaces pin their actions to the bottom with `margin-top: auto` inside a
`min-height: 100dvh` column, so on a phone with a home indicator the "Every
question" action and the account panel sit under the indicator. The visual
contract in `docs/first-milestone.md` requires bottom safe-area padding.

**Reproduction:** `deno task audit:phone`. Failing checks, one per shelf or
overview surface visited:

- `visual · shelf fresh · bottom safe-area padding on page shelf`
- `visual · overview fresh · bottom safe-area padding on page overview`
- `visual · shelf in progress after close · bottom safe-area padding on page shelf`
- `visual · shelf after browser Back from first Card · bottom safe-area padding on page shelf`
- `visual · shelf Learned · bottom safe-area padding on page shelf`

The check walks the CSSOM for every rule matching the surface's container and
asserts one of them sets a bottom padding containing `safe-area-inset-bottom`.
`public/css/app.css` sets `.page{...padding:calc(var(--a-pad)*1.35)...}` with
no inset; `.shell` has `calc(18px + env(safe-area-inset-bottom,0px))`.
Screenshot `tests/audit/screenshots/02-overview-fresh-dark.jpg` shows the
"Every question" action flush with the bottom edge.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] `.page` bottom padding includes `env(safe-area-inset-bottom, 0px)`.
- [ ] The five audit checks above pass in `deno task audit:phone`.

## Verification

```bash
deno task audit:phone
```
