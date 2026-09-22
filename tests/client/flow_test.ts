import { assert, assertEquals } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import {
  activeConcept,
  advance,
  atFirstCard,
  buildFeedback,
  cardsFlow,
  continueFromCard,
  current,
  enterCorrective,
  initialFlow,
  leaveCorrective,
  leavesShellOnBack,
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

Deno.test("Back inspects the previous Card and stays put at the first Card and on the summary", () => {
  const second = continueFromCard(lesson, initialFlow(), attempt);
  assertEquals(stepBack(lesson, second).cardIndex, 0);
  assertEquals(stepBack(lesson, second).detour, null);
  assertEquals(stepBack(lesson, initialFlow()), initialFlow());
  assert(leavesShellOnBack(initialFlow()));
  assert(!leavesShellOnBack(second));
  const summary = { ...startWrapUp(lesson, attempt), screen: "summary" as const, queue: [] };
  assertEquals(stepBack(lesson, summary), summary);
  assert(leavesShellOnBack(summary));
});

Deno.test("Back on a Question looks back at the Concept's last Card, and Continue there returns to the Question", () => {
  const lastCard = firstConcept.cards.length - 1;
  const check = afterFirstConcept();
  const lookedBack = stepBack(lesson, check);
  assertEquals(lookedBack.screen, "card");
  assertEquals(lookedBack.conceptIndex, 0);
  assertEquals(lookedBack.cardIndex, lastCard);
  assertEquals(current(lesson, lookedBack).id, firstConcept.cards[lastCard].id);
  assertEquals(lookedBack.detour, check);
  // Continue on the looked-back Card returns to the same unanswered Question, never a new Check.
  assertEquals(continueFromCard(lesson, lookedBack, { seed: 99, attemptId: "other" }), check);
  // Back pages through the Concept's Cards, and Continue walks forward to the Question again.
  const earlier = stepBack(lesson, lookedBack);
  assertEquals(earlier.cardIndex, lastCard - 1);
  assertEquals(earlier.detour, check);
  assertEquals(continueFromCard(lesson, continueFromCard(lesson, earlier, attempt), attempt), check);
  // Feedback keeps its answer through a look-back.
  const answered = submitAnswer(lesson, check, wrongAnswer(current(lesson, check)), false).flow;
  const fromFeedback = stepBack(lesson, answered);
  assertEquals(fromFeedback.screen, "card");
  assertEquals(continueFromCard(lesson, fromFeedback, attempt), answered);
});

Deno.test("Back on a correcting Card returns to the Question it interrupted", () => {
  const check = afterFirstConcept();
  const answered = submitAnswer(lesson, check, wrongAnswer(current(lesson, check)), false).flow;
  const detour = enterCorrective(lesson, answered);
  assertEquals(stepBack(lesson, detour), answered);
});

Deno.test("Back on the first Card of a later Concept looks back at the previous Concept without reversing progress", () => {
  const conceptTwo = cardsFlow(1);
  const lookedBack = stepBack(lesson, conceptTwo);
  assertEquals(lookedBack.screen, "card");
  assertEquals(lookedBack.conceptIndex, 0);
  assertEquals(lookedBack.cardIndex, firstConcept.cards.length - 1);
  assertEquals(lookedBack.detour, conceptTwo);
  assertEquals(continueFromCard(lesson, lookedBack, attempt), conceptTwo);
  // A look-back never nests: paging back again keeps the original return point.
  const earlier = stepBack(lesson, lookedBack);
  assertEquals(earlier.detour, conceptTwo);
  // The Wrap-up looks back at the Card of the Question's own Concept.
  const wrapUp = startWrapUp(lesson, attempt);
  const question = current(lesson, wrapUp);
  const concept = conceptOf(question);
  const fromWrapUp = stepBack(lesson, wrapUp);
  assertEquals(fromWrapUp.conceptIndex, lesson.concepts.indexOf(concept));
  assertEquals(fromWrapUp.cardIndex, concept.cards.length - 1);
  assertEquals(continueFromCard(lesson, fromWrapUp, attempt), wrapUp);
});

Deno.test("MCQ option order depends on the Question as well as the seed, and is stable for a reload", async () => {
  const { optionOrder } = await import("../../src/client/learning/views.js");
  const concept = lesson.concepts[0] as any;
  const mcqs = (lesson.questions as any[]).filter((question) => question.conceptId === concept.id && question.type === "mcq");
  assert(mcqs.length > 1);
  const orders = new Set(mcqs.map((question) => optionOrder(concept, question, { seed: 7 }).map((option: any) => option.id).join(",")));
  assert(orders.size > 1);
  const again = optionOrder(concept, mcqs[0], { seed: 7 }).map((option: any) => option.id);
  assertEquals(again, optionOrder(concept, mcqs[0], { seed: 7 }).map((option: any) => option.id));
  assertEquals(new Set(again), new Set(concept.options.map((option: any) => option.id)));
});
