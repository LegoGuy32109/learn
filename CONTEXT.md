# learn.joshhale.me

learn.joshhale.me is a bring-your-own-AI learning application. External agents
create structured lesson content. The application validates and stores that
content, but it does not call an AI model.

The first milestone is narrower: implement one complete, local, mobile-first
learning loop with a bundled demo lesson. A learner starts from a shelf that
already contains an unstarted lesson, reads its Cards, answers formative
Concept Checks, completes the Wrap-up, reaches Learned, reloads at any point,
and resumes at the exact surface they left.

Use **How browser HTTP caching works** as the demo topic. Cover three Concepts:

1. Freshness and age
2. Validators and conditional requests
3. Cache directives and revalidation

Each Concept has 2–4 Cards and at least three Questions. Across the lesson,
include MCQ, numeric, and short-answer Questions.

## Product principles

- A Card teaches one idea.
- A Concept always contains at least two Cards. Checks and retention operate on
  Concepts.
- Progress is pinned to an immutable Lesson Revision.
- Earned progress never moves backward.
- Learning evidence and navigation position are replayable data, not UI-only
  state.
- Offline learning is a requirement, but the first milestone implements only
  the IndexedDB foundation. A service worker comes later.
- Copy conventions from `/home/josh/Projects/painting`; do not copy its code.

## Current milestone

Build only what `docs/first-milestone.md` specifies. In particular, do not add
accounts, Turso, lesson upload, authoring APIs, Library Listings, publication,
verification, FSRS scheduling, activity tracking, or a service worker.

