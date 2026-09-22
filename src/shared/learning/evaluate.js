// @ts-check

/** @param {string} value */
export function canonicalize(value) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Decide whether a submitted answer is correct. MCQ answers are option IDs from the Concept's
 * shared option set and are compared with the Question's key.
 * @param {any} lesson
 * @param {any} question
 * @param {unknown} answer
 */
export function evaluateAnswer(lesson, question, answer) {
  if (question.type === "mcq") {
    const concept = lesson.concepts.find((/** @type {any} */ candidate) => candidate.id === question.conceptId);
    const known = concept?.options.some((/** @type {any} */ option) => option.id === answer) ?? false;
    return known && answer === question.key;
  }
  if (question.type === "numeric") {
    if (typeof answer !== "string" && typeof answer !== "number") return false;
    const input = String(answer).trim();
    if (!DECIMAL.test(input)) return false;
    return Math.abs(Number(input) - question.answer) <= (question.tolerance ?? 0);
  }
  const accepted = [question.answer, ...(question.aliases || [])].map(canonicalize);
  return accepted.includes(canonicalize(String(answer ?? "")));
}
