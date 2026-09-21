# Authoring rules

The validator enforces everything countable. This file covers what it cannot:
the judgment that decides whether the quiz teaches or just tests recognition.

## The shared option set is the whole technique

Write **one set of three options per concept**, and reuse it for every item in
that concept. Each item asks about a different member of the set, so the key
moves and the options do not.

```
Options, concept "yield-vs-block":
  X  It blocks the worker thread. No other task on that worker can run.
  Y  It yields the task. The worker is free to run another task.
  Z  Each task gets its own worker, so both make progress at the same time.

Item a: "std::thread::sleep on a single-worker runtime does what?"       key X
Item b: "tokio::time::sleep(d).await on a single-worker runtime?"        key Y
Item c: "std::thread::sleep with worker_threads = 2?"                    key Z
```

This is from Little et al. via the ai-microlearning research, and it does four
jobs at once:

1. **Length cannot signal the key.** The options are identical strings across
   items, so "pick the longest" carries no information. Writing the key first
   in full precision and the distractors afterwards as brief wrong things is
   the natural failure mode, and this construction makes it unavailable.
2. **Every distractor is true of something.** It is a sibling item's key, so it
   is a real, precisely stated claim rather than a strawman.
3. **Coverage falls out.** Three items over one set force the term, the rule
   and the boundary rather than three paraphrases of one idea.
4. **It compresses.** The set is written once.

Build the set from claims that are **mutually exclusive and all plausible**. If
two options could both be true of the same stem, the item has no single answer.

## Distractor provenance

> Every distractor must be a misconception the source material explicitly
> corrects, warns against, or clarifies. Point to the passage that corrects it.
> If you cannot find such a passage, do not invent a distractor. Write a
> different question.

The lesson schema enforces the structural half of this: misconceptions live
inside the concept, so a distractor can only ever be corrected by a card in the
same concept. A learner is never told they hold a belief that the material has
not yet addressed.

What it cannot enforce is whether the misconception is *real*. Prefer, in order:

1. A misconception recorded in the learner's own history — a learning record, a
   past wrong answer, a question they asked.
2. One the source material stops to correct, which is evidence somebody hit it.
3. A confusion between two adjacent things in the source.

Never invent a belief nobody holds just to fill the third slot.

## Stems stand alone

Strip every card away and the stem must still make sense. That means no
"the second reason", "the above", "this approach", "besides the one already
mentioned". Name the subject inside the stem.

The validator catches common phrasings, but it cannot catch a stem that depends
on the item before it. Read each stem cold, out of order, before you ship.

## Feedback

Every option gets feedback, including the key. Correct answers are the cheapest
place to add a sentence of consolidation.

Wrong-answer feedback names the error without asserting the learner's mind. The
renderer already prints "The belief behind that option", so write the
`statement` as the belief itself, in plain words. A selected option can also be
a slip, so do not write feedback that scolds.

## Cards

Target **120 to 200 words**, two to four paragraphs. The spec everyone writes is
"30 to 60 seconds", which is not a unit anything can emit — convert it once,
here, and write to the word count.

Structure that reliably lands in range:

1. The claim, stated as a conclusion. Not background, not a definition.
2. The mechanism. Why it is true.
3. A concrete instance with real numbers, names, or output.
4. The consequence, or what it rules out.

The first card of each concept leads with the most interesting claim in it.

Vary sentence length deliberately. Three sentences of similar length in a row
is the single clearest tell of generated prose. Do not pad to create contrast —
combine or cut instead.

## Numeric items

The test is not whether the number appears in a card. It is whether a learner
who understood the concept can produce it. Two kinds qualify.

**Derived from the mechanism.** The number falls out of the idea being taught,
and getting it right is evidence of understanding rather than of memory. Six
blocking sleeps of 300ms on one worker print at about 1800ms — you can only
answer that if you know blocking serialises. Prefer this kind. The arithmetic
must be one step and doable in the head; a figure requiring several chained
operations tests arithmetic on top of the concept and punishes a slip as if it
were a misconception.

**A load-bearing constant.** The number's *magnitude* is the claim the card
makes. "Spaced retrieval gained about 2 percentage points across nine courses"
is a finding whose whole point is that the value is small, so recalling it
approximately is recalling the argument. Ask about the magnitude, and set the
tolerance so that anyone who took the point scores — not so that only someone
who memorised the decimal does.

**Never an incidental constant.** A number that merely identifies a finding,
where nothing about understanding the concept lets you reconstruct it, is
vocabulary wearing a number's clothes. `g+ = 0.53` for the signaling effect is
the type case: the learner either memorised two digits or did not, and no amount
of understanding closes the gap. If the answer could be swapped for a different
plausible value without changing any argument in the cards, it is incidental —
write an mcq instead.

A numeric item is never the reserved instance. Reserved items are what the
wrap-up draws, and the wrap-up alone decides Learned, so a concept must never
hang on a number the learner has not seen asked before. The validator enforces
this. Numeric items belong in the drawable pool, where a wrong answer still
earns a re-ask.

Always set a tolerance, and set it from the claim rather than from the decimal.
If the point is "small, a couple of points", ±1 is right and ±0.5 is not. Zero
tolerance is for an exact integer the source states verbatim, and even then it
is usually too sharp.

## Concepts

One concept is one thing the learner can do, stated as a capability:

> Say what each kind of sleep does to the worker, and predict the ordering of
> two tasks on one worker.

Not a topic ("sleeps"). Not a list of three capabilities. If the statement needs
an "and" joining unrelated verbs, it is two concepts.

Three to five concepts is a normal lesson. More than six is a course.

## What never appears

No score, no percentage, no grade, no streak, no difficulty label, no time
estimate, no partial credit, and never the word mastery. The renderer does not
implement any of them, which is the point — the only learner-facing outcomes are
Seen and Learned.
