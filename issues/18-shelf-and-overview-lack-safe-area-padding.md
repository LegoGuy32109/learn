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

**Status:** done de1242e

- [x] `.page` bottom padding includes `env(safe-area-inset-bottom, 0px)`.
- [x] The five audit checks above pass in `deno task audit:phone`.

## Verification

```bash
deno task audit:phone
```

## Report

Changed `public/css/app.css`: `.page` padding is now
`calc(var(--a-pad)*1.35) calc(var(--a-pad)*1.35) calc(var(--a-pad)*1.35 + env(safe-area-inset-bottom,0px))`,
the same shape `.shell` uses. Nothing else moved: side and top padding are unchanged.

Passing in `tests/audit/last-run.md` after `deno task audit:phone`:

```
- visual · shelf fresh · bottom safe-area padding on page shelf
- visual · overview fresh · bottom safe-area padding on page overview
- visual · overview after Back from first Card · bottom safe-area padding on page overview
- visual · shelf in progress after close · bottom safe-area padding on page shelf
- visual · shelf after browser Back from first Card · bottom safe-area padding on page shelf
- visual · shelf Learned · bottom safe-area padding on page shelf
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
