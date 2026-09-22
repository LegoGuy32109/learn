import { assert, assertEquals } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import {
  activeConcept,
  advance,
  atFirstCard,
  buildFeedback,
  continueFromCard,
  current,
  enterCorrective,
  initialFlow,
  leaveCorrective,
  startWrapUp,
  stepBack,
  submitAnswer,
  wrapUpQuestionId,
} from "../../src/client/learning/flow.js";
import { poolQuestions } from "../../src/shared/lessons/lesson.js";

const attempt = { seed: 7, attemptId: "attempt-1" };
const firstConcept = lesson.concepts[0];
const anyLesson = lesson as any;

function afterFirstConcept() {
  let flow = initialFlow();
  for (let index = 0; index < firstConcept.cards.length; index++) flow = continueFromCard(lesson, flow, attempt);
  return flow;
}

function questionById(id: string): any {
  return lesson.questions.find((question) => question.id === id);
}

function conceptOf(question: any): any {
  return lesson.concepts.find((concept) => concept.id === question.conceptId);
}

function correctAnswer(question: any): string {
  if (question.type === "mcq") return question.key;
  return String(question.answer);
}

function wrongAnswer(question: any): string {
  if (question.type === "mcq") return conceptOf(question).options.find((option: any) => option.id !== question.key).id;
  return "definitely wrong";
}

Deno.test("Continue walks every Card, then opens a shuffled Check over the drawable Questions only", () => {
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
  const drawable = poolQuestions(anyLesson, firstConcept.id, "drawable").map((question) => question.id);
  const reserved = poolQuestions(anyLesson, firstConcept.id, "reserved").map((question) => question.id);
  assertEquals(new Set(flow.queue), new Set(drawable));
  assert(reserved.length >= 1);
  for (const id of reserved) assert(!flow.queue.includes(id), "a Check drew a reserved Question");
  assertEquals(flow.queue, afterFirstConcept().queue);
  assertEquals(activeConcept(lesson, flow).id, firstConcept.id);
});

Deno.test("the Check never draws a reserved Question for any seed or Concept", () => {
  for (const [conceptIndex, concept] of lesson.concepts.entries()) {
    const reserved = new Set(poolQuestions(anyLesson, concept.id, "reserved").map((question) => question.id));
    for (let seed = 0; seed < 50; seed++) {
      let flow = { ...initialFlow(), conceptIndex };
      for (let index = 0; index < concept.cards.length; index++) flow = continueFromCard(lesson, flow, { seed, attemptId: `s${seed}` });
      assertEquals(flow.flowKind, "check");
      for (const id of flow.queue) assert(!reserved.has(id));
      assertEquals(flow.queue.length, poolQuestions(anyLesson, concept.id, "drawable").length);
    }
  }
});

Deno.test("the Wrap-up draws a reserved Question for every Concept, so it is one the Checks never showed", () => {
  for (let seed = 0; seed < 50; seed++) {
    const flow = startWrapUp(lesson, { seed, attemptId: `w${seed}` });
    assertEquals(flow.queue.length, lesson.concepts.length);
    for (const [index, concept] of lesson.concepts.entries()) {
      const question = questionById(flow.queue[index]);
      assertEquals(question.conceptId, concept.id);
      assertEquals(question.reserved, true);
      assertEquals(wrapUpQuestionId(lesson, concept, seed + index), question.id);
    }
  }
});

Deno.test("a Pool without a reserved Question falls back to any Question so the Wrap-up still asks", () => {
  const unreserved = structuredClone(lesson) as any;
  for (const question of unreserved.questions) question.reserved = false;
  const flow = startWrapUp(unreserved, attempt);
  assertEquals(flow.queue.length, unreserved.concepts.length);
});

Deno.test("a wrong Check answer offers another Question; the last one moves to the next Concept", () => {
  let flow = afterFirstConcept();
  const total = flow.queue.length;
  for (let remaining = total; remaining > 1; remaining--) {
    const submitted = submitAnswer(lesson, flow, wrongAnswer(current(lesson, flow)), false);
    assertEquals(submitted.correct, false);
    assertEquals(submitted.flow.feedback?.correct, false);
    flow = advance(lesson, submitted.flow, attempt);
    assertEquals(flow.queue.length, remaining - 1);
    assertEquals(flow.feedback, null);
  }
  flow = advance(lesson, submitAnswer(lesson, flow, wrongAnswer(current(lesson, flow)), false).flow, attempt);
  assertEquals(flow.screen, "card");
  assertEquals(flow.conceptIndex, 1);
  assertEquals(flow.cardIndex, 0);
});

