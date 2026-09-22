// @ts-check
// Flow controller: pure transitions over the learner's position in one Lesson Revision.
// Randomness (seeds, attempt IDs) is passed in so every function is deterministic and testable.
import { shuffled } from "../../shared/learning/shuffle.js";
import { evaluateAnswer } from "../../shared/learning/evaluate.js";
import { advanceCheck, advanceWrapUp } from "../../shared/learning/transitions.js";
import { poolQuestions } from "../../shared/lessons/lesson.js";

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
 * @property {Feedback|null} feedback  Submitted feedback, or null while a Question is unanswered
 * @property {any} detour  The flow to return to from a correcting Card
 * @property {string[]} [learningEventFrontier]
 */

/** @typedef {{ seed: number, attemptId: string }} Attempt */

/**
 * Feedback for one submitted answer. `belief` is the misconception behind a chosen MCQ distractor.
 * `cardId` is the Card that corrects the answer: the misconception's Card for a distractor, otherwise
 * the Question's own correcting Card. Correct answers carry neither.
 * @typedef {object} Feedback
 * @property {boolean} correct
 * @property {boolean} idk
 * @property {string} text
 * @property {string|null} belief
 * @property {string|null} cardId
 */

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
 * @param {"drawable" | "reserved" | "all"} kind
 * @returns {string[]}
 */
function questionIds(lesson, concept, kind) {
  return poolQuestions(lesson, concept.id, kind).map((question) => question.id);
}

/**
 * Begin the formative Check for the Concept the learner just finished reading.
 * A Check never draws a reserved Question; those are kept back for the Wrap-up.
 * @param {any} lesson
 * @param {Flow} flow
 * @param {Attempt} attempt
 * @returns {Flow}
 */
export function startCheck(lesson, flow, attempt) {
  const concept = lesson.concepts[flow.conceptIndex];
  const queue = shuffled(questionIds(lesson, concept, "drawable"), attempt.seed);
  return { ...flow, screen: "question", flowKind: "check", seed: attempt.seed, attemptId: attempt.attemptId, queue, feedback: null };
}

/**
 * The Question the Wrap-up asks for one Concept: a reserved Question first, so the learner
 * meets one the Checks never showed. Only a Pool without a reserved Question falls back to any.
 * @param {any} lesson
 * @param {any} concept
 * @param {number} seed
 */
export function wrapUpQuestionId(lesson, concept, seed) {
  const reserved = questionIds(lesson, concept, "reserved");
  const candidates = reserved.length ? reserved : questionIds(lesson, concept, "all");
  return shuffled(candidates, seed)[0];
}

/**
 * Begin the Wrap-up: one Question per Concept in authored Concept order.
 * @param {any} lesson
 * @param {Attempt} attempt
 * @returns {Flow}
 */
export function startWrapUp(lesson, attempt) {
  const queue = lesson.concepts.map((concept, index) => wrapUpQuestionId(lesson, concept, attempt.seed + index));
  const position = { conceptIndex: lesson.concepts.length - 1, cardIndex: 0 };
  const attemptFields = { seed: attempt.seed, attemptId: attempt.attemptId, queue, wrapTotal: queue.length };
  return { screen: "question", flowKind: "wrap_up", ...position, ...attemptFields, feedback: null, detour: null };
}

/**
 * Continue from a Card: the next Card, or the Concept Check after the last one. While the learner
 * is looking back at Cards they already read (a `detour` is set), the last Card returns to the
 * Question or Card the look-back started from instead of opening a new Check.
 * @param {any} lesson
 * @param {Flow} flow
 * @param {Attempt} attempt
 * @returns {Flow}
 */
export function continueFromCard(lesson, flow, attempt) {
  const concept = lesson.concepts[flow.conceptIndex];
  if (flow.cardIndex < concept.cards.length - 1) return { ...flow, cardIndex: flow.cardIndex + 1 };
  if (flow.detour) return leaveCorrective(flow);
  return startCheck(lesson, flow, attempt);
}

/**
 * The Concept that owns a Question.
 * @param {any} lesson
 * @param {any} question
 */
function conceptOf(lesson, question) {
  return lesson.concepts.find((/** @type {any} */ concept) => concept.id === question.conceptId);
}

