import { assert, assertEquals } from "@std/assert";
import { DEMO_LESSON as lesson } from "../support/demo-lesson.ts";
import type { Question } from "../../src/shared/lessons/types.d.ts";
import {
  advanceDrill,
  drillPosition,
  startDrill,
} from "../../src/client/learning/drill-flow.js";
import {
  current,
  currentQuestion,
  enterCorrective,
  leaveCorrective,
  submitAnswer,
} from "../../src/client/learning/flow.js";
import { drillQueue } from "../../src/shared/learning/drill.js";

const run = { seed: 7, runId: "run-1" };

function conceptOf(question: Question) {
  const concept = lesson.concepts.find((candidate) =>
    candidate.id === question.conceptId
  );
  if (!concept) throw new Error(`No Concept owns Question ${question.id}`);
  return concept;
}

function wrongAnswer(question: Question): string {
  if (question.type === "mcq") {
    const distractor = conceptOf(question).options.find((option) =>
      option.id !== question.key
    );
    if (!distractor) throw new Error(`No distractor for ${question.id}`);
    return distractor.id;
  }
  return "definitely wrong";
}

Deno.test("a drill run starts on the first Question of the seeded order over every Question", () => {
  const flow = startDrill(lesson, run);
  assertEquals(flow.screen, "question");
  assertEquals(flow.flowKind, "drill");
  assertEquals(flow.runId, "run-1");
  assertEquals(flow.queue, drillQueue(lesson, 7));
  assertEquals(flow.total, lesson.questions.length);
  assertEquals(drillPosition(flow), 1);
  assertEquals(current(lesson, flow)?.id, flow.queue[0]);
  assertEquals(startDrill(lesson, run).queue, flow.queue);
});

Deno.test("drill asks each Question once, wrong or not, and ends on the summary", () => {
  let flow = startDrill(lesson, run);
  const asked: string[] = [];
  for (let steps = 0; steps < 50 && flow.screen !== "summary"; steps++) {
    const question = currentQuestion(lesson, flow);
    asked.push(question.id);
    const submitted = submitAnswer(
      lesson,
      flow,
      steps % 2 ? wrongAnswer(question) : null,
      steps % 2 === 0,
    );
    assertEquals(submitted.correct, false);
    assert(submitted.flow.feedback);
    assertEquals(
      submitted.flow.queue,
      flow.queue,
      "feedback never auto-advances",
    );
    flow = advanceDrill(submitted.flow);
    assertEquals(flow.feedback, null);
  }
  assertEquals(flow.screen, "summary");
  assertEquals(flow.queue, []);
  assertEquals(asked.length, lesson.questions.length);
  assertEquals(new Set(asked).size, lesson.questions.length);
});

Deno.test("a wrong drill answer carries the belief and the correcting Card, and the detour returns to the same Question", () => {
  let flow = startDrill(lesson, run);
  const index = flow.queue.findIndex((id) =>
    lesson.questions.find((question) => question.id === id)?.type === "mcq"
  );
  flow = { ...flow, queue: flow.queue.slice(index) };
  const question = currentQuestion(lesson, flow);
  assert(question.type === "mcq");
  const distractor = wrongAnswer(question);
  const submitted = submitAnswer(lesson, flow, distractor, false);
  const misconception = conceptOf(question).misconceptions.find((candidate) =>
    candidate.id === question.map[distractor]
  );
  assert(misconception, `${question.id} maps ${distractor} to a misconception`);
  assertEquals(submitted.flow.feedback?.belief, misconception.statement);
  assertEquals(submitted.flow.feedback?.cardId, misconception.correctingCardId);
  const detour = enterCorrective(lesson, submitted.flow);
  assertEquals(detour.screen, "corrective");
  assertEquals(current(lesson, detour)?.id, misconception.correctingCardId);
  const back = leaveCorrective(detour);
  assertEquals(back.screen, "question");
  assertEquals(back.queue, submitted.flow.queue);
  assertEquals(back.feedback, submitted.flow.feedback);
});
