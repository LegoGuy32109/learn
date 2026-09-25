import { assert, assertEquals } from "@std/assert";
import { DEMO_LESSON as lesson } from "../support/demo-lesson.ts";
import {
  describeOutcome,
  DRILL_ANSWERED,
  DRILL_CHECKPOINTED,
  drillQueue,
  reduceDrill,
  reduceDrillCheckpoint,
} from "../../src/shared/learning/drill.js";
import { reduceCheckpoint } from "../../src/shared/learning/checkpoint.js";
import { reduceProgress } from "../../src/shared/learning/progress.js";

const all = lesson.questions.map((question) => question.id);

Deno.test("the drill queue holds every Question in every Pool exactly once, reserved ones included", () => {
  for (let seed = 0; seed < 50; seed++) {
    const queue = drillQueue(lesson, seed);
    assertEquals(queue.length, all.length);
    assertEquals(new Set(queue), new Set(all));
    assert(
      lesson.questions.filter((question) => question.reserved).every((
        question,
      ) => queue.includes(question.id)),
    );
  }
});

Deno.test("the drill order is fixed by the seed and differs between seeds", () => {
  assertEquals(drillQueue(lesson, 41), drillQueue(lesson, 41));
  assert(drillQueue(lesson, 41).join() !== drillQueue(lesson, 42).join());
});

Deno.test("the drill checkpoint replays from the drill stream and a null checkpoint ends the run", () => {
  const events: Array<{
    type: string;
    occurredAt: string;
    checkpoint: Record<string, unknown> | null;
  }> = [
    {
      type: DRILL_CHECKPOINTED,
      occurredAt: "2026-01-01T00:00:00Z",
      checkpoint: { screen: "question", queue: ["a", "b"] },
    },
    {
      type: "navigation_checkpointed",
      occurredAt: "2026-01-01T00:05:00Z",
      checkpoint: { screen: "card", cardIndex: 2 },
    },
    {
      type: DRILL_CHECKPOINTED,
      occurredAt: "2026-01-01T00:01:00Z",
      checkpoint: { screen: "question", queue: ["b"] },
    },
  ];
  assertEquals(reduceDrillCheckpoint(events), {
    screen: "question",
    queue: ["b"],
  });
  assertEquals(reduceCheckpoint(events), { screen: "card", cardIndex: 2 });
  events.push({
    type: DRILL_CHECKPOINTED,
    occurredAt: "2026-01-01T00:02:00Z",
    checkpoint: null,
  });
  assertEquals(reduceDrillCheckpoint(events), null);
});

Deno.test("drill outcomes describe each Concept for one run without a score", () => {
  const [first, second] = lesson.concepts;
  const firstQuestions = lesson.questions.filter((question) =>
    question.conceptId === first.id
  );
  const events = [
    {
      type: DRILL_ANSWERED,
      runId: "run",
      conceptId: first.id,
      questionId: firstQuestions[0].id,
      correct: true,
      idk: false,
    },
    {
      type: DRILL_ANSWERED,
      runId: "run",
      conceptId: first.id,
      questionId: firstQuestions[1].id,
      correct: false,
      idk: false,
    },
    {
      type: DRILL_ANSWERED,
      runId: "run",
      conceptId: first.id,
      questionId: firstQuestions[2].id,
      correct: false,
      idk: true,
    },
    {
      type: DRILL_ANSWERED,
      runId: "other",
      conceptId: second.id,
      questionId: "x",
      correct: true,
      idk: false,
    },
  ];
  const outcomes = reduceDrill(lesson, events, "run");
  assertEquals(outcomes.length, lesson.concepts.length);
  assertEquals(outcomes[0], {
    id: first.id,
    title: first.title,
    questions: firstQuestions.length,
    asked: 3,
    retrieved: 1,
    missed: 1,
    unknown: 1,
  });
  assertEquals(outcomes[1].asked, 0);
  assertEquals(
    describeOutcome(outcomes[0]),
    "3 questions · 1 retrieved, 1 missed, 1 unknown",
  );
  assertEquals(describeOutcome(outcomes[1]), "Not reached");
  for (const outcome of outcomes) {
    assert(!/score|%/i.test(describeOutcome(outcome)));
  }
});

Deno.test("drill answers never move learning progress", () => {
  const events = lesson.questions.map((question) => ({
    type: DRILL_ANSWERED,
    runId: "run",
    conceptId: question.conceptId,
    questionId: question.id,
    correct: true,
    idk: false,
  }));
  assertEquals(reduceProgress(lesson, events).state, "not_started");
  assertEquals(reduceProgress(lesson, events).learnedConcepts.size, 0);
});
