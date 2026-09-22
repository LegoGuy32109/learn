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

**Status:** ready-for-agent

- [ ] Pressing Enter in the answer field submits exactly once, with the same
      evidence and feedback as tapping Answer.
- [ ] The audit check above passes in `deno task audit:phone`.

## Verification

```bash
deno task audit:phone
```
