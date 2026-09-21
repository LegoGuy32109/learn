# 15 — Verify the learning loop on a phone viewport

**What to do:** Audit the learning flow independently, the way the Codex
session audited the first milestone: drive the running app with Playwright at
390 by 844, do not reuse the implementers' tests, and try to break the
contract. Report every defect as a new ticket file in the `issues` directory with a
reproduction script. Do not fix anything.

Walk the whole path from a fresh browser: shelf, overview, every Card, a wrong
answer in every Concept Check, "I don't know" in one, the corrective Card and
Return to questions, Back and close at the first learning step, browser Back,
every Wrap-up Question including a wrong one that returns later, and Learned.
Reload at every distinct surface and confirm the exact position, Question,
option order, retry queue and feedback state come back. Then run drill mode
end to end with a reload in the middle and confirm shelf state never changed.

Check the plugin rules that are not the author's to relax, from the plugin
`SKILL.md`: exactly three shared options per Concept, feedback on every option,
"I don't know" on every Question with no penalty, wrong answers re-asked from
an unseen Question, Learned only in the Wrap-up, never a score, streak,
difficulty, time estimate or the word mastery anywhere in the DOM.

Check the visual contract in `docs/first-milestone.md`: every control at least
44 pixels on its shortest side, no horizontal overflow, safe-area padding,
light and dark schemes, and "I don't know" contained away from the screen edge.

Attach `pageerror` and `console` listeners for the whole run. A blank panel is
a failure.

**Blocked by:** 02 — Lesson content follows the plugin model; 10 —
Every-question drill mode.

**Status:** ready-for-agent

- [ ] The audit script lives under the tests directory as a phone-sized
      Playwright suite that the swarm can rerun, separate from the happy path.
- [ ] Every surface has a reload assertion.
- [ ] Every forbidden word and metric is asserted absent from the DOM at every
      surface.
- [ ] Every defect found has its own ticket file with a reproduction and the
      failing assertion. The report lists passes and failures with counts.
- [ ] Screenshots of each surface in light and dark schemes are attached to
      the report.
