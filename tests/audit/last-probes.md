## Adversarial probes

3 passed, 11 failed, 4 observations

### Failed

- double-tap · Try another after feedback moves to exactly the next unseen Question
  ```
  expect(received).toBe(expected) // Object.is equality
  Expected: 2
  Received: 1
  ```
- keyboard · Enter in the answer field submits the answer, as the plugin renderer does
  ```
  expect(locator).toHaveText(expected) failed
  Locator: locator('.verdict')
  Expected: "Correct"
  Timeout: 5000ms
  Error: element(s) not found
  Call log:
    - Expect "toHaveText" locator('.verdict') with timeout 5000ms
    - waiting for locator('.verdict')
  ```
- back · unanswered Concept Check Question · the square Back control does something when a prior surface exists
  ```
  expect(received).not.toEqual(expected) // deep equality
  Expected: not {"belief": null, "cardHeading": null, "controls": ["", "", "I don't know"], "corrects": null, "correctsFirst": null, "drillLabel": null, "eyebrow": null, "feedback": null, "fieldPresent": false, "fieldValue": null, "from": "Concept check · Freshness and age", "heading": "How browser HTTP caching works", "hint": null, "notice": null, "options": ["Reuse the stored response without contacting the origin at all.", "Send a conditional request and reuse the stored body only on a 304.", "Fetch a complete new response, because the stored copy must not be served."], "rail": ["100%", "0%", "0%"], "startLabel": null, "status": null, "stem": "A browser holds a stored response with Cache-Control: max-age=60 and a current age of 20 seconds. A matching request arrives. What may the cache do?", "summaryLines": [], "surface": "learn", "url": "/learn/7a1f7700-0000-4000-8000-000000000001", "verdict": null}
  ```
- back · wrong-answer feedback · the square Back control does something when a prior surface exists
  ```
  expect(received).not.toEqual(expected) // deep equality
  Expected: not {"belief": "A cache has to check with the origin before every reuse, even while the response is fresh.", "cardHeading": null, "controls": ["", "Review the correcting card", "", "Try another from this concept"], "corrects": "A fresh response can be reused", "correctsFirst": "While a stored response is fresh, a cache may serve it to a matching request without contacting the origin at all. That is the whole point of freshness: it is a permission to reuse, granted in advance by the server, so the browser can answer from disk in a few milliseconds instead of waiting on a round trip.", "drillLabel": null, "eyebrow": "Corrected by", "feedback": "Validation is for stale responses. This one is still fresh, so the origin told the cache not to ask yet.", "fieldPresent": false, "fieldValue": null, "from": null, "heading": "How browser HTTP caching works", "hint": null, "notice": null, "options": [], "rail": ["100%", "0%", "0%"], "startLabel": null, "status": null, "stem": null, "summaryLines": [], "surface": "learn", "url": "/learn/7a1f7700-0000-4000-8000-000000000001", "verdict": "Not quite"}
  ```
- back · correcting Card in the learning shell · the square Back control does something when a prior surface exists
  ```
  expect(received).not.toEqual(expected) // deep equality
  Expected: not {"belief": null, "cardHeading": "A fresh response can be reused", "controls": ["", "", "Return to questions"], "corrects": null, "correctsFirst": null, "drillLabel": null, "eyebrow": "Freshness and age · Card 1 of 2", "feedback": null, "fieldPresent": false, "fieldValue": null, "from": null, "heading": "How browser HTTP caching works", "hint": null, "notice": "Correcting card. Review this idea, then return to the question.", "options": [], "rail": ["100%", "0%", "0%"], "startLabel": null, "status": null, "stem": null, "summaryLines": [], "surface": "learn", "url": "/learn/7a1f7700-0000-4000-8000-000000000001", "verdict": null}
  ```
- back · correcting Card · Back returns to the Question it interrupted, as it does in drill
  ```
  expect(received).toBe(expected) // Object.is equality
  Expected: "Not quite"
  Received: null
  ```
- back · first Card of Concept 2 · the square Back control does something when a prior surface exists
  ```
  expect(received).not.toEqual(expected) // deep equality
  Expected: not {"belief": null, "cardHeading": "Validators name a version", "controls": ["", "", "Continue"], "corrects": null, "correctsFirst": null, "drillLabel": null, "eyebrow": "Validators and conditional requests · Card 1 of 2", "feedback": null, "fieldPresent": false, "fieldValue": null, "from": null, "heading": "How browser HTTP caching works", "hint": null, "notice": null, "options": [], "rail": ["100%", "0%", "0%"], "startLabel": null, "status": null, "stem": null, "summaryLines": [], "surface": "learn", "url": "/learn/7a1f7700-0000-4000-8000-000000000001", "verdict": null}
  ```
- browser Back mid-lesson · the URL always names the surface on screen
  ```
  expect(received).toBe(expected) // Object.is equality
  Expected: "/"
  Received: "/learn/7a1f7700-0000-4000-8000-000000000001"
  ```
- reload · overview of a Learned lesson comes back as the overview
  ```
  expect(received).toBe(expected) // Object.is equality
  Expected: "overview"
  Received: "learn"
  ```
- wrap-up · a missed Concept is never re-asked immediately (200 seeds, three Concepts)
  ```
  expect(received).toEqual(expected) // deep equality
  - Expected  -  1
  + Received  + 70
  - Array []
  + Array [
  +   3,
  +   5,
  +   6,
  ```
- options · MCQs in one Concept Check attempt do not all share one option permutation
  ```
  expect(received).toBeGreaterThan(expected)
  Expected: > 1
  Received:   1
  ```

### Observations

- empty answer: Tapping Answer with a blank field on "A response arrives at a browser with Cac" is graded Not quite and recorded as answer ""; the plugin renderer grades a blank field the same way.
- browser Back mid-lesson: From Card 2, one browser Back shows learn at /learn/7a1f7700-0000-4000-8000-000000000001; a second shows learn at /; reloading then shows shelf at /.
- overview after Learned: The overview of a Learned lesson offers "Resume".
- wrap-up requeue: 68 of 200 seeds re-ask the missed Concept as the very next Question; e.g. seeds 3, 5, 6, 10, 11.

### Passed

- double-tap · Continue on Card 1 advances one Card and marks only Card 1 Seen
- listeners · no pageerror during the probes
- listeners · no console error or warning during the probes
