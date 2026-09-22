# Authoring rules

The validator enforces everything countable. This file covers what it cannot:
the judgment that decides whether the lesson teaches or just tests recognition.
The countable rules are listed at the end with their diagnostic codes.

## The shared option set is the whole technique

Write **one set of 3 options per Concept**, and reuse it for every MCQ in
that Concept. Each Question asks about a different member of the set, so the key
moves and the options do not.

```
Options, Concept "yield-vs-block":
  block   It blocks the worker thread. No other task on that worker can run.
  yield   It yields the task. The worker is free to run another task.
  own     Each task gets its own worker, so both make progress at the same time.

Question a: "std::thread::sleep on a single-worker runtime does what?"       key block
Question b: "tokio::time::sleep(d).await on a single-worker runtime?"        key yield
Question c: "std::thread::sleep with worker_threads = 2?"                    key own
```

In `lesson/v1` the set is the Concept's `options` array: 3 entries of
`{ "id", "text" }`. An MCQ's `key` names one option ID, its `map` names the
other 2, and its `feedback` has an entry for all 3.

This is from Little et al. via the ai-microlearning research, and it does four
jobs at once:

1. **Length cannot signal the key.** The options are identical strings across
   Questions, so "pick the longest" carries no information. Writing the key
   first in full precision and the distractors afterwards as brief wrong things
   is the natural failure mode, and this construction makes it unavailable.
   The resolver also refuses a set whose longest option is more than
   1.35 times the shortest, and a lesson in which the key is the longest
   option in more than one third of its MCQs.
2. **Every distractor is true of something.** It is a sibling Question's key,
   so it is a real, precisely stated claim rather than a strawman.
3. **Coverage falls out.** Three Questions over one set force the term, the
   rule and the boundary rather than three paraphrases of one idea.
4. **It compresses.** The set is written once.

Build the set from claims that are **mutually exclusive and all plausible**. If
two options could both be true of the same stem, the Question has no single
answer.

## Distractor provenance

> Every distractor must be a misconception the source material explicitly
> corrects, warns against, or clarifies. Point to the passage that corrects it.
> If you cannot find such a passage, do not invent a distractor. Write a
> different question.

The schema enforces the structural half of this: misconceptions live inside
the Concept as `{ "id", "statement", "correctingCardId" }`, so a distractor can
only ever be corrected by a Card in the same Concept. A learner is never told
they hold a belief that the material has not yet addressed. Every misconception
must be named by the `map` of some MCQ in its Concept; an unused one is an
error.

What it cannot enforce is whether the misconception is *real*. Prefer, in order:

1. A misconception recorded in the learner's own history: a learning record, a
   past wrong answer, a question they asked.
2. One the source material stops to correct, which is evidence somebody hit it.
3. A confusion between two adjacent things in the source.

Never invent a belief nobody holds just to fill the third slot.

## Stems stand alone

Strip every Card away and the stem must still make sense. That means no
"the second reason", "the above", "this approach", "besides the one already
mentioned". Name the subject inside the stem.

The resolver catches common phrasings (`question.stem.unbound`), but it cannot
catch a stem that depends on the Question before it. Read each stem cold, out
of order, before you submit.

## Feedback

Every option gets feedback, including the key. Correct answers are the cheapest
place to add a sentence of consolidation.

Wrong-answer feedback names the error without asserting the learner's mind. The
app already prints "The belief behind that option", so write the misconception
`statement` as the belief itself, in plain words. A selected option can also be
a slip, so do not write feedback that scolds.

Numeric and short Questions carry one `feedback` string shown after any
answer, and a `correctingCardId` naming the Card shown after a wrong answer or
"I don't know". Every Question has a `correctingCardId`; for an MCQ it is the
Card shown after "I don't know".

## Cards

Target **120 to 200 words**, two to four paragraphs. The spec everyone writes
is "30 to 60 seconds", which is not a unit anything can emit. Convert it once,
here, and write to the word count. The count is taken after inline HTML tags
such as `<code>` and `<em>` are stripped.

A Card is `{ "id", "heading", "body" }` where `body` is an array of paragraph
strings. Write at least two paragraphs: after a wrong answer the app shows the
correcting Card clamped to its first paragraph, so a single-paragraph Card has
nothing to expand (`card.paragraphs.single`).

Structure that reliably lands in range:

1. The claim, stated as a conclusion. Not background, not a definition.
2. The mechanism. Why it is true.
3. A concrete instance with real numbers, names, or output.
4. The consequence, or what it rules out.

The first Card of each Concept leads with the most interesting claim in it. A
Concept has at least two Cards.

Vary sentence length deliberately. Three sentences of similar length in a row
is the single clearest tell of generated prose. Do not pad to create contrast;
combine or cut instead.

## Numeric Questions

The test is not whether the number appears in a Card. It is whether a learner
who understood the Concept can produce it. Two kinds qualify.

**Derived from the mechanism.** The number falls out of the idea being taught,
and getting it right is evidence of understanding rather than of memory. Six
blocking sleeps of 300ms on one worker print at about 1800ms; you can only
answer that if you know blocking serialises. Prefer this kind. The arithmetic
must be one step and doable in the head; a figure requiring several chained
operations tests arithmetic on top of the concept and punishes a slip as if it
were a misconception.

