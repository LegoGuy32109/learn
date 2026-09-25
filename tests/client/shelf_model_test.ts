// The shelf as data: server lessons merged with cached revisions without duplicates, newest first,
// each pinned to one revision with progress from local evidence, Outdated only when progress exists
// on an older revision, and a discard that advances the epoch without moving progress.
import { assert, assertEquals } from "jsr:@std/assert";
import fixture from "../../fixtures/lessons/browser-http-cache.json" with {
  type: "json",
};
import {
  buildShelf,
  discardTo,
  pinOnOpen,
} from "../../src/client/library/shelf-model.js";
import { evidenceFor } from "../../src/client/learning/session.js";

const LESSON = "lesson-a";
const R1 = "rev-a1";
const R2 = "rev-a2";

function revision(
  lessonId: string,
  revisionId: string,
  title: string,
  cachedAt = "2026-09-20T10:00:00Z",
) {
  return {
    lesson: { ...structuredClone(fixture), lessonId, revisionId, title },
    cachedAt,
  };
}

function remote(
  lessonId: string,
  latestRevisionId: string,
  title: string,
  updatedAt: number,
) {
  return {
    lessonId,
    title,
    conceptCount: 3,
    questionCount: 12,
    latestRevisionId,
    updatedAt,
  };
}

function started(revisionId: string, epoch = 0) {
  return {
    id: crypto.randomUUID(),
    type: "lesson_started",
    lessonRevisionId: revisionId,
    epoch,
    occurredAt: "2026-09-20T10:01:00Z",
  };
}

Deno.test("server lessons and cached revisions merge into one entry per Lesson, newest first", () => {
  const shelf = buildShelf({
    cached: [
      revision(LESSON, R1, "Cached and owned"),
      revision(
        "guest-only",
        "rev-g",
        "Only on this device",
        "2026-09-01T00:00:00Z",
      ),
    ],
    remote: [
      remote(
        "server-only",
        "rev-s",
        "Just created",
        Date.parse("2026-09-21T09:00:00Z"),
      ),
      remote(
        LESSON,
        R1,
        "Cached and owned",
        Date.parse("2026-09-10T00:00:00Z"),
      ),
    ],
    streams: [],
    learningEvents: [],
  });
  assertEquals(shelf.map((entry) => entry.lessonId), [
    "server-only",
    LESSON,
    "guest-only",
  ]);
  assertEquals(shelf.map((entry) => entry.progress.state), [
    "not_started",
    "not_started",
    "not_started",
  ]);
  assertEquals(shelf[0].lesson, null);
  assertEquals(shelf[0].revisionId, "rev-s");
  assertEquals(shelf[0].conceptCount, 3);
  assert(shelf[1].lesson);
  assertEquals(shelf.filter((entry) => entry.lessonId === LESSON).length, 1);
});

Deno.test("a guest sees only what this device cached, and evidence pins the revision it was recorded against", () => {
  const shelf = buildShelf({
    cached: [
      revision(LESSON, R1, "Old", "2026-09-01T00:00:00Z"),
      revision(LESSON, R2, "New", "2026-09-15T00:00:00Z"),
    ],
    remote: null,
    streams: [],
    learningEvents: [started(R1)],
  });
  assertEquals(shelf.length, 1);
  assertEquals(shelf[0].revisionId, R1);
  assertEquals(shelf[0].progress.state, "in_progress");
  assertEquals(shelf[0].outdated, false);
  assertEquals(shelf[0].latestRevisionId, null);
});

Deno.test("Outdated appears only when progress exists on an older revision than the server's newest", () => {
  const input = {
    cached: [revision(LESSON, R1, "Old")],
    remote: [remote(LESSON, R2, "New", 10)],
    streams: [{ id: LESSON, revisionId: R1, epoch: 0 }],
    learningEvents: [started(R1)],
  };
  const [withProgress] = buildShelf(input);
  assertEquals(withProgress.outdated, true);
  assertEquals(
    withProgress.revisionId,
    R1,
    "progress stays pinned to the old revision",
  );
  assertEquals(withProgress.title, "Old");

  const [unstarted] = buildShelf({ ...input, learningEvents: [] });
  assertEquals(unstarted.outdated, false);
  assertEquals(
    unstarted.revisionId,
    R2,
    "an unstarted lesson follows the server to the newest revision",
  );
  assertEquals(unstarted.lesson, null, "the newest revision is not cached yet");
});

Deno.test("evidence from another epoch or revision never counts", () => {
  const events = [started(R1, 0), started(R2, 0), started(R2, 1)];
  assertEquals(evidenceFor(events, R2, 1).length, 1);
  assertEquals(evidenceFor(events, R1, 1).length, 0);
  const [entry] = buildShelf({
    cached: [revision(LESSON, R1, "Old"), revision(LESSON, R2, "New")],
    remote: [remote(LESSON, R2, "New", 10)],
    streams: [{ id: LESSON, revisionId: R2, epoch: 1 }],
    learningEvents: [started(R1, 0)],
  });
  assertEquals(entry.revisionId, R2);
  assertEquals(entry.progress.state, "not_started");
  assertEquals(entry.outdated, false);
});

Deno.test("discarding advances the epoch and repins; opening pins at the current epoch", () => {
  const stream = { id: LESSON, revisionId: R1, epoch: 3 };
  assertEquals(discardTo(stream, R2), { id: LESSON, revisionId: R2, epoch: 4 });
  const [entry] = buildShelf({
    cached: [revision(LESSON, R1, "Old")],
    remote: null,
    streams: [],
    learningEvents: [],
  });
  assertEquals(pinOnOpen(undefined, entry), {
    id: LESSON,
    revisionId: R1,
    epoch: 0,
  });
  assertEquals(pinOnOpen(stream, { ...entry, revisionId: R1 }), stream);
  assertEquals(
    pinOnOpen({ id: LESSON, revisionId: R1, epoch: 2 }, {
      ...entry,
      revisionId: R2,
    }),
    { id: LESSON, revisionId: R2, epoch: 2 },
  );
});

Deno.test("an empty device and no server answer is an empty shelf, not an error", () => {
  assertEquals(
    buildShelf({ cached: [], remote: null, streams: [], learningEvents: [] }),
    [],
  );
});