Deno.test("a chosen distractor names the belief behind it and the Card in the same Concept that corrects it", () => {
  for (const question of lesson.questions.filter((candidate) => candidate.type === "mcq") as any[]) {
    const concept = conceptOf(question);
    for (const option of concept.options) {
      const feedback = buildFeedback(lesson, question, option.id, false, option.id === question.key);
      assertEquals(feedback.text, question.feedback[option.id]);
      if (option.id === question.key) {
        assert(feedback.correct);
        assertEquals(feedback.belief, null);
        assertEquals(feedback.cardId, null);
        continue;
      }
      const misconception = concept.misconceptions.find((candidate: any) => candidate.id === question.map[option.id]);
      assert(misconception, `${question.id} maps ${option.id} to a real misconception`);
      assertEquals(feedback.belief, misconception.statement);
      assertEquals(feedback.cardId, misconception.correctingCardId);
      assert(concept.cards.some((card: any) => card.id === feedback.cardId), "the correcting Card is in the same Concept");
    }
  }
});

Deno.test("numeric and short answers carry the Question feedback and the Question's correcting Card", () => {
  for (const question of lesson.questions.filter((candidate) => candidate.type !== "mcq") as any[]) {
    const right = buildFeedback(lesson, question, correctAnswer(question), false, true);
    assertEquals(right, { correct: true, idk: false, text: question.feedback, belief: null, cardId: null });
    const wrong = buildFeedback(lesson, question, "nope", false, false);
    assertEquals(wrong.belief, null);
    assertEquals(wrong.cardId, question.correctingCardId);
    assertEquals(wrong.text, question.feedback);
  }
});

Deno.test("correct feedback never auto-advances and keeps the key's feedback", () => {
  const flow = afterFirstConcept();
  const question = current(lesson, flow);
  const submitted = submitAnswer(lesson, flow, correctAnswer(question), false);
  assert(submitted.correct);
  assertEquals(submitted.flow.screen, "question");
  assertEquals(submitted.flow.queue, flow.queue);
  assertEquals(submitted.flow.feedback?.text, question.type === "mcq" ? question.feedback[question.key] : question.feedback);
});

Deno.test("I don't know ends the Check, names the answer, and points at the correcting Card", () => {
  const flow = afterFirstConcept();
  const submitted = submitAnswer(lesson, flow, null, true);
  assertEquals(submitted.correct, false);
  assert(submitted.flow.feedback?.idk);
  assert(submitted.flow.feedback?.text.startsWith("The answer is"));
  assertEquals(submitted.flow.feedback?.cardId, submitted.question.correctingCardId);
  const detour = enterCorrective(lesson, submitted.flow);
  assertEquals(detour.screen, "corrective");
  assertEquals(current(lesson, detour).id, submitted.question.correctingCardId);
  const back = leaveCorrective(detour);
  assertEquals(back.screen, "question");
  assertEquals(back.queue, submitted.flow.queue);
  assertEquals(back.detour, null);
  assertEquals(advance(lesson, submitted.flow, attempt).conceptIndex, 1);
});

Deno.test("the corrective detour opens the misconception's Card for a chosen distractor", () => {
  const flow = afterFirstConcept();
  const mcqIndex = flow.queue.findIndex((id) => questionById(id).type === "mcq");
  const positioned = { ...flow, queue: flow.queue.slice(mcqIndex) };
  const question = current(lesson, positioned);
  const distractor = wrongAnswer(question);
  const submitted = submitAnswer(lesson, positioned, distractor, false);
  const misconception = conceptOf(question).misconceptions.find((candidate: any) => candidate.id === question.map[distractor]);
  const detour = enterCorrective(lesson, submitted.flow);
  assertEquals(current(lesson, detour).id, misconception.correctingCardId);
});

Deno.test("the Wrap-up asks one Question per Concept, retries misses, and finishes on the summary", () => {
  let flow = startWrapUp(lesson, attempt);
  assertEquals(flow.flowKind, "wrap_up");
  assertEquals(flow.queue.length, lesson.concepts.length);
  assertEquals(flow.wrapTotal, lesson.concepts.length);
  const concepts = flow.queue.map((id) => questionById(id).conceptId);
  assertEquals(concepts, lesson.concepts.map((concept) => concept.id));
  const missed = flow.queue[0];
  flow = advance(lesson, submitAnswer(lesson, flow, wrongAnswer(current(lesson, flow)), false).flow, attempt);
  assertEquals(flow.queue.length, lesson.concepts.length);
  assert(flow.queue.includes(missed));
  for (let steps = 0; steps < 10 && flow.screen !== "summary"; steps++) {
    const submitted = submitAnswer(lesson, flow, correctAnswer(current(lesson, flow)), false);
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
