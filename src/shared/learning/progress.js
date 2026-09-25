// @ts-check

/** @typedef {import("./types.d.ts").CardSeen} CardSeen */
/** @typedef {import("./types.d.ts").QuestionAnswered} QuestionAnswered */

/**
 * @param {{ type: string }} event
 * @returns {event is CardSeen}
 */
const isCardSeen = (event) => event.type === "card_seen";

/**
 * @param {{ type: string }} event
 * @returns {event is QuestionAnswered}
 */
const isAnswer = (event) => event.type === "question_answered";

/**
 * Learning state from the evidence. Events of any other type, such as drill answers, are ignored,
 * and the result does not depend on the order of the events.
 * @param {import("../lessons/types.d.ts").Lesson} lesson
 * @param {ReadonlyArray<{ type: string }>} events
 */
export function reduceProgress(lesson, events) {
  const cards = new Set(events.filter(isCardSeen).map((event) => event.cardId));
  const wrapUpCorrect = events.filter(isAnswer).filter((event) =>
    event.flowKind === "wrap_up" && event.correct
  );
  const learned = new Set(wrapUpCorrect.map((event) => event.conceptId));
  const started = events.some((event) => event.type === "lesson_started") ||
    cards.size > 0;
  const conceptStates = lesson.concepts.map((concept) => ({
    id: concept.id,
    seen: concept.cards.every((card) => cards.has(card.id)),
    learned: learned.has(concept.id),
  }));
  const allSeen = conceptStates.every((concept) => concept.seen);
  const allLearned = conceptStates.every((concept) => concept.learned);
  /** @type {"not_started" | "in_progress" | "seen" | "learned"} */
  let state = "not_started";
  if (started) state = "in_progress";
  if (allSeen) state = "seen";
  if (allLearned) state = "learned";
  return { cardsSeen: cards, learnedConcepts: learned, conceptStates, state };
}

/** @typedef {ReturnType<typeof reduceProgress>} Progress */
