# 24 — Enter in the answer field does not submit the answer

**What to build:** The numeric and short-answer field is a bare `<input>` with
a sibling "Answer" button and no form or key handler. On a phone the keyboard's
return key does nothing; the learner has to dismiss the keyboard and find the
button. The plugin renderer submits on Enter (`renderer.html` binds `keydown`
Enter to the submit action). Wrap the field and button in a `<form>` whose
submit handler runs the same `submit` action, or bind Enter on the field.

**Reproduction:** `deno task audit:phone`. Failing check:

- `keyboard · Enter in the answer field submits the answer, as the plugin
  renderer does` — `expect(locator('.verdict')).toHaveText("Correct")`
  failed: element not found after filling the correct answer and pressing
  Enter.

Code: `src/client/learning/views.js` `answerForm()`, `src/client/ui/controls.js`
`bind()`.

**Blocked by:** None.

**Status:** done de1242e

- [x] Pressing Enter in the answer field submits exactly once, with the same
      evidence and feedback as tapping Answer.
- [x] The audit check above passes in `deno task audit:phone`.

## Verification

```bash
deno task audit:phone
```

## Report

Changed `answerForm` in `src/client/learning/views.js`: the field and button are wrapped in
`<form class="fieldwrap" data-submit="submit">`, the button is `type="submit"` with no
`data-action`, and the input has `autocomplete="off"`. Changed `bind` in
`src/client/ui/controls.js`: every `form[data-submit]` gets a submit listener that calls
`preventDefault()` and runs `onAction(form.dataset.submit)`. Enter in the field triggers the
browser's implicit submission and the button click triggers the same submit event, so the
`submit` action in `learn.js` and `drill.js` runs exactly once either way and reads `#answer`
as before. `learn.js` and `drill.js` were not touched. The `.fieldwrap` styles apply to the
form unchanged.

Passing in `tests/audit/last-probes.md`:

```
- keyboard · Enter in the answer field submits the answer, as the plugin renderer does
```

The walk's "empty answer" observation still records a blank Answer tap as graded, the same as
before and as the plugin renderer does.

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
