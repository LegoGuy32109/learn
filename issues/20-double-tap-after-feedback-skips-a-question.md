# 20 — A double tap on the action after feedback skips an unseen Question

**What to build:** Action handlers must be idempotent against a second tap
that lands before the first re-render. Every handler in `public/js/learn.js`
and `public/js/drill.js` awaits IndexedDB writes before `nav.refresh()`
replaces the DOM, so the old button stays clickable for tens of milliseconds.
A second tap on "Try another from this concept" runs `advance()` against the
already-advanced flow, whose `feedback` is now `null`; `advance` treats a
missing feedback as a wrong answer and drops another Question from the queue.
The learner never sees that Question, and with one Question left the second
tap ends the Check or the Wrap-up outright.

Guard the handlers: ignore actions while one is in flight, or make each action
carry the flow it was rendered from and drop it if the flow has moved. The same
guard protects Continue on a Card, where a second tap would record `card_seen`
for a Card the learner never saw (the audit's card double tap happened to pass
because the second tap advanced on the same flow, but the code path is
unguarded).

**Reproduction:** `deno task audit:phone`. Failing check:

- `double-tap · Try another after feedback moves to exactly the next unseen
  Question` — `expect(after.queue.length).toBe(before.queue.length - 1)`
  expected `2`, received `1`.

The probe answers the first Concept Check wrongly, then dispatches two
`click()` calls on `[data-action="advance"]` in one task. Manual: on a phone,
double-tap "Try another from this concept" and count the Questions asked.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Two taps within one render cycle on any learning or drill action have
      the effect of one tap.
- [ ] A unit or e2e test dispatches two synchronous clicks on the feedback
      action and asserts the queue shrank by exactly one.
- [ ] The audit check above passes in `deno task audit:phone`; `deno task
      check`, `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task audit:phone
deno task check && deno task test && deno task e2e
```
