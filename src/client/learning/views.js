// @ts-check
// Renders the Card, Question, feedback, corrective and summary views of the learning shell.
import { shuffled } from "../../shared/learning/shuffle.js";
import { actionButton, backButton } from "../ui/controls.js";

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
  return `${notice}<div class="cardbody"><p class="eyebrow">${position}</p><h2>${card.heading}</h2><p>${card.body}</p></div>`;
}

/** @param {any} feedback */
export function feedbackView(feedback) {
  const className = feedback.correct ? "feedback good" : "feedback";
  const verdict = feedback.correct ? "Correct" : "Not quite";
  const corrective = feedback.correct ? "" : '<button class="source" data-action="corrective">Review the correcting card</button>';
  return `<div class="${className}"><p class="verdict">${verdict}</p><p>${feedback.text}</p></div>${corrective}`;
}

/**
 * @param {any} question
 * @param {any} flow
 */
function answerForm(question, flow) {
  if (question.type === "mcq") {
    const options = shuffled(question.options, flow.seed);
    const buttons = options.map((option) => `<button class="opt" data-answer="${option.id}">${option.text}</button>`);
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
  return `<div class="prompt"><p class="from">${from}</p><p class="qhead">${question.stem}</p></div>${answerForm(question, flow)}`;
}

/** @param {any} lesson */
export function summaryView(lesson) {
  const count = lesson.concepts.length;
  const hero = `<div class="lessonhero"><p class="eyebrow">Complete</p><h1>Learned</h1><p>You completed all three concepts and their Wrap-up questions.</p></div>`;
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
 * The mobile action row under the region.
 * @param {any} flow
 */
export function footerView(flow) {
  const back = backButton("back", "Back");
  if (flow.screen === "summary") return `<div class="actions">${actionButton("Back to shelf", "shelf")}</div>`;
  if (flow.screen === "card") return `<div class="actions">${back}${actionButton("Continue", "continue")}</div>`;
  if (flow.screen === "corrective") return `<div class="actions">${back}${actionButton("Return to questions", "return")}</div>`;
  if (flow.feedback) {
    const label = flow.feedback.correct || flow.feedback.idk ? "Continue" : "Try another from this concept";
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
