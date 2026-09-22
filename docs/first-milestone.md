# First milestone: local learning loop

## Outcome

A fresh browser opens a mobile-first shelf with one pre-cached, unstarted demo
lesson. The learner can open its overview, complete the full learning flow,
reach Learned, reload at any surface, and resume exactly where they left.

This milestone is implementation work, not a static mock-up.

## Required surfaces

1. **Mine shelf**: Show the demo lesson as Not started, In progress, Seen, or
   Learned. Use the unstarted Lesson card from the UI reference on first load.
2. **Lesson overview**: Show title, assumed knowledge, Concept count, progress
   state, and a full-width Start lesson or Resume action. Do not show a time
   estimate.
3. **Learning shell**: Use a compact lesson header, a segmented rail with one
   segment per Concept, one replaceable Card/Question region, and the referenced
   mobile action row.
4. **Card**: Continue marks the Card Seen and advances. Back permits inspection
   without reversing progress or replacing the canonical resume checkpoint.
5. **Concept Check**: Implement the behavior in `docs/domain-model.md`.
6. **Feedback**: Never auto-advance. Require Continue or Try another from this
   concept.
7. **Corrective Card**: Open as a temporary detour with Return to questions. It
   does not change authored order or emit a duplicate `card_seen` event.
8. **Wrap-up**: Ask one Question per Concept, retry missed Concepts later in a
   shuffled queue, and finish on a Learned summary.

At the first learning step, the square Back action moves backward when a prior
surface exists. A separate close control returns to the shelf. Browser Back at
the first learning step also returns to the shelf. The stable learning URL is
`/learn/<lesson-id>`; exact Card and Question position lives in replayable
state, not in a public route.

## Visual contract

Use `/home/josh/Downloads/learn-ui-reference.tar.gz` as the source for the
design system. In particular:

- preserve the tokens and light/dark schemes;
- keep all controls at least 44px on their shortest side;
- use the optional square Back control and expanding primary action;
- contain the I don't know action away from the screen edge;
- support bottom safe-area padding;
- use one replaceable region inside the lesson shell; and
- use the segmented Concept rail.

Use **Retained**, not Mastered. Do not implement the reference's break offer,
pause sheet, Sitting language, theme unlocks, upload flow, or old Markdown
contract. Adapt its components to the domain rules in this repository.

## Persistence and replay

Use IndexedDB from the first implementation. Wrap it with domain-shaped local
repositories under `src/client/storage`; UI modules must not issue raw IndexedDB
operations.

Store the normalized demo Lesson Revision, learning events, and navigation
events. Build projections with shared pure reducers. On application start,
rebuild projections when absent or stale. Tests must delete derived projections,
replay the event streams, and produce the same progress and exact checkpoint.

The current surface, Question order, option order, retry queue, and submitted
feedback state must survive reload. An unanswered short-answer field reloads
blank.

## Demo lesson constraints

Create `fixtures/lessons/browser-http-cache.json` as a normalized fixture:

- exactly three Concepts;
- 2–4 Cards per Concept, each an array of paragraphs of 120 to 200 words;
- one shared set of three options and a misconception registry per Concept;
- at least three drawable Questions and one reserved Question per Concept;
- MCQ, numeric, and short-answer types represented;
- correcting Card links for wrong answers and I don't know;
- useful misconceptions rather than joke distractors; and
- stable UUIDv4 IDs generated once and committed.

The server can seed IndexedDB from this fixture through the initial page or a
read-only endpoint. Do not implement upload.

## Required commands

Provide these Deno tasks:

```text
deno task dev
deno task check
deno task test
deno task e2e
```

`check` must type-check server TypeScript and browser JavaScript. Unit tests
must cover answer evaluation, progress reduction, Check/Wrap-up transitions,
deterministic shuffling, and checkpoint reconstruction.

Add one Playwright happy path at a phone-sized viewport. It must start from a
fresh browser, open the cached lesson, complete it, reload during at least one
Card and one Question/feedback state, and reach Learned.

## Definition of done

- The local app starts with one documented command.
- A user can click through the complete client-side flow on a phone-sized
  viewport.
- Every required progress and navigation state survives reload.
- Deleting projection records and replaying immutable events reconstructs the
  same state.
- The demo lesson satisfies its structural invariants.
- `deno task check`, `deno task test`, and `deno task e2e` pass.
- No deferred system is represented by empty scaffolding or speculative code.

## Deferred work

Defer Turso, accounts, cross-device transport, upload, authoring syntax,
resolver APIs, downloadable validators, Listings, publishing, verification,
FSRS, activity intervals, and the service worker. Preserve the boundaries in
the architecture and domain documents so these systems can be added without
replacing the learning core.
