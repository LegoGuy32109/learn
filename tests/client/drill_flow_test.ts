import { assert, assertEquals } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with {
  type: "json",
};
import {
  advanceDrill,
  drillPosition,
  startDrill,
} from "../../src/client/learning/drill-flow.js";
import {
  current,
  enterCorrective,
  leaveCorrective,
  submitAnswer,
} from "../../src/client/learning/flow.js";
import { drillQueue } from "../../src/shared/learning/drill.js";

const run = { seed: 7, runId: "run-1" };

function wrongAnswer(question: any): string {
  if (question.type === "mcq") {
    const concept = lesson.concepts.find((candidate) =>
      candidate.id === question.conceptId
    ) as any;
    return concept.options.find((option: any) => option.id !== question.key).id;
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
  assertEquals(current(lesson, flow as any).id, flow.queue[0]);
  assertEquals(startDrill(lesson, run).queue, flow.queue);
});

Deno.test("drill asks each Question once, wrong or not, and ends on the summary", () => {
  let flow = startDrill(lesson, run);
  const asked: string[] = [];
  for (let steps = 0; steps < 50 && flow.screen !== "summary"; steps++) {
    const question = current(lesson, flow as any);
    asked.push(question.id);
    const submitted = submitAnswer(
      lesson,
      flow as any,
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
    flow = advanceDrill(submitted.flow as any);
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
    (lesson.questions as any[]).find((question) => question.id === id).type ===
      "mcq"
  );
  flow = { ...flow, queue: flow.queue.slice(index) };
  const question = current(lesson, flow as any);
  const concept = lesson.concepts.find((candidate) =>
    candidate.id === question.conceptId
  ) as any;
  const distractor = wrongAnswer(question);
  const submitted = submitAnswer(lesson, flow as any, distractor, false);
  const misconception = concept.misconceptions.find((candidate: any) =>
    candidate.id === question.map[distractor]
  );
  assertEquals(submitted.flow.feedback?.belief, misconception.statement);
  assertEquals(submitted.flow.feedback?.cardId, misconception.correctingCardId);
  const detour = enterCorrective(lesson, submitted.flow as any);
  assertEquals(detour.screen, "corrective");
  assertEquals(current(lesson, detour).id, misconception.correctingCardId);
  const back = leaveCorrective(detour);
  assertEquals(back.screen, "question");
  assertEquals(back.queue, submitted.flow.queue);
  assertEquals(back.feedback, submitted.flow.feedback);
});
