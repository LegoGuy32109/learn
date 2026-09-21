import { assert, assertEquals } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import {
  activeConcept,
  advance,
  atFirstCard,
  continueFromCard,
  current,
  enterCorrective,
  initialFlow,
  leaveCorrective,
  startWrapUp,
  stepBack,
  submitAnswer,
} from "../../src/client/learning/flow.js";

const attempt = { seed: 7, attemptId: "attempt-1" };
const firstConcept = lesson.concepts[0];

function afterFirstConcept() {
  let flow = initialFlow();
  for (let index = 0; index < firstConcept.cards.length; index++) flow = continueFromCard(lesson, flow, attempt);
  return flow;
}

Deno.test("Continue walks every Card, then opens a shuffled Check for that Concept", () => {
  let flow = initialFlow();
  assert(atFirstCard(flow));
  assertEquals(current(lesson, flow).id, firstConcept.cards[0].id);
  flow = continueFromCard(lesson, flow, attempt);
  assertEquals(flow.cardIndex, 1);
  assert(!atFirstCard(flow));
  flow = afterFirstConcept();
  assertEquals(flow.screen, "question");
  assertEquals(flow.flowKind, "check");
  assertEquals(flow.attemptId, "attempt-1");
  const pool = lesson.questions.filter((question) => question.conceptId === firstConcept.id).map((question) => question.id);
  assertEquals(new Set(flow.queue), new Set(pool));
  assertEquals(flow.queue, afterFirstConcept().queue);
  assertEquals(activeConcept(lesson, flow).id, firstConcept.id);
});

Deno.test("a wrong Check answer offers another Question; the last one moves to the next Concept", () => {
  let flow = afterFirstConcept();
  const total = flow.queue.length;
  for (let remaining = total; remaining > 1; remaining--) {
    const submitted = submitAnswer(lesson, flow, "definitely wrong", false);
    assertEquals(submitted.correct, false);
    assertEquals(submitted.flow.feedback.correct, false);
    flow = advance(lesson, submitted.flow, attempt);
    assertEquals(flow.queue.length, remaining - 1);
    assertEquals(flow.feedback, null);
  }
  flow = advance(lesson, submitAnswer(lesson, flow, "still wrong", false).flow, attempt);
  assertEquals(flow.screen, "card");
  assertEquals(flow.conceptIndex, 1);
  assertEquals(flow.cardIndex, 0);
});

Deno.test("I don't know ends the Check, names the answer, and points at the correcting Card", () => {
  const flow = afterFirstConcept();
  const submitted = submitAnswer(lesson, flow, null, true);
  assertEquals(submitted.correct, false);
  assert(submitted.flow.feedback.idk);
  assert(submitted.flow.feedback.text.startsWith("The answer is "));
  const detour = enterCorrective(lesson, submitted.flow);
  assertEquals(detour.screen, "corrective");
  assertEquals(current(lesson, detour).id, submitted.question.correctingCardId);
  const back = leaveCorrective(detour);
  assertEquals(back.screen, "question");
  assertEquals(back.queue, submitted.flow.queue);
  assertEquals(back.detour, null);
  assertEquals(advance(lesson, submitted.flow, attempt).conceptIndex, 1);
});

Deno.test("the Wrap-up asks one Question per Concept, retries misses, and finishes on the summary", () => {
  let flow = startWrapUp(lesson, attempt);
  assertEquals(flow.flowKind, "wrap_up");
  assertEquals(flow.queue.length, lesson.concepts.length);
  assertEquals(flow.wrapTotal, lesson.concepts.length);
  const concepts = flow.queue.map((id) => lesson.questions.find((question) => question.id === id)?.conceptId);
  assertEquals(concepts, lesson.concepts.map((concept) => concept.id));
  const missed = flow.queue[0];
  flow = advance(lesson, submitAnswer(lesson, flow, "wrong", false).flow, attempt);
  assertEquals(flow.queue.length, lesson.concepts.length);
  assert(flow.queue.includes(missed));
  for (let steps = 0; steps < 10 && flow.screen !== "summary"; steps++) {
    const question = current(lesson, flow) as any;
    const answer = question.type === "mcq" ? question.options.find((option: any) => option.correct).id : String(question.answer);
    const submitted = submitAnswer(lesson, flow, answer, false);
    assert(submitted.correct);
    flow = advance(lesson, submitted.flow, attempt);
  }
  assertEquals(flow.screen, "summary");
  assertEquals(flow.queue, []);
});

Deno.test("Back inspects the previous Card and never touches Questions", () => {
  const second = continueFromCard(lesson, initialFlow(), attempt);
  assertEquals(stepBack(second).cardIndex, 0);
  assertEquals(stepBack(initialFlow()).cardIndex, 0);
  const check = afterFirstConcept();
  assertEquals(stepBack(check), check);
});
