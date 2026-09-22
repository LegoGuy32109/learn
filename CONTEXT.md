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
- Offline learning is a requirement. IndexedDB holds lesson content and
  progress; a service worker caches only the versioned application shell.
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
operations. The site installs as a PWA: a web app manifest and a service worker that
precaches the versioned shell, so an opened lesson reopens offline from
IndexedDB. Library Listings, publication, verification, FSRS scheduling,
activity tracking, and passkey account creation remain later work.
