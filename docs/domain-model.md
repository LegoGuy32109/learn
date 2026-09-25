# Domain model

## Lesson content

- **Lesson**: Stable identity that owns an ordered series of immutable Lesson
  Revisions.
- **Lesson Revision**: Immutable instructional snapshot. It owns assumed
  knowledge, ordered Concepts, Cards, Question Pools, Questions, source
  references, author-at-creation, provenance, schema version, and fingerprint.
- **Concept**: The unit of checking, learning, and later retention. It contains
  at least two Cards and one or more Question Pools.
- **Card**: One teaching idea, written as an array of paragraphs of 80 to 200
  words in total. A Card becomes Seen only when the learner chooses Continue.
  Shown as a correction, a Card is clamped to its first paragraph.
- **Option set**: Exactly three options with stable IDs, owned by a Concept and
  shared by every MCQ in it. Each MCQ names its key, so the key moves and the
  options do not.
- **Misconception**: A belief, written as the belief itself, owned by a Concept
  and corrected by a Card in the same Concept. Every MCQ distractor maps to
  one misconception.
- **Question**: An MCQ, numeric, or short-answer prompt in a Pool. Use
  `Question`, not `Item`, in code, APIs, and UI. A Question may be `reserved`:
  Checks never draw it, so the Wrap-up can ask something unseen. A numeric
  Question is never reserved.
- **Pool**: Interchangeable Questions that probe one Concept: at least three
  drawable and one reserved.
- **Library Listing**: A future mutable discovery record that points to one
  published Lesson Revision. Its database table is `listings`. It owns display
  title, description, tags, categories, discovery state, promotional state, and
  its current revision reference. Artwork is outside 1.0.

## Progress states

Cards are binary: unseen or Seen. Concepts and Lessons derive one of these
monotonic states:

```text
not_started -> in_progress -> seen -> learned -> retained
```

- A Concept or Lesson becomes In Progress when its first Card becomes visible
  through learner navigation.
- A Concept is Seen when Continue has been chosen on all its Cards.
- A Lesson is Seen when all Cards in all Concepts are Seen.
- A Concept Check is formative and cannot make a Concept Learned.
- A Concept becomes Learned when the learner answers its Wrap-up Question
  correctly.
- A Lesson becomes Learned when every Concept is Learned.
- `learned_at` is set once from the answer that first satisfied the rule.
- Retention is deferred. Later, the first successful due review sets
  `retained_at`, and later successful reviews update it. Incorrect answers never
  move a state backward.

Verification is separate evidence. It never changes learning progress or a
retention schedule.

## Learning evidence

Persist three learning event types in the first milestone:

- `lesson_started`
- `card_seen`
- `question_answered`

All events have UUIDv4 IDs, a Lesson Revision ID, a progress epoch, and an
occurrence timestamp. Question answers also contain the flow kind, Concept ID,
Pool ID, Question ID, attempt ID, submitted answer, and correctness.

Do not persist `concept_learned`, `lesson_learned`, Seen, or In Progress events.
The shared reducer derives them. This prevents contradictory evidence.

Do not measure response time.

## Navigation evidence

Persist `navigation_checkpointed` events in a separate logical stream. A
checkpoint contains enough information to reconstruct:

- the Lesson Revision and progress epoch;
- the flow kind;
- the active Concept and Card or Question;
- the Question attempt ID and deterministic random seed;
- the remaining and retry queues;
- whether an unanswered Question or submitted feedback is visible; and
- the learning-event frontier on which the checkpoint depends.

Unsubmitted short-answer drafts are not checkpointed. The IndexedDB checkpoint
projection can be deleted and rebuilt from these events. The same replay model
must allow a future server to give another device the exact resume position.

## Checks and Wrap-up

At the end of each Concept, run a formative Check from that Concept's
drawable Questions. Reserved Questions are never drawn.

- Correct: show the key's feedback, then continue. Never auto-advance.
- Incorrect: show the chosen option's feedback, the belief behind that option,
  and the correcting Card clamped to its first paragraph with the action
  button above it, then offer an unseen Question from the same Concept.
- Repeated incorrect answers: continue through unseen Questions until correct
  or the Pool is exhausted. If exhausted, show the correcting Card and continue
  to the next Concept.
- I don't know: fail that Question immediately, show the correct answer and a
  link to the correcting Card, and end that Concept's Check for the current
  lesson pass.

After all Cards, the Wrap-up selects one Question per Concept, drawing
reserved Questions first so the learner meets one the Checks never showed. Incorrect answers return later in a shuffled queue. Each Concept
becomes Learned after its Wrap-up Question is answered correctly. The Lesson is
Learned when all Concepts are Learned.

Question and option order are stable across reload. Create a UUIDv4 attempt ID
and random seed at the start of a Check or Wrap-up. A new attempt gets a new
seed.

## Drill

From the overview, **Every question** starts a drill: every Question in every
Pool, reserved ones included, asked once in a random order fixed by a
persisted seed. Every answer gets the same feedback as the learning flow, with
the belief and the clamped correcting Card on a wrong answer. Drill never
re-asks and never awards Seen or Learned.

Drill evidence is its own stream: `drill_question_answered` and
`drill_checkpointed` events carrying a run ID. No learning or navigation event
is written during a drill, so the shelf state and the learning checkpoint are
identical before and after one. The drill checkpoint replays from the drill
stream like the learning checkpoint. A null checkpoint closes the run. The
summary lists each Concept with what happened and repeats that drill does not
earn Learned; it shows no score and no percentage.

## Answer evaluation

- **MCQ**: Store stable option IDs from the Concept's shared set. Shuffle
  display order deterministically and compare the chosen ID with the key.
- **Numeric**: Declare an answer, a non-zero absolute tolerance, and optional
  display unit. Parse a locale-independent decimal. Do not convert units.
- **Short answer**: Compare the canonical answer and declared aliases after
  Unicode normalization, trimming, whitespace collapse, and case folding. Do
  not use fuzzy matching, stemming, or AI judgment.

Raw short-answer text will sync by default when accounts exist.

## Revisions and publication boundary

Progress is pinned to an exact Lesson Revision. A new revision does not transfer
progress. The UI must strongly mark the old revision as outdated, and the
learner must explicitly discard its progress before moving to the new revision.
Old revisions remain available from existing progress and direct links but stop
appearing in discovery and stop scheduling new reviews.

A future author must complete the normal flow and reach Learned before
verification becomes available. Publication requires the author to complete
one perfect, randomized run over every Question in every Pool. Publishing is a
human UI action called **Publish to Library**; there is no publish API.

