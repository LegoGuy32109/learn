## Golden flow

322 passed, 3 failed, 8 observations

### Failed

- offline · back online, the outbox drains (the client pushed every offline event)
  ```
  the outbox never emptied within 15s of reconnecting (after a reload to skip backoff)
  expect(received).toBe(expected) // Object.is equality
  Expected: true
  Received: false
  ```
- offline · the server holds the offline-completed Concept once back online
  ```
  GET /api/v1/progress/checkpoint -> 500: {"type":"about:blank","title":"Internal server error","status":500,"detail":"The request could not be completed."}
  expect(received).toBe(expected) // Object.is equality
  Expected: 200
  Received: 500
  ```
- second device · a second signed-in context shows the same progress and resumes at the same place
  ```
  expect(locator).toHaveText(expected) failed
  Locator:  locator('.overview .state')
  Expected: "In progress"
  Received: "Not started"
  Timeout:  5000ms
  Call log:
    - Expect "toHaveText" locator('.overview .state') with timeout 5000ms
    - waiting for locator('.overview .state')
  ```

### Observations

- token source: The owner token came from the .env.prod file.
- home screen: "Add to Home Screen" itself is not something a headless browser can drive or verify; the manifest that makes it installable (name, icons, standalone display) is already asserted by ticket 14's audit_prod suite, so this run only re-proves the sign-in half.
- wrap-up retry: The missed Concept came back as Wrap-up Question 4 of 4, asked with the same Question.
- Learned summary line: The Learned summary shows ["Concepts learned\n3 of 3"]; a count, never a score.
- drill option order · Freshness and age: 2 distinct option order(s) across this Concept's MCQs in one run.
- drill option order · Validators and conditional requests: 2 distinct option order(s) across this Concept's MCQs in one run.
- drill option order · Cache directives and revalidation: 2 distinct option order(s) across this Concept's MCQs in one run.
- learning loop: fullWalk carries the Cards, a wrong Check answer with its belief and correcting Card, an unseen retry, a correct answer, "I don't know" on another Concept, the Wrap-up (which draws a reserved Question the Checks never asked) and the Learned summary, then opens "Every question", answers one wrong and closes the drill unfinished, asserting the shelf and evidence stores are unchanged by it. drillFromFresh separately runs the drill to completion from a fresh state.

### Passed

- setup · a sign-in invite minted the way Josh mints one opens for his account
  invite expires in 600 s (link withheld)
- setup · the invite page names Josh's account with one Register a passkey button
  screenshot: tests/audit-golden/screenshots/01-invite-page.jpg
- setup · registering a passkey signs in and lands on the shelf, as the phone would after Add to Home Screen
  screenshot: tests/audit-golden/screenshots/02-shelf-signed-in-after-registration.jpg
- author · a lesson draft is created with the owner's bearer [redacted] (stands in for the plugin's own submission)
  POST /api/v1/lessons -> 201 lessonId=bcfb3097-3e0d-401d-bcd0-41f06e6f7724
- shelf · the authored lesson is on the shelf, Not started, for the signed-in owner
  screenshot: tests/audit-golden/screenshots/03-shelf-with-new-lesson.jpg
