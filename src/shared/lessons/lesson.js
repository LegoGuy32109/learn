// @ts-check

/** @param {any} lesson */
export function validateLesson(lesson) {
  const errors = [];
  if (lesson.concepts?.length !== 3) errors.push("demo has exactly three concepts");
  const ids = new Set();
  const questions = lesson.questions || [];
  for (const concept of lesson.concepts || []) {
    if (!concept.id || ids.has(concept.id)) errors.push("concept IDs must be unique");
    ids.add(concept.id);
    if (concept.cards.length < 2 || concept.cards.length > 4) errors.push("each concept has 2–4 cards");
    const pool = questions.filter((question) => question.conceptId === concept.id);
    if (pool.length < 3) errors.push("each concept has at least 3 questions");
  }
  const types = new Set(questions.map((question) => question.type));
  for (const type of ["mcq", "numeric", "short"]) {
    if (!types.has(type)) errors.push(`missing ${type}`);
  }
  return errors;
}

/**
 * @param {any} lesson
 * @param {string} id
 */
export const question = (lesson, id) => lesson.questions.find((q) => q.id === id);

/**
 * @param {any} lesson
 * @param {string} id
 */
export const card = (lesson, id) => lesson.concepts.flatMap((c) => c.cards).find((c) => c.id === id);
