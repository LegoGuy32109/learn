// @ts-check
// Renders the Card, Question, feedback, corrective and summary views of the learning shell.
import { shuffled } from "../../shared/learning/shuffle.js";
import { card as findCard } from "../../shared/lessons/lesson.js";
import { actionButton, backButton } from "../ui/controls.js";

/** @param {string} value */
function escape(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Card paragraphs. Card bodies are authored as paragraph arrays with trusted inline HTML.
 * @param {string[]} body
 */
function paragraphs(body) {
  return body.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

/**
 * @param {any} concept
 * @param {any} card
 * @param {any} flow
 */
export function cardView(concept, card, flow) {
  const notice = flow.screen === "corrective"
    ? '<div class="notice"><span><strong>Correcting card.</strong> Review this idea, then return to the question.</span></div>'
    : "";
  const position = `${concept.title} · Card ${flow.cardIndex + 1} of ${concept.cards.length}`;
  return `${notice}<div class="cardbody"><p class="eyebrow">${position}</p><h2>${card.heading}</h2>${paragraphs(card.body)}</div>`;
}

/**
 * The correcting Card clamped to its first paragraph. The rest folds behind a disclosure so the
 * action row above it stays reachable without scrolling.
 * @param {any} card
 */
export function clampedCardView(card) {
  const [first, ...rest] = card.body;
  const more = rest.length
    ? `<details class="more"><summary>Read the rest of this card</summary>${paragraphs(rest)}</details>`
    : "";
  return `<aside class="corrects" aria-label="Correcting card"><p class="eyebrow">Corrected by</p><h3>${card.heading}</h3><p>${first}</p>${more}</aside>`;
}

/**
 * Verdict, option feedback and, for a chosen distractor, the belief behind it.
 * @param {import("./flow.js").Feedback} feedback
 */
export function feedbackView(feedback) {
  const className = feedback.correct ? "feedback good" : "feedback";
  const verdict = feedback.correct ? "Correct" : feedback.idk ? "Recorded" : "Not quite";
  const belief = feedback.belief
    ? `<div class="belief">The belief behind that option: <b>${escape(feedback.belief)}</b></div>`
    : "";
  const corrective = feedback.cardId ? '<button class="source" data-action="corrective">Review the correcting card</button>' : "";
  return `<div class="${className}"><p class="verdict">${verdict}</p><p>${feedback.text}</p></div>${belief}${corrective}`;
}

/**
 * @param {any} concept
 * @param {any} question
 * @param {any} flow
 */
function answerForm(concept, question, flow) {
  if (question.type === "mcq") {
    const options = shuffled(concept.options, flow.seed);
    const buttons = options.map((/** @type {any} */ option) => `<button class="opt" data-answer="${option.id}">${escape(option.text)}</button>`);
    return `<div class="opts">${buttons.join("")}</div>`;
  }
  const hint = question.unit ? `answer in ${question.unit}` : "one word or short phrase";
  const inputMode = question.type === "numeric" ? ' inputmode="decimal"' : "";
  return `<div class="fieldwrap"><span class="hintline">${hint}</span><input class="field" id="answer"${inputMode} aria-label="Answer"><button class="go" data-action="submit">Answer</button></div>`;
}

/**
 * @param {any} concept
 * @param {any} question
 * @param {any} flow
 */
export function questionView(concept, question, flow) {
  const kind = flow.flowKind === "check" ? "Concept check" : "Wrap-up";
  const from = `${kind} · ${concept?.title || "Review"}`;
  return `<div class="prompt"><p class="from">${from}</p><p class="qhead">${escape(question.stem)}</p></div>${answerForm(concept, question, flow)}`;
}

/** @param {any} lesson */
export function summaryView(lesson) {
  const count = lesson.concepts.length;
  const hero = `<div class="lessonhero"><p class="eyebrow">Complete</p><h1>Learned</h1><p>You completed every concept and its Wrap-up question.</p></div>`;
  const summary = `<div class="summary"><div class="line"><span>Concepts learned</span><b>${count} of ${count}</b></div></div>`;
  return hero + summary;
}

/**
 * The replaceable region of the learning shell.
 * @param {any} lesson
 * @param {any} flow
 * @param {any} concept
 * @param {any} item
 */
export function regionView(lesson, flow, concept, item) {
  if (flow.screen === "summary") return summaryView(lesson);
  if (flow.screen === "card" || flow.screen === "corrective") return cardView(concept, item, flow);
  if (flow.feedback) return feedbackView(flow.feedback);
  return questionView(concept, item, flow);
}

/**
 * The clamped correcting Card shown under the action row after a wrong or unknown answer.
 * @param {any} lesson
 * @param {any} flow
 */
export function afterFooterView(lesson, flow) {
  if (flow.screen !== "question" || !flow.feedback?.cardId) return "";
  const card = findCard(lesson, flow.feedback.cardId);
  return card ? clampedCardView(card) : "";
}

/**
 * The mobile action row under the region.
 * @param {any} flow
 */
export function footerView(flow) {
  const back = backButton("back", "Back");
  if (flow.screen === "summary") return `<div class="actions">${actionButton("Back to shelf", "shelf")}</div>`;
  if (flow.screen === "card") return `<div class="actions">${back}${actionButton("Continue", "continue")}</div>`;
  if (flow.screen === "corrective") return `<div class="actions">${back}${actionButton("Return to questions", "return")}</div>`;
  if (flow.feedback) {
    const retry = !flow.feedback.correct && !flow.feedback.idk && flow.flowKind === "check" && flow.queue.length > 1;
    const label = retry ? "Try another from this concept" : "Continue";
    return `<div class="actions">${back}${actionButton(label, "advance")}</div>`;
  }
  return `<div class="actions">${back}<button class="idk" data-action="idk">I don't know</button></div>`;
}

/**
 * @param {any} concept
 * @param {any} progress
 */
function conceptFill(concept, progress) {
  const lastCard = concept.cards.at(-1);
  if (progress.learnedConcepts.has(concept.id) || progress.cardsSeen.has(lastCard.id)) return 100;
  if (progress.cardsSeen.has(concept.cards[0].id)) return 40;
  return 0;
}

/** @param {any} flow */
function wrapUpFill(flow) {
  const total = flow.wrapTotal || 1;
  const answered = flow.wrapTotal - flow.queue.length + (flow.feedback?.correct ? 1 : 0);
  return Math.min(100, Math.round(100 * (answered / total)));
}

/**
 * Segmented Concept rail, with one extra segment during the Wrap-up.
 * @param {any} lesson
 * @param {any} flow
 * @param {any} progress
 */
export function railView(lesson, flow, progress) {
  const segments = lesson.concepts.map((concept) => `<i><b style="width:${conceptFill(concept, progress)}%"></b></i>`);
  const wrapUp = flow?.flowKind === "wrap_up" ? `<i aria-label="Wrap-up progress"><b style="width:${wrapUpFill(flow)}%"></b></i>` : "";
  return `<div class="rail" aria-label="Concept progress">${segments.join("")}${wrapUp}</div>`;
}