- shelf · fresh browser shows the demo lesson Not started
- forbidden · shelf fresh · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · shelf fresh · says Question, not Item
- visual · shelf fresh · panel is not blank
- visual · shelf fresh · every control is at least 44px on its shortest side
- visual · shelf fresh · no horizontal overflow at 390px
- visual · shelf fresh · bottom safe-area padding on page shelf
- scheme · shelf fresh · light and dark render different backgrounds
- reload · shelf fresh · surface comes back
- overview · title, assumed knowledge, Concept count, state and Start lesson
- forbidden · overview fresh · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · overview fresh · says Question, not Item
- visual · overview fresh · panel is not blank
- visual · overview fresh · every control is at least 44px on its shortest side
- visual · overview fresh · no horizontal overflow at 390px
- visual · overview fresh · bottom safe-area padding on page overview
- scheme · overview fresh · light and dark render different backgrounds
- reload · overview fresh · surface comes back
- reload · overview fresh · checkpoint rebuilt from events
- card · Start lesson opens Card 1 of Concept 1 at the stable learning URL
- forbidden · card 1 of concept 1 · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · card 1 of concept 1 · says Question, not Item
- visual · card 1 of concept 1 · panel is not blank
- visual · card 1 of concept 1 · every control is at least 44px on its shortest side
- visual · card 1 of concept 1 · no horizontal overflow at 390px
- visual · card 1 of concept 1 · bottom safe-area padding on shell
- scheme · card 1 of concept 1 · light and dark render different backgrounds
- reload · card 1 of concept 1 · surface comes back
- reload · card 1 of concept 1 · checkpoint rebuilt from events
- first step · square Back returns to the overview with Resume
- forbidden · overview after Back from first Card · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · overview after Back from first Card · says Question, not Item
- visual · overview after Back from first Card · panel is not blank
- visual · overview after Back from first Card · every control is at least 44px on its shortest side
- visual · overview after Back from first Card · no horizontal overflow at 390px
- visual · overview after Back from first Card · bottom safe-area padding on page overview
- reload · overview after Back from first Card · surface comes back
- reload · overview after Back from first Card · checkpoint rebuilt from events
- first step · Resume from the overview reopens Card 1
- first step · close returns to the shelf showing In progress
- forbidden · shelf in progress after close · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · shelf in progress after close · says Question, not Item
- visual · shelf in progress after close · panel is not blank
- visual · shelf in progress after close · every control is at least 44px on its shortest side
- visual · shelf in progress after close · no horizontal overflow at 390px
- visual · shelf in progress after close · bottom safe-area padding on page shelf
- reload · shelf in progress after close · surface comes back
- first step · browser Back returns to the shelf
- first step · browser Back leaves the URL at the shelf path
- forbidden · shelf after browser Back from first Card · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · shelf after browser Back from first Card · says Question, not Item
- visual · shelf after browser Back from first Card · panel is not blank
- visual · shelf after browser Back from first Card · every control is at least 44px on its shortest side
- visual · shelf after browser Back from first Card · no horizontal overflow at 390px
- visual · shelf after browser Back from first Card · bottom safe-area padding on page shelf
- reload · shelf after browser Back from first Card · surface comes back
- first step · learner is back on Card 1 after the Back probes
- card · Continue marks Card 1 Seen exactly once and shows Card 2
- forbidden · card 2 of concept 1 · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · card 2 of concept 1 · says Question, not Item
- visual · card 2 of concept 1 · panel is not blank
- visual · card 2 of concept 1 · every control is at least 44px on its shortest side
- visual · card 2 of concept 1 · no horizontal overflow at 390px
- visual · card 2 of concept 1 · bottom safe-area padding on shell
- reload · card 2 of concept 1 · surface comes back
- reload · card 2 of concept 1 · checkpoint rebuilt from events
- card · Back inspects Card 1 without recording evidence
- card · Back inspection does not replace the canonical checkpoint
- reload · inspecting Card 1 resumes at the canonical Card 2 · surface comes back
- reload · inspecting Card 1 resumes at the canonical Card 2 · checkpoint rebuilt from events
- card · Continue on an already Seen Card records no duplicate card_seen
- check 1 · the Check opens on an unanswered drawable Question of Concept 1
- check 1 question · exactly three shared options, I don't know present, field blank
- forbidden · check 1 unanswered Question · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 1 unanswered Question · says Question, not Item
- visual · check 1 unanswered Question · panel is not blank
- visual · check 1 unanswered Question · every control is at least 44px on its shortest side
- visual · check 1 unanswered Question · no horizontal overflow at 390px
- visual · check 1 unanswered Question · I don't know is contained away from the screen edge
- visual · check 1 unanswered Question · bottom safe-area padding on shell
- scheme · check 1 unanswered Question · light and dark render different backgrounds
- reload · check 1 unanswered Question · surface comes back
- reload · check 1 unanswered Question · checkpoint rebuilt from events
- check 1 · an unanswered short-answer draft reloads blank
- check 1 wrong · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Try another from this concept
- forbidden · check 1 wrong feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 1 wrong feedback · says Question, not Item
- visual · check 1 wrong feedback · panel is not blank
- visual · check 1 wrong feedback · every control is at least 44px on its shortest side
- visual · check 1 wrong feedback · no horizontal overflow at 390px
- visual · check 1 wrong feedback · bottom safe-area padding on shell
- scheme · check 1 wrong feedback · light and dark render different backgrounds
- reload · check 1 wrong feedback · surface comes back
- reload · check 1 wrong feedback · checkpoint rebuilt from events
- check 1 · Review opens the correcting Card as a detour with Return to questions
- forbidden · check 1 corrective Card · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 1 corrective Card · says Question, not Item
- visual · check 1 corrective Card · panel is not blank
- visual · check 1 corrective Card · every control is at least 44px on its shortest side
- visual · check 1 corrective Card · no horizontal overflow at 390px
- visual · check 1 corrective Card · bottom safe-area padding on shell
- scheme · check 1 corrective Card · light and dark render different backgrounds
- reload · check 1 corrective Card · surface comes back
- reload · check 1 corrective Card · checkpoint rebuilt from events
- check 1 · Return restores the same feedback and the detour recorded no event
- check 1 · Try another asks an unseen Question from the same Concept
- check 1 retry question · exactly three shared options, I don't know present, field blank
- forbidden · check 1 retry Question · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 1 retry Question · says Question, not Item
- visual · check 1 retry Question · panel is not blank
- visual · check 1 retry Question · every control is at least 44px on its shortest side
- visual · check 1 retry Question · no horizontal overflow at 390px
- visual · check 1 retry Question · I don't know is contained away from the screen edge
- visual · check 1 retry Question · bottom safe-area padding on shell
- reload · check 1 retry Question · surface comes back
- reload · check 1 retry Question · checkpoint rebuilt from events
- check 1 · a correct answer shows Correct with the key's feedback and Continue, never auto-advancing
- forbidden · check 1 correct feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 1 correct feedback · says Question, not Item
- visual · check 1 correct feedback · panel is not blank
- visual · check 1 correct feedback · every control is at least 44px on its shortest side
- visual · check 1 correct feedback · no horizontal overflow at 390px
- visual · check 1 correct feedback · bottom safe-area padding on shell
- scheme · check 1 correct feedback · light and dark render different backgrounds
- reload · check 1 correct feedback · surface comes back
- reload · check 1 correct feedback · checkpoint rebuilt from events
- concept 2 · Continue after the Check opens Card 1 of Concept 2
- check 2 · the Check opens for Concept 2
- check 2 question · exactly three shared options, I don't know present, field blank
- check 2 · I don't know shows the correct answer, a link to the correcting Card and ends the Check
- check 2 · I don't know carries no penalty: progress state is unchanged
- forbidden · check 2 I don't know feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 2 I don't know feedback · says Question, not Item
- visual · check 2 I don't know feedback · panel is not blank
- visual · check 2 I don't know feedback · every control is at least 44px on its shortest side
- visual · check 2 I don't know feedback · no horizontal overflow at 390px
- visual · check 2 I don't know feedback · bottom safe-area padding on shell
- scheme · check 2 I don't know feedback · light and dark render different backgrounds
- reload · check 2 I don't know feedback · surface comes back
- reload · check 2 I don't know feedback · checkpoint rebuilt from events
- concept 3 · I don't know then Continue opens Card 1 of Concept 3
- check 3 question 1 · exactly three shared options, I don't know present, field blank
- check 3 wrong 1 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Try another from this concept
- check 3 question 2 · exactly three shared options, I don't know present, field blank
- check 3 wrong 2 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Try another from this concept
- forbidden · check 3 second wrong feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · check 3 second wrong feedback · says Question, not Item
- visual · check 3 second wrong feedback · panel is not blank
- visual · check 3 second wrong feedback · every control is at least 44px on its shortest side
- visual · check 3 second wrong feedback · no horizontal overflow at 390px
- visual · check 3 second wrong feedback · bottom safe-area padding on shell
- reload · check 3 second wrong feedback · surface comes back
- reload · check 3 second wrong feedback · checkpoint rebuilt from events
- check 3 question 3 · exactly three shared options, I don't know present, field blank
- check 3 wrong 3 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Continue
- check 3 · every wrong answer was re-asked from an unseen Question until the Pool was exhausted
- wrap-up · opens with one Question drawn from the reserved Questions the Checks never showed
- wrap-up question 1 · exactly three shared options, I don't know present, field blank
- forbidden · wrap-up Question 1 · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · wrap-up Question 1 · says Question, not Item
- visual · wrap-up Question 1 · panel is not blank
- visual · wrap-up Question 1 · every control is at least 44px on its shortest side
- visual · wrap-up Question 1 · no horizontal overflow at 390px
- visual · wrap-up Question 1 · I don't know is contained away from the screen edge
- visual · wrap-up Question 1 · bottom safe-area padding on shell
- scheme · wrap-up Question 1 · light and dark render different backgrounds
- reload · wrap-up Question 1 · surface comes back
- reload · wrap-up Question 1 · checkpoint rebuilt from events
- wrap-up · shelf shows Seen before any Wrap-up answer, and Resume returns to the same Question
- wrap-up · a wrong answer shows feedback and Continue, and does not award Learned
- forbidden · wrap-up wrong feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · wrap-up wrong feedback · says Question, not Item
- visual · wrap-up wrong feedback · panel is not blank
- visual · wrap-up wrong feedback · every control is at least 44px on its shortest side
- visual · wrap-up wrong feedback · no horizontal overflow at 390px
- visual · wrap-up wrong feedback · bottom safe-area padding on shell
- scheme · wrap-up wrong feedback · light and dark render different backgrounds
- reload · wrap-up wrong feedback · surface comes back
- reload · wrap-up wrong feedback · checkpoint rebuilt from events
- wrap-up · Question 2 is a reserved Question the Checks never showed
- forbidden · wrap-up Question 2 · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · wrap-up Question 2 · says Question, not Item
- visual · wrap-up Question 2 · panel is not blank
- visual · wrap-up Question 2 · every control is at least 44px on its shortest side
- visual · wrap-up Question 2 · no horizontal overflow at 390px
- visual · wrap-up Question 2 · I don't know is contained away from the screen edge
- visual · wrap-up Question 2 · bottom safe-area padding on shell
- reload · wrap-up Question 2 · surface comes back
- reload · wrap-up Question 2 · checkpoint rebuilt from events
- wrap-up · correct answer 2 marks its Concept Learned
- wrap-up · Question 3 is a reserved Question the Checks never showed
- forbidden · wrap-up retried or third Question · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · wrap-up retried or third Question · says Question, not Item
- visual · wrap-up retried or third Question · panel is not blank
- visual · wrap-up retried or third Question · every control is at least 44px on its shortest side
- visual · wrap-up retried or third Question · no horizontal overflow at 390px
- visual · wrap-up retried or third Question · I don't know is contained away from the screen edge
- visual · wrap-up retried or third Question · bottom safe-area padding on shell
- reload · wrap-up retried or third Question · surface comes back
- reload · wrap-up retried or third Question · checkpoint rebuilt from events
- wrap-up · correct answer 3 marks its Concept Learned
- wrap-up · Question 4 is a reserved Question the Checks never showed
- wrap-up · correct answer 4 marks its Concept Learned
- forbidden · wrap-up final correct feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · wrap-up final correct feedback · says Question, not Item
- visual · wrap-up final correct feedback · panel is not blank
- visual · wrap-up final correct feedback · every control is at least 44px on its shortest side
- visual · wrap-up final correct feedback · no horizontal overflow at 390px
- visual · wrap-up final correct feedback · bottom safe-area padding on shell
- reload · wrap-up final correct feedback · surface comes back
- reload · wrap-up final correct feedback · checkpoint rebuilt from events
- wrap-up · one Question per Concept, and the missed Concept returned once more, later in a shuffled queue
- learned · the summary reads Learned and every Concept is Learned
- forbidden · Learned summary · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · Learned summary · says Question, not Item
- visual · Learned summary · panel is not blank
- visual · Learned summary · every control is at least 44px on its shortest side
- visual · Learned summary · no horizontal overflow at 390px
- visual · Learned summary · bottom safe-area padding on shell
- scheme · Learned summary · light and dark render different backgrounds
- reload · Learned summary · surface comes back
- reload · Learned summary · checkpoint rebuilt from events
- learned · shelf shows Learned
- forbidden · shelf Learned · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · shelf Learned · says Question, not Item
- visual · shelf Learned · panel is not blank
- visual · shelf Learned · every control is at least 44px on its shortest side
- visual · shelf Learned · no horizontal overflow at 390px
- visual · shelf Learned · bottom safe-area padding on page shelf
- scheme · shelf Learned · light and dark render different backgrounds
- reload · shelf Learned · surface comes back
- drill after Learned · closing an unfinished drill leaves Resume every question on the overview
- drill after Learned · learning evidence, navigation evidence and the shelf state are byte-identical
- drill · starts at Question 1 of every Question on the drill URL
- drill question 1 · exactly three shared options, I don't know present, field blank
- forbidden · drill Question 1 · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill Question 1 · says Question, not Item
- visual · drill Question 1 · panel is not blank
- visual · drill Question 1 · every control is at least 44px on its shortest side
- visual · drill Question 1 · no horizontal overflow at 390px
- visual · drill Question 1 · I don't know is contained away from the screen edge
- visual · drill Question 1 · bottom safe-area padding on shell drill
- scheme · drill Question 1 · light and dark render different backgrounds
- reload · drill Question 1 · surface comes back
- reload · drill Question 1 · checkpoint rebuilt from events
- drill · correct at 1 shows Correct and Continue
- drill · correct at 2 shows Correct and Continue
- drill wrong at 3 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Continue
- forbidden · drill wrong feedback · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill wrong feedback · says Question, not Item
- visual · drill wrong feedback · panel is not blank
- visual · drill wrong feedback · every control is at least 44px on its shortest side
- visual · drill wrong feedback · no horizontal overflow at 390px
- visual · drill wrong feedback · bottom safe-area padding on shell drill
- scheme · drill wrong feedback · light and dark render different backgrounds
- reload · drill wrong feedback · surface comes back
- reload · drill wrong feedback · checkpoint rebuilt from events
- drill · Review opens the correcting Card with Return to questions
- forbidden · drill corrective Card · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill corrective Card · says Question, not Item
- visual · drill corrective Card · panel is not blank
- visual · drill corrective Card · every control is at least 44px on its shortest side
- visual · drill corrective Card · no horizontal overflow at 390px
- visual · drill corrective Card · bottom safe-area padding on shell drill
- scheme · drill corrective Card · light and dark render different backgrounds
- reload · drill corrective Card · surface comes back
- reload · drill corrective Card · checkpoint rebuilt from events
- drill · square Back on the correcting Card returns to the feedback
- drill · I don't know at 4 shows the answer, the correcting Card and Continue
- drill · correct at 5 shows Correct and Continue
- drill wrong at 6 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Continue
- forbidden · drill feedback halfway · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill feedback halfway · says Question, not Item
- visual · drill feedback halfway · panel is not blank
- visual · drill feedback halfway · every control is at least 44px on its shortest side
- visual · drill feedback halfway · no horizontal overflow at 390px
- visual · drill feedback halfway · bottom safe-area padding on shell drill
- reload · drill feedback halfway · surface comes back
- reload · drill feedback halfway · checkpoint rebuilt from events
- forbidden · drill Question after halfway reload · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill Question after halfway reload · says Question, not Item
- visual · drill Question after halfway reload · panel is not blank
- visual · drill Question after halfway reload · every control is at least 44px on its shortest side
- visual · drill Question after halfway reload · no horizontal overflow at 390px
- visual · drill Question after halfway reload · I don't know is contained away from the screen edge
- visual · drill Question after halfway reload · bottom safe-area padding on shell drill
- reload · drill Question after halfway reload · surface comes back
- reload · drill Question after halfway reload · checkpoint rebuilt from events
- drill · browser Back returns to the overview with Resume every question
- drill · overview still says Not started while a drill is open
- drill · resuming returns to the same unanswered Question and position
- drill · correct at 7 shows Correct and Continue
- drill · I don't know at 8 shows the answer, the correcting Card and Continue
- drill wrong at 9 · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, Continue
- drill · correct at 10 shows Correct and Continue
- drill · correct at 11 shows Correct and Continue
- drill · I don't know at 12 shows the answer, the correcting Card and Continue
- drill · every Question in every Pool was asked exactly once, reserved ones included
- drill · summary lists each Concept and repeats that drill does not earn Learned, with no score or percentage
- forbidden · drill summary · no score, streak, difficulty, mastery or time estimate in the DOM
- vocabulary · drill summary · says Question, not Item
- visual · drill summary · panel is not blank
- visual · drill summary · every control is at least 44px on its shortest side
- visual · drill summary · no horizontal overflow at 390px
- visual · drill summary · bottom safe-area padding on shell drill
- scheme · drill summary · light and dark render different backgrounds
- reload · drill summary · surface comes back
- reload · drill summary · checkpoint rebuilt from events
- drill · leaving the summary closes the run and the overview offers Every question and Start lesson
- drill · shelf still says Not started and the learning stores never changed
- drill · the drill stream holds one answer per Question and a closing null checkpoint
- author · a second lesson draft, isolated from the learning-loop run, for the offline and second-device scenarios
  POST /api/v1/lessons -> 201 lessonId=faef8a40-f6df-4863-8f6c-3ba04c16d9ff revisionId=a8c07e49-e8d9-423c-9269-c566582b141b
