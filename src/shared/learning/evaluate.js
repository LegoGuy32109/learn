// @ts-check
/** @param {string} value */
export function canonicalize(value) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase(); }
/** @param {any} question @param {unknown} answer */
export function evaluateAnswer(question, answer) {
  if (question.type === "mcq") return question.options.some((o) => o.id === answer && o.correct);
  if (question.type === "numeric") {
    if (typeof answer !== "string" && typeof answer !== "number") return false;
    const input = String(answer).trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input)) return false;
    return Math.abs(Number(input) - question.answer) <= (question.tolerance ?? 0);
  }
  const accepted = [question.answer, ...(question.aliases || [])].map(canonicalize);
  return accepted.includes(canonicalize(String(answer ?? "")));
}
