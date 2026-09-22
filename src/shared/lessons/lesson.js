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
    if (concept.options?.length !== 3) errors.push("each concept shares exactly three options");
    if (!concept.cards.every((card) => Array.isArray(card.body) && card.body.length > 0)) errors.push("each card body is a paragraph array");
    const pool = questions.filter((question) => question.conceptId === concept.id);
    if (pool.filter((question) => !question.reserved).length < 3) errors.push("each concept has at least 3 drawable questions");
    if (!pool.some((question) => question.reserved)) errors.push("each concept reserves a question for the Wrap-up");
  }
  const types = new Set(questions.map((question) => question.type));
  for (const type of ["mcq", "numeric", "short"]) {
    if (!types.has(type)) errors.push(`missing ${type}`);
  }
  return errors;
}

/**
 * Questions in one Concept's Pool. Reserved Questions are never drawn by a Check.
 * @param {any} lesson
 * @param {string} conceptId
 * @param {"drawable" | "reserved" | "all"} kind
 * @returns {any[]}
 */
export function poolQuestions(lesson, conceptId, kind) {
  return lesson.questions.filter((/** @type {any} */ question) => {
    if (question.conceptId !== conceptId) return false;
    if (kind === "all") return true;
    return kind === "reserved" ? question.reserved === true : question.reserved !== true;
  });
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