- shelf · this uniquely-titled fresh draft is first on the shelf, newest first, Not started
  screenshot: tests/audit-golden/screenshots/04-shelf-newest-lesson-first.jpg
- offline · Card 2 of Concept 1 is on screen before going offline
  surface=learn card="Age measures stored time"
- offline · closing the app and reopening from the icon, offline, resumes at the exact Card
  resumed at card="Age measures stored time"; screenshot: tests/audit-golden/screenshots/05-concept-1-resumed-reached-offline.jpg
- offline · a whole Concept (its remaining Card, then a correct Check answer) completes with the network off
  after finishing Concept 1 offline: {"surface":"learn","cardHeading":null,"stem":null}; screenshot: tests/audit-golden/screenshots/06-concept-2-reached-offline.jpg
- secrets · no response body anywhere in this run leaked a credential or a token-shaped string

### Run

- Base URL: https://learn-joshhale.legoguy32109.deno.net
- Started: 2026-09-22T13:44:32.144Z

### Created on production (nothing was deleted)

- sign-in invite /sign-in/d9EK_q8… (consumed by this run's passkey registration)
- lesson bcfb3097-3e0d-401d-bcd0-41f06e6f7724 "How browser HTTP caching works" (learning-loop run, fixture title kept so fullWalk's own title assertions hold)
- lesson faef8a40-f6df-4863-8f6c-3ba04c16d9ff "audit-2026-09-22T13-44-57-golden-offline" (offline and second-device run)

