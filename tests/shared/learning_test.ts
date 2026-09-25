import { assert, assertEquals } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with {
  type: "json",
};
import { validateLesson } from "../../src/shared/lessons/lesson.js";
import {
  canonicalize,
  evaluateAnswer,
} from "../../src/shared/learning/evaluate.js";
import { reduceProgress } from "../../src/shared/learning/progress.js";
import { shuffled } from "../../src/shared/learning/shuffle.js";
import { reduceCheckpoint } from "../../src/shared/learning/checkpoint.js";
import {
  advanceCheck,
  advanceWrapUp,
} from "../../src/shared/learning/transitions.js";

Deno.test("demo fixture satisfies structural invariants", () =>
  assertEquals(validateLesson(lesson), []));
Deno.test("answer evaluation is exact and normalized", () => {
  const [mcq, numeric, short] = lesson.questions as any[];
  assertEquals(mcq.type, "mcq");
  assertEquals(numeric.type, "numeric");
  assertEquals(short.type, "short");
  assert(evaluateAnswer(lesson, mcq, mcq.key));
  assert(!evaluateAnswer(lesson, mcq, "revalidate"));
  assert(!evaluateAnswer(lesson, mcq, "not-an-option"));
  assert(evaluateAnswer(lesson, short, "  THE   AGE HEADER "));
  assert(evaluateAnswer(lesson, short, "age"));
  assert(!evaluateAnswer(lesson, short, "ages"));
  assert(evaluateAnswer(lesson, numeric, "180.0"));
  assert(evaluateAnswer(lesson, numeric, "184"));
  assert(!evaluateAnswer(lesson, numeric, "186"));
  assert(!evaluateAnswer(lesson, numeric, "180 seconds"));
  assertEquals(canonicalize(" A\u00a0 B "), "a b");
});
Deno.test("MCQ keys point at the shared option set and the key moves across a Concept's MCQs", () => {
  for (const concept of lesson.concepts as any[]) {
    assertEquals(concept.options.length, 3);
    const mcqs = lesson.questions.filter((question: any) =>
      question.conceptId === concept.id && question.type === "mcq"
    ) as any[];
    for (const question of mcqs) {
      assert(concept.options.some((option: any) => option.id === question.key));
    }
    assert(
      new Set(mcqs.map((question) => question.key)).size > 1,
      `${concept.title}: the key never moves`,
    );
  }
});
Deno.test("progress reducer is monotonic and derives learned", () => {
  const events: any[] = [{ type: "lesson_started" }];
  assertEquals(reduceProgress(lesson, events).state, "in_progress");
  for (const c of lesson.concepts) {
    for (const card of c.cards) {
      events.push({ type: "card_seen", cardId: card.id });
    }
  }
  assertEquals(reduceProgress(lesson, events).state, "seen");
  for (const c of lesson.concepts) {
    events.push({
      type: "question_answered",
      flowKind: "wrap_up",
      correct: true,
      conceptId: c.id,
    });
  }
  assertEquals(reduceProgress(lesson, events).state, "learned");
});
Deno.test("shuffling is stable and seed-sensitive", () => {
  assertEquals(shuffled([1, 2, 3, 4], 99), shuffled([1, 2, 3, 4], 99));
  assert(
    shuffled([1, 2, 3, 4], 99).join() != shuffled([1, 2, 3, 4], 11).join(),
  );
});
Deno.test("checkpoint reconstruction chooses the last immutable checkpoint", () => {
  const events = [{
    type: "navigation_checkpointed",
    occurredAt: "2026-01-01T00:00:00Z",
    checkpoint: { screen: "card", cardIndex: 0 },
  }, {
    type: "navigation_checkpointed",
    occurredAt: "2026-01-01T00:01:00Z",
    checkpoint: { screen: "question", queue: ["q"] },
  }];
  assertEquals(reduceCheckpoint(events), { screen: "question", queue: ["q"] });
});
Deno.test("Check and Wrap-up transitions preserve their distinct retry rules", () => {
  assertEquals(
    advanceCheck({ queue: ["a", "b", "c"], correct: false, idk: false }).queue,
    ["b", "c"],
  );
  assert(advanceCheck({ queue: ["a", "b"], correct: false, idk: true }).done);
  assertEquals(
    advanceWrapUp({ queue: ["a", "b"], correct: true, seed: 2 }).queue,
    ["b"],
  );
  const retry = advanceWrapUp({ queue: ["a", "b"], correct: false, seed: 2 });
  assertEquals(new Set(retry.queue), new Set(["a", "b"]));
  assert(!retry.done);
});
Deno.test("a missed Wrap-up Concept is asked last, behind every remaining Concept, for many seeds", () => {
  for (let seed = 0; seed < 50; seed++) {
    const next = advanceWrapUp({
      queue: ["missed", "b", "c", "d"],
      correct: false,
      seed,
    });
    assertEquals(next.queue.at(-1), "missed");
    assertEquals(new Set(next.queue.slice(0, 3)), new Set(["b", "c", "d"]));
    assert(!next.done);
  }
  assertEquals(
    advanceWrapUp({ queue: ["missed", "b"], correct: false, seed: 5 }).queue,
    ["b", "missed"],
  );
  assertEquals(
    advanceWrapUp({ queue: ["missed"], correct: false, seed: 5 }).queue,
    ["missed"],
  );
});
