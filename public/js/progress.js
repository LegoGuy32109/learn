// @ts-check
/** @param {any} lesson @param {any[]} events */
export function reduceProgress(lesson, events) {
  const cards = new Set(events.filter((e) => e.type === "card_seen").map((e) => e.cardId));
  const learned = new Set(events.filter((e) => e.type === "question_answered" && e.flowKind === "wrap_up" && e.correct).map((e) => e.conceptId));
  const started = events.some((e) => e.type === "lesson_started") || cards.size > 0;
  const conceptStates = lesson.concepts.map((c) => ({ id:c.id, seen:c.cards.every((x) => cards.has(x.id)), learned:learned.has(c.id) }));
  const allSeen = conceptStates.every((c) => c.seen), allLearned = conceptStates.every((c) => c.learned);
  return { cardsSeen:cards, learnedConcepts:learned, conceptStates, state:allLearned ? "learned" : allSeen ? "seen" : started ? "in_progress" : "not_started" };
}
