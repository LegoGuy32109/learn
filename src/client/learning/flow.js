// @ts-check
// Flow controller: pure transitions over the learner's position in one Lesson Revision.
// Randomness (seeds, attempt IDs) is passed in so every function is deterministic and testable.
import { shuffled } from "../../shared/learning/shuffle.js";
import { evaluateAnswer } from "../../shared/learning/evaluate.js";
import { advanceCheck, advanceWrapUp } from "../../shared/learning/transitions.js";

/**
 * @typedef {object} Flow
 * @property {"card"|"question"|"corrective"|"summary"} screen
 * @property {number} conceptIndex  Concept being read, or the Concept a Check belongs to
 * @property {number} cardIndex
 * @property {"cards"|"check"|"wrap_up"} flowKind
 * @property {number} seed  Deterministic shuffle seed for the current attempt
 * @property {string} attemptId
 * @property {string[]} queue  Remaining Question IDs; the head is the visible Question
 * @property {number} [wrapTotal]
 * @property {any} feedback  Submitted feedback, or null while a Question is unanswered
 * @property {any} detour  The flow to return to from a correcting Card
 * @property {string[]} [learningEventFrontier]
 */

/** @typedef {{ seed: number, attemptId: string }} Attempt */

/**
 * Card-reading position at the first Card of one Concept.
 * @param {number} conceptIndex
 * @returns {Flow}
 */
export function cardsFlow(conceptIndex) {
  return { screen: "card", conceptIndex, cardIndex: 0, flowKind: "cards", seed: 0, attemptId: "", queue: [], feedback: null, detour: null };
}

/** @returns {Flow} */
export function initialFlow() {
  return cardsFlow(0);
}

/** @param {Flow} flow */
export function isCardScreen(flow) {
  return flow.screen === "card" || flow.screen === "corrective";
}

/** @param {Flow} flow */
export function atFirstCard(flow) {
  return flow.screen === "card" && flow.conceptIndex === 0 && flow.cardIndex === 0;
}

/**
 * The Card or Question the learner is looking at.
 * @param {any} lesson
 * @param {Flow} flow
 */
export function current(lesson, flow) {
  if (isCardScreen(flow)) return lesson.concepts[flow.conceptIndex].cards[flow.cardIndex];
  return lesson.questions.find((question) => question.id === flow.queue[0]);
}

/**
 * The Concept the current surface belongs to.
 * @param {any} lesson
 * @param {Flow} flow
 */
export function activeConcept(lesson, flow) {
  const item = current(lesson, flow);
  let concept;
  if (!isCardScreen(flow) && item?.conceptId) {
    concept = lesson.concepts.find((candidate) => candidate.id === item.conceptId);
  } else {
    concept = lesson.concepts[flow.conceptIndex];
  }
  return concept || lesson.concepts.at(-1);
}

/**
 * @param {any} lesson
 * @param {any} concept
 * @returns {string[]}
 */
function questionIds(lesson, concept) {
  return lesson.questions.filter((question) => question.conceptId === concept.id).map((question) => question.id);
}

/**
 * Begin the formative Check for the Concept the learner just finished reading.
 * @param {any} lesson
 * @param {Flow} flow
 * @param {Attempt} attempt
 * @returns {Flow}
 */
export function startCheck(lesson, flow, attempt) {
  const concept = lesson.concepts[flow.conceptIndex];
  const queue = shuffled(questionIds(lesson, concept), attempt.seed);
  return { ...flow, screen: "question", flowKind: "check", seed: attempt.seed, attemptId: attempt.attemptId, queue, feedback: null };
}

/**
 * Begin the Wrap-up: one Question per Concept in authored Concept order.
 * @param {any} lesson
 * @param {Attempt} attempt
 * @returns {Flow}
 */
export function startWrapUp(lesson, attempt) {
  const queue = lesson.concepts.map((concept, index) => shuffled(questionIds(lesson, concept), attempt.seed + index)[0]);
  const position = { conceptIndex: lesson.concepts.length - 1, cardIndex: 0 };
  const attemptFields = { seed: attempt.seed, attemptId: attempt.attemptId, queue, wrapTotal: queue.length };
  return { screen: "question", flowKind: "wrap_up", ...position, ...attemptFields, feedback: null, detour: null };
}

/**
 * Continue from a Card: the next Card, or the Concept Check after the last one.
 * @param {any} lesson
 * @param {Flow} flow
 * @param {Attempt} attempt
 * @returns {Flow}
 */
export function continueFromCard(lesson, flow, attempt) {
  const concept = lesson.concepts[flow.conceptIndex];
  if (flow.cardIndex < concept.cards.length - 1) return { ...flow, cardIndex: flow.cardIndex + 1 };
  return startCheck(lesson, flow, attempt);
}

/**
 * Evaluate an answer and attach feedback. Feedback never auto-advances.
 * @param {any} lesson
 * @param {Flow} flow
 * @param {unknown} answer
 * @param {boolean} idk
 * @returns {{ question: any, correct: boolean, flow: Flow }}
 */
export function submitAnswer(lesson, flow, answer, idk) {
  const question = current(lesson, flow);
  const correct = !idk && evaluateAnswer(question, answer);
  let text;
  if (idk) {
    const canonical = question.answer ?? question.options.find((option) => option.correct).text;
    text = `The answer is ${canonical}. ${question.feedback || ""}`;
  } else {
    const option = question.options?.find((candidate) => candidate.id === answer);
    text = option?.feedback || question.feedback;
  }
  return { question, correct, flow: { ...flow, feedback: { correct, idk, text } } };
}

/**
 * Leave feedback: retry from the Concept, move to the next Concept, start the Wrap-up, or finish.
 * @param {any} lesson
 * @param {Flow} flow
 * @param {Attempt} attempt
 * @returns {Flow}
 */
export function advance(lesson, flow, attempt) {
  const feedback = flow.feedback;
  if (flow.flowKind === "check") {
    const next = advanceCheck({ queue: flow.queue, correct: feedback.correct, idk: feedback.idk });
    if (!next.done) return { ...flow, queue: next.queue, feedback: null };
    if (flow.conceptIndex === lesson.concepts.length - 1) return startWrapUp(lesson, attempt);
    return cardsFlow(flow.conceptIndex + 1);
  }
  const next = advanceWrapUp({ queue: flow.queue, correct: feedback.correct, seed: flow.seed });
  const screen = next.done ? "summary" : "question";
  return { ...flow, screen, queue: next.queue, feedback: null };
}

/**
 * Open the correcting Card as a detour that remembers where to return.
 * @param {any} lesson
 * @param {Flow} flow
 * @returns {Flow}
 */
export function enterCorrective(lesson, flow) {
  const question = current(lesson, flow);
  const owns = (/** @type {any} */ card) => card.id === question.correctingCardId;
  const conceptIndex = lesson.concepts.findIndex((/** @type {any} */ concept) => concept.cards.some(owns));
  const cardIndex = lesson.concepts[conceptIndex].cards.findIndex(owns);
  return { ...flow, detour: structuredClone(flow), conceptIndex, cardIndex, screen: "corrective" };
}

/**
 * Return from the correcting Card to the Question it interrupted.
 * @param {Flow} flow
 * @returns {Flow}
 */
export function leaveCorrective(flow) {
  return { ...flow.detour, detour: null };
}

/**
 * Inspect the previous Card without touching progress. Other screens stay put.
 * @param {Flow} flow
 * @returns {Flow}
 */
export function stepBack(flow) {
  if (flow.screen === "card" && flow.cardIndex > 0) return { ...flow, cardIndex: flow.cardIndex - 1 };
  return flow;
}