/**
 * Feedback for one submitted answer, following the plugin's pedagogy: every option has its own
 * feedback, a chosen distractor names the belief behind it, and every wrong or unknown answer
 * points at the Card that corrects it.
 * @param {any} lesson
 * @param {any} question
 * @param {unknown} answer
 * @param {boolean} idk
 * @param {boolean} correct
 * @returns {Feedback}
 */
export function buildFeedback(lesson, question, answer, idk, correct) {
  const concept = conceptOf(lesson, question);
  if (question.type !== "mcq") {
    const text = idk ? `The answer is ${question.answer}${question.unit ? ` ${question.unit}` : ""}. ${question.feedback}` : question.feedback;
    return { correct, idk, text, belief: null, cardId: correct ? null : question.correctingCardId };
  }
  const keyText = concept.options.find((/** @type {any} */ option) => option.id === question.key)?.text ?? "";
  if (idk) {
    return { correct: false, idk: true, text: `The answer is: ${keyText} ${question.feedback[question.key]}`, belief: null, cardId: question.correctingCardId };
  }
  const chosen = typeof answer === "string" && Object.hasOwn(question.feedback, answer) ? answer : question.key;
  const text = question.feedback[chosen];
  if (correct) return { correct: true, idk: false, text, belief: null, cardId: null };
  const misconceptionId = Object.hasOwn(question.map, chosen) ? question.map[chosen] : null;
  const misconception = concept.misconceptions.find((/** @type {any} */ candidate) => candidate.id === misconceptionId);
  return {
    correct: false,
    idk: false,
    text,
    belief: misconception?.statement ?? null,
    cardId: misconception?.correctingCardId ?? question.correctingCardId,
  };
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
  const correct = !idk && evaluateAnswer(lesson, question, answer);
  const feedback = buildFeedback(lesson, question, answer, idk, correct);
  return { question, correct, flow: { ...flow, feedback } };
}

/**
 * Leave feedback: retry from the Concept, move to the next Concept, start the Wrap-up, or finish.
 * @param {any} lesson
 * @param {Flow} flow
 * @param {Attempt} attempt
 * @returns {Flow}
 */
export function advance(lesson, flow, attempt) {
  const feedback = flow.feedback ?? { correct: false, idk: false };
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
  const cardId = flow.feedback?.cardId ?? question.correctingCardId;
  const owns = (/** @type {any} */ card) => card.id === cardId;
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
 * Look back at the last Card of a Concept from a Question or from the first Card of the next
 * Concept. The look-back is a detour like the correcting Card: it remembers the flow it started
 * from, and Continue on that last Card returns there. An open detour is kept, never nested.
 * @param {any} lesson
 * @param {Flow} flow
 * @param {number} conceptIndex  The Concept whose Cards to look back at
 * @returns {Flow}
 */
function lookBack(lesson, flow, conceptIndex) {
  const detour = flow.detour ?? structuredClone(flow);
  const cardIndex = lesson.concepts[conceptIndex].cards.length - 1;
  return { ...flow, detour, screen: "card", conceptIndex, cardIndex };
}

/**
 * The square Back action: move to the prior surface without touching progress.
 * - A correcting Card returns to the Question it interrupted, as in drill.
 * - A Question, answered or not, looks back at the last Card of its Concept.
 * - A Card shows the previous Card, or the last Card of the previous Concept at a Concept's first
 *   Card. Looking back never reverses progress: Continue on the last Card of a look-back returns to
 *   where the look-back started rather than opening a Check.
 * - The very first Card and the Learned summary stay put; the shell leaves for the overview there.
 * @param {any} lesson
 * @param {Flow} flow
 * @returns {Flow}
 */
export function stepBack(lesson, flow) {
  if (flow.screen === "corrective") return leaveCorrective(flow);
  if (flow.screen === "question") {
    const concept = activeConcept(lesson, flow);
    return lookBack(lesson, flow, lesson.concepts.indexOf(concept));
  }
  if (flow.screen === "card" && flow.cardIndex > 0) return { ...flow, cardIndex: flow.cardIndex - 1 };
  if (flow.screen === "card" && flow.conceptIndex > 0) return lookBack(lesson, flow, flow.conceptIndex - 1);
  return flow;
}

/**
 * Whether the square Back action has nowhere to go inside the lesson: the first Card of the first
 * Concept, or the Learned summary. The shell then returns to the overview.
 * @param {Flow} flow
 */
export function leavesShellOnBack(flow) {
  return atFirstCard(flow) || flow.screen === "summary";
}
