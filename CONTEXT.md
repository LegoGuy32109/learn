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

Each Concept has 2–4 Cards, one shared set of three options, and a Pool of at
least three drawable Questions plus one reserved for the Wrap-up. Across the
lesson, include MCQ, numeric, and short-answer Questions. The content model
follows the quiz plugin copied at `docs/reference/quiz-plugin-0.2.0/`.

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

## Current state

The local learning-loop milestone in `docs/first-milestone.md` is implemented.
The application also has a Turso-backed alpha authoring slice: owner accounts,
scoped personal tokens, immutable Lesson Revisions, structured sources, a pure
JSON resolver, draft APIs, API discovery, and a downloadable validator.

`learn-local` and `learn-dev` are provisioned. Production is not. See
`docs/turso-databases.md` and `docs/api-v1.md` before changing this layer.

The next coordinated stage is defined in `docs/implementation/README.md`. It
hardens the authoring contract and adds progress synchronization and token
operations. Library Listings, publication, verification, FSRS scheduling,
activity tracking, passkey account creation, and a service worker remain later
work.
