# lesson.json schema

One file. The renderer reads it; nothing else is authored.

```jsonc
{
  "title": "Blocking a thread vs. yielding a task",
  "eyebrow": "Lesson 0001",              // optional, shown above the title
  "assumed": "You have run both versions and seen the output.",

  "concepts": [
    {
      "id": "yield-vs-block",
      "statement": "Say what each kind of sleep does to the worker, and predict the ordering of two tasks on one worker.",

      // Exactly three. Shared by every item in this concept. See authoring.md.
      "options": {
        "X": "It blocks the worker thread. No other task on that worker can run.",
        "Y": "It yields the task. The worker is free to run another task.",
        "Z": "Each task gets its own worker, so both make progress at the same time."
      },

      // Scoped to the concept, so corrected_by can only ever name a card the
      // learner has already read. Every slug must be used by some option.
      "misconceptions": {
        "block_yields": {
          "statement": "std::thread::sleep lets other tasks run while it waits.",
          "corrected_by": "c1-block"
        }
      },

      // body is an array of paragraphs. Inline HTML is allowed (<code>, <em>).
      // The renderer clamps to body[0] when a card appears as a correction.
      "cards": [
        {
          "id": "c1-block",
          "title": "A blocking sleep costs you the whole worker",
          "body": ["First paragraph, 120-200 words across the whole card.", "Second."]
        }
      ],

      "pool": [
        {
          "id": "i1a",
          "type": "mcq",
          "reserved": false,
          "stem": "On a single-worker runtime, one of two spawned tasks calls std::thread::sleep(300ms). What does that call do?",
          "key": "X",
          "map": { "Y": "block_yields", "Z": "blocking_moves_worker" },
          "feedback": {
            "X": "Right. The kernel parks the thread.",
            "Y": "That is the awaited version.",
            "Z": "There is only one worker here."
          }
        },
        {
          "id": "i1d",
          "type": "numeric",
          "reserved": true,
          "stem": "Two tasks, three ticks each, 300ms blocking sleep per tick, one worker. Roughly what does main done print, in ms?",
          "answer": 1800,
          "tolerance": 150,
          "unit": "ms",
          "feedback": "About 1800. Six blocking sleeps run back to back."
        }
      ]
    }
  ]
}
```

## Pool sizing

`reserved: true` marks the instance the checks never draw. It exists so the
wrap-up always has something unseen.

The minimum is **three drawable plus one reserved**, because a concept where the
learner misses twice consumes one item per attempt. Three total is the number
people reach for and it leaves the wrap-up re-serving a question the learner has
already been shown the answer to.

## What the renderer does with this

Fixed, and not re-derivable by the authoring agent:

- Cards one at a time, one check at the end of each concept.
- "I don't know" on every item, no penalty and no reward, rendered below the
  options at lower weight.
- Feedback immediately, on every answer, never batched.
- A wrong answer names the belief, then shows the correcting card clamped to its
  first paragraph, with the action button placed above it so retrying never
  requires a scroll.
- Re-ask drawn from an unseen instance in the same pool.
- "I don't know" routes to the correcting card and moves on without probing that
  concept again this sitting.
- A wrap-up over every concept, drawing only reserved instances.
- A drill mode reachable from the intro that serves every pool item in order,
  reserved included, for author review and for re-testing without the cards. It
  gives feedback and correcting cards but never awards Learned.
- **Learned is decided solely by the wrap-up.** Getting a check right does not
  earn it.
- Options shuffled per render. No score, no difficulty, no time estimate.