**A load-bearing constant.** The number's *magnitude* is the claim the Card
makes. "Spaced retrieval gained about 2 percentage points across nine courses"
is a finding whose whole point is that the value is small, so recalling it
approximately is recalling the argument. Ask about the magnitude, and set the
tolerance so that anyone who took the point scores, not so that only someone
who memorised the decimal does.

**Never an incidental constant.** A number that merely identifies a finding,
where nothing about understanding the Concept lets you reconstruct it, is
vocabulary wearing a number's clothes. `g+ = 0.53` for the signaling effect is
the type case: the learner either memorised two digits or did not, and no
amount of understanding closes the gap. If the answer could be swapped for a
different plausible value without changing any argument in the Cards, it is
incidental; write an MCQ instead.

The resolver requires the answer, written as a number, to appear in a Card of
the Concept (`numeric.answer.uncovered`). That is the countable half of the
rule above, not a substitute for it.

A numeric Question is never the reserved instance (`numeric.reserved`).
Reserved Questions are what the Wrap-up draws, and the Wrap-up alone decides
Learned, so a Concept must never hang on a number the learner has not seen
asked before. Numeric Questions belong in the drawable Pool, where a wrong
answer still earns a re-ask.

Always set a `tolerance`, and set it from the claim rather than from the
decimal. If the point is "small, a couple of points", 1 is right and 0.5 is not.
Zero is not accepted (`numeric.tolerance.missing`): even an exact integer the
source states verbatim deserves a small tolerance, because typing is not
understanding. An optional `unit` is shown beside the input.

## Short-answer Questions

`lesson/v1` adds a third type. A short Question asks the learner to type a
term, a header name, a command or an identifier, and matches the typed text
against `answer` and every string in `aliases`, ignoring case and surrounding
whitespace. Nothing else is normalised, so list the spellings yourself:
`"Age"` with aliases `["age header", "the age header"]`.

Use a short Question when there is exactly one right answer and recalling it
cold is the skill. Do not use one for a judgment or a definition; that is an
MCQ, where the shared option set does the work. A short Question may be
reserved, and it counts toward the 3 drawable Questions when it is not.

## Pools

Each Concept owns one Pool, named by its `poolId`. Every Question of the
Concept carries that `poolId`. A Concept Check draws from the drawable
Questions and re-asks from an unseen one after a wrong answer, so a Pool needs
at least 3 drawable Questions (`pool.drawable.minimum`). The Wrap-up draws
reserved Questions first, so a Pool needs at least one `"reserved": true`
Question (`pool.reserved.missing`). Three total is the number people reach for,
and it leaves the Wrap-up re-serving a Question the learner has already been
shown the answer to.

## Concepts

One Concept is one thing the learner can do, stated as a capability in the
optional `statement`:

> Say what each kind of sleep does to the worker, and predict the ordering of
> two tasks on one worker.

Not a topic ("sleeps"). Not a list of three capabilities. If the statement needs
an "and" joining unrelated verbs, it is two Concepts.

Three to five Concepts is a normal lesson. More than six is a course.

## What never appears

No score, no percentage, no grade, no streak, no difficulty label, no time
estimate, no partial credit, and never the word mastery. The app does not
implement any of them, which is the point. The only learner-facing outcomes are
Seen, Learned and Retained.

## The countable rules

| Code | Severity | Rule |
| --- | --- | --- |
| `concept.options.count` | error | The Concept does not own exactly three options. |
| `concept.options.ratio` | error | The longest option is more than 1.35 times the length of the shortest, so length signals the key. |
| `lesson.key.longest` | error | The key is the longest option in more than one third of the lesson's MCQs, so length signals the answer. |
| `concept.cards.minimum` | error | The Concept has fewer than two Cards. |
| `card.words` | error | The Card is under 120 or over 200 words after inline HTML tags are stripped. |
| `card.paragraphs.single` | warning | The Card has one paragraph, so the clamped corrective view has nothing to expand. |
| `misconception.card` | error | correctingCardId is not the ID of a Card in the same Concept. |
| `misconception.unused` | error | No MCQ distractor in the Concept maps to this misconception. |
| `mcq.map.missing` | error | A distractor option has no map entry. |
| `mcq.feedback.missing` | error | An option of the Concept, possibly the key, has no feedback entry. |
| `question.stem.unbound` | error | The stem contains an unbound reference such as "the above", "the second" or "this approach", so it does not stand alone once the Cards are gone. |
| `numeric.answer.uncovered` | error | The answer, written as a number, appears in no Card of the Question's Concept. |
| `numeric.tolerance.missing` | error | tolerance is missing or zero. |
| `numeric.reserved` | error | A numeric Question is marked reserved. |
| `pool.drawable.minimum` | error | The Pool has fewer than three drawable (non-reserved) Questions, so the Check cannot ask once and re-ask twice. |
| `pool.reserved.missing` | error | No Question of this Concept's Pool is reserved for the Wrap-up. |
| `provenance.required` | error | provenance is missing, or its status is neither provided nor declined. |
| `document.size` | error | The serialized document is over 1,000,000 bytes. |

The full catalog with every code's path and fix is `references/diagnostics.md`,
served as JSON at https://learn-joshhale.legoguy32109.deno.net/api/v1/diagnostics.
