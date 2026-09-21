# quiz

Generate an interactive retrieval-practice quiz on any topic, rendered through a
fixed interface.

Ask for a quiz on something — code an agent just wrote, a document, a lesson,
a repository — and you get a short interactive check: teaching cards, then
three-option questions at the end of each concept, immediate feedback that names
the belief behind a wrong answer, and a wrap-up drawn from questions the checks
never showed you.

## Why the interface is fixed

The agent writes only the content. Everything about how a quiz behaves ships as
a file in this plugin and is never regenerated, which means it cannot drift
between one quiz and the next:

- One check at the end of each concept, not sprinkled through it.
- "I don't know" on every question, with no penalty and no reward.
- Feedback immediately, on every answer, never held to the end.
- A wrong answer names the belief behind the option you picked and shows the
  card that corrects it.
- Then it asks again, using a question you have not seen.
- A wrap-up over every concept, drawing only held-back questions. Getting a
  check right does not count as learned; retrieving it cold in the wrap-up does.
- No score, no streak, no difficulty rating, no time estimate.

## Why three options, always the same three

Within a concept, every question offers the identical three options and only the
correct one moves. So the longest answer is not the right answer — a shortcut
most generated quizzes hand you without meaning to — and every wrong option is
some other question's right one, which makes it genuinely tempting instead of
obviously filler.

## What gets checked before you see it

A validator runs over the content first and refuses anything that would teach
the wrong lesson: options that give the answer away by length, a correction that
references material you have not read yet, cards too short to be worth reading,
a question that only makes sense if you remember the previous one, a numeric
answer nobody stated, or too few questions held back for the wrap-up.

## Credits

The question construction follows Little et al. on competitive distractors. The
flow follows the learn.joshhale.me lesson specification.
