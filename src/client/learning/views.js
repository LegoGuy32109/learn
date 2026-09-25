// @ts-check
/** @typedef {import("../../shared/lessons/types.d.ts").Card} Card */
/** @typedef {import("../../shared/lessons/types.d.ts").Concept} Concept */
/** @typedef {import("../../shared/lessons/types.d.ts").Lesson} Lesson */
/** @typedef {import("../../shared/lessons/types.d.ts").Question} Question */
// Renders the Card, Question, feedback, corrective and summary views of the learning shell.
import { shuffled } from "../../shared/learning/shuffle.js";
import { card as findCard } from "../../shared/lessons/lesson.js";
import { describeOutcome } from "../../shared/learning/drill.js";
import { actionButton, backButton } from "../ui/controls.js";

/** @param {string} value */
function escape(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(
    ">",
    "&gt;",
  ).replaceAll('"', "&quot;");
}

/**
 * Card paragraphs. Card bodies are authored as paragraph arrays with trusted inline HTML.
 * @param {string[]} body
 */
function paragraphs(body) {
  return body.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

/**
 * @param {Concept} concept
 * @param {Card} card
 * @param {any} flow
 */
export function cardView(concept, card, flow) {
  const notice = flow.screen === "corrective"
    ? '<div class="notice"><span><strong>Correcting card.</strong> Review this idea, then return to the question.</span></div>'
    : "";
  const position = `${concept.title} · Card ${
    flow.cardIndex + 1
  } of ${concept.cards.length}`;
  return `${notice}<div class="cardbody"><p class="eyebrow">${position}</p><h2>${card.heading}</h2>${
    paragraphs(card.body)
  }</div>`;
}

/**
 * The correcting Card clamped to its first paragraph. The rest folds behind a disclosure so the
 * action row above it stays reachable without scrolling.
 * @param {Card} card
 */
export function clampedCardView(card) {
  const [first, ...rest] = card.body;
  const more = rest.length
    ? `<details class="more"><summary>Read the rest of this card</summary>${
      paragraphs(rest)
    }</details>`
    : "";
  return `<aside class="corrects" aria-label="Correcting card"><p class="eyebrow">Corrected by</p><h3>${card.heading}</h3><p>${first}</p>${more}</aside>`;
}

/**
 * Verdict, option feedback and, for a chosen distractor, the belief behind it.
 * @param {import("./flow.js").Feedback} feedback
 */
export function feedbackView(feedback) {
  const className = feedback.correct ? "feedback good" : "feedback";
  const verdict = feedback.correct
    ? "Correct"
    : feedback.idk
    ? "Recorded"
    : "Not quite";
  const belief = feedback.belief
    ? `<div class="belief">The belief behind that option: <b>${
      escape(feedback.belief)
    }</b></div>`
    : "";
  const corrective = feedback.cardId
    ? '<button class="source" data-action="corrective">Review the correcting card</button>'
    : "";
  return `<div class="${className}"><p class="verdict">${verdict}</p><p>${feedback.text}</p></div>${belief}${corrective}`;
}

/**
 * Small deterministic string hash (FNV-1a, 32-bit) so an option order can depend on the Question.
 * @param {string} value
 */
function hashString(value) {
  let hash = 0x811C9DC5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * The option display order for one MCQ. It depends on the attempt seed and the Question ID, so it
 * survives a reload of the same attempt yet differs between the Questions of one Concept.
 * @param {Concept} concept
 * @param {Question} question
 * @param {any} flow
 */
export function optionOrder(concept, question, flow) {
  return shuffled(
    concept.options,
    (flow.seed + hashString(String(question.id))) >>> 0,
  );
}

/**
 * The MCQ options, or the typed-answer form. The typed form submits on Enter as well as on the
 * Answer button: `bind` in controls.js turns the form's submit event into the `submit` action.
 * @param {Concept} concept
 * @param {Question} question
 * @param {any} flow
 */
function answerForm(concept, question, flow) {
  if (question.type === "mcq") {
    const options = optionOrder(concept, question, flow);
    const buttons = options.map((/** @type {any} */ option) =>
      `<button class="opt" data-answer="${option.id}">${
        escape(option.text)
      }</button>`
    );
    return `<div class="opts">${buttons.join("")}</div>`;
  }
  const hint = question.type === "numeric" && question.unit
    ? `answer in ${question.unit}`
    : "one word or short phrase";
  const inputMode = question.type === "numeric" ? ' inputmode="decimal"' : "";
  return `<form class="fieldwrap" data-submit="submit"><span class="hintline">${hint}</span><input class="field" id="answer"${inputMode} aria-label="Answer" autocomplete="off"><button class="go" type="submit">Answer</button></form>`;
}

/**
 * @param {Concept} concept
 * @param {Question} question
 * @param {any} flow
 */
export function questionView(concept, question, flow) {
  const kind = flow.flowKind === "check"
    ? "Concept check"
    : flow.flowKind === "drill"
    ? drillKind(flow)
    : "Wrap-up";
  const from = `${kind} · ${concept?.title || "Review"}`;
  return `<div class="prompt"><p class="from">${from}</p><p class="qhead">${
    escape(question.stem)
  }</p></div>${answerForm(concept, question, flow)}`;
}

/**
 * "Every question · 4 of 12" while drilling.
 * @param {any} flow
 */
function drillKind(flow) {
  return `Every question · ${
    flow.total - flow.queue.length + 1
  } of ${flow.total}`;
}

/**
 * The drill summary: what happened to each Concept, and the reminder that drill never earns
 * Learned. No score and no percentage.
 * @param {ReturnType<typeof import("../../shared/learning/drill.js").reduceDrill>} outcomes
 */
export function drillSummaryView(outcomes) {
  const hero =
    `<div class="lessonhero"><p class="eyebrow">Every question</p><h1>Every question seen</h1><p>You went through every question in every pool, reserved ones included. Drill does not earn Learned. That comes from the Wrap-up in a normal run.</p></div>`;
  const lines = outcomes.map((outcome) =>
    `<div class="line"><span>${escape(outcome.title)}</span><b>${
      describeOutcome(outcome)
    }</b></div>`
  );
  return `${hero}<div class="summary drill">${lines.join("")}</div>`;
}

/** @param {Lesson} lesson */
export function summaryView(lesson) {
  const count = lesson.concepts.length;
  const hero =
    `<div class="lessonhero"><p class="eyebrow">Complete</p><h1>Learned</h1><p>You completed every concept and its Wrap-up question.</p></div>`;
  const summary =
    `<div class="summary"><div class="line"><span>Concepts learned</span><b>${count} of ${count}</b></div></div>`;
  return hero + summary;
}

/**
 * The replaceable region of the learning shell.
 * @param {Lesson} lesson
 * @param {any} flow
 * @param {Concept} concept
 * @param {any} item
 */
export function regionView(lesson, flow, concept, item) {
  if (flow.screen === "summary") return summaryView(lesson);
  if (flow.screen === "card" || flow.screen === "corrective") {
    return cardView(concept, item, flow);
  }
  if (flow.feedback) return feedbackView(flow.feedback);
  return questionView(concept, item, flow);
}

/**
 * The clamped correcting Card shown under the action row after a wrong or unknown answer.
 * @param {Lesson} lesson
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
  if (flow.screen === "summary" && flow.flowKind === "drill") {
    return `<div class="actions">${
      actionButton("Back to overview", "overview")
    }</div>`;
  }
  if (flow.screen === "summary") {
    return `<div class="actions">${
      actionButton("Back to shelf", "shelf")
    }</div>`;
  }
  if (flow.screen === "card") {
    return `<div class="actions">${back}${
      actionButton("Continue", "continue")
    }</div>`;
  }
  if (flow.screen === "corrective") {
    return `<div class="actions">${back}${
      actionButton("Return to questions", "return")
    }</div>`;
  }
  if (flow.feedback) {
    const retry = !flow.feedback.correct && !flow.feedback.idk &&
      flow.flowKind === "check" && flow.queue.length > 1;
    const label = retry ? "Try another from this concept" : "Continue";
    return `<div class="actions">${back}${
      actionButton(label, "advance")
    }</div>`;
  }
  return `<div class="actions">${back}<button class="idk" data-action="idk">I don't know</button></div>`;
}

/** Fill shown once a Concept is opened but not yet read through. Enough to read as started. */
const STARTED_FILL = 40;

/**
 * @param {Concept} concept
 * @param {any} progress
 */
function conceptFill(concept, progress) {
  // A Concept always has at least two Cards.
  const lastCard = concept.cards[concept.cards.length - 1];
  if (
    progress.learnedConcepts.has(concept.id) ||
    progress.cardsSeen.has(lastCard.id)
  ) return 100;
  if (progress.cardsSeen.has(concept.cards[0].id)) return STARTED_FILL;
  return 0;
}

/** @param {any} flow */
function wrapUpFill(flow) {
  const total = flow.wrapTotal || 1;
  const answered = flow.wrapTotal - flow.queue.length +
    (flow.feedback?.correct ? 1 : 0);
  return Math.min(100, Math.round(100 * (answered / total)));
}

/**
 * One rail segment. The segment, not the rail, carries the role: a bare `<i>` under an
 * `aria-label`led `<div>` announced nothing at all, and the Concept title the schema calls
 * "shown on the rail" was never exposed. The `<i>`/`<b>` tags stay so the stylesheet and the
 * audit selectors keep working; the progressbar role is what assistive tech reads.
 * @param {number} fill percentage, 0-100
 * @param {string} label what this segment measures
 */
function railSegment(fill, label) {
  return `<i role="progressbar" aria-label="${
    escape(label)
  }" aria-valuemin="0" aria-valuemax="100"` +
    ` aria-valuenow="${fill}" aria-valuetext="${fill}% complete"><b style="width:${fill}%"></b></i>`;
}

/**
 * Segmented rail for a drill run: one segment per Concept, filled by how many of its Questions
 * this run has answered. Learning progress is not shown, because drill does not change it.
 * @param {Lesson} lesson
 * @param {ReturnType<typeof import("../../shared/learning/drill.js").reduceDrill>} outcomes
 */
export function drillRailView(lesson, outcomes) {
  const segments = lesson.concepts.map((concept) => {
    const outcome = outcomes.find((candidate) => candidate.id === concept.id);
    const fill = outcome && outcome.questions
      ? Math.round(100 * (outcome.asked / outcome.questions))
      : 0;
    return railSegment(fill, concept.title);
  });
  return `<div class="rail" role="group" aria-label="Drill progress">${
    segments.join("")
  }</div>`;
}

/**
 * Segmented Concept rail, with one extra segment during the Wrap-up.
 * @param {Lesson} lesson
 * @param {any} flow
 * @param {any} progress
 */
export function railView(lesson, flow, progress) {
  const segments = lesson.concepts.map((concept) =>
    railSegment(conceptFill(concept, progress), concept.title)
  );
  const wrapUp = flow?.flowKind === "wrap_up"
    ? railSegment(wrapUpFill(flow), "Wrap-up")
    : "";
  return `<div class="rail" role="group" aria-label="Concept progress">${
    segments.join("")
  }${wrapUp}</div>`;
}
