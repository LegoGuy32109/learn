// @ts-check

/**
 * @param {any} lesson
 * @param {any[]} events
 */
export function reduceProgress(lesson, events) {
  const cards = new Set(events.filter((event) => event.type === "card_seen").map((event) => event.cardId));
  const wrapUpCorrect = events.filter((event) => event.type === "question_answered" && event.flowKind === "wrap_up" && event.correct);
  const learned = new Set(wrapUpCorrect.map((event) => event.conceptId));
  const started = events.some((event) => event.type === "lesson_started") || cards.size > 0;
  const conceptStates = lesson.concepts.map((concept) => ({
    id: concept.id,
    seen: concept.cards.every((card) => cards.has(card.id)),
    learned: learned.has(concept.id),
  }));
  const allSeen = conceptStates.every((concept) => concept.seen);
  const allLearned = conceptStates.every((concept) => concept.learned);
  let state = "not_started";
  if (started) state = "in_progress";
  if (allSeen) state = "seen";
  if (allLearned) state = "learned";
  return { cardsSeen: cards, learnedConcepts: learned, conceptStates, state };
}
