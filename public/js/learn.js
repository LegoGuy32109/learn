// @ts-check
// Learning shell surface: compact header, Concept rail, one replaceable region and the action row.
// Every action goes through the flow controller, records evidence, then checkpoints and re-renders.
import {
  activeConcept,
  advance,
  atFirstCard,
  continueFromCard,
  current,
  enterCorrective,
  initialFlow,
  leaveCorrective,
  stepBack,
  submitAnswer,
} from "../../src/client/learning/flow.js";
import { afterFooterView, footerView, railView, regionView } from "../../src/client/learning/views.js";
import { CLOSE, backButton, bind, icon } from "../../src/client/ui/controls.js";

/** @typedef {import("../../src/client/learning/session.js").Session} Session */

/** A fresh seed and attempt ID for a new Check or Wrap-up attempt. */
function newAttempt() {
  return { seed: Math.floor(Math.random() * 2 ** 31), attemptId: crypto.randomUUID() };
}

/**
 * Enter the learning shell from the overview, resuming the saved checkpoint when one exists.
 * @param {Session} session
 * @param {any} nav
 */
export async function startLearning(session, nav) {
  session.surface = "learn";
  if (!session.hasEvent("lesson_started")) await session.recordEvent("lesson_started");
  if (!session.flow) session.flow = session.savedCheckpoint || initialFlow();
  await session.saveCheckpoint();
  await nav.show("learn", nav.lessonPath);
}

/**
 * @param {HTMLElement} root
 * @param {Session} session
 * @param {any} progress
 * @param {any} nav
 */
export function renderLearning(root, session, progress, nav) {
  const lesson = session.lesson;
  const flow = session.flow;
  const item = current(lesson, flow);
  const concept = activeConcept(lesson, flow);
  const close = `<button class="close" data-action="shelf" aria-label="Close lesson">${icon(CLOSE)}</button>`;
  const header = `<header class="shellhead">${backButton("back", "Back")}<h1>${lesson.title}</h1>${close}</header>`;
  const region = `<main class="region">${regionView(lesson, flow, concept, item)}</main>`;
  const footer = `<footer class="footer">${footerView(flow)}</footer>`;
  const corrects = afterFooterView(lesson, flow);
  root.innerHTML = `<section class="shell">${header}${railView(lesson, flow, progress)}${region}${footer}${corrects}</section>`;
  bind(root, (action) => handle(action, session, nav), (answer) => submit(session, nav, answer, false));
}

/**
 * @param {string} action
 * @param {Session} session
 * @param {any} nav
 */
async function handle(action, session, nav) {
  if (action === "shelf") {
    session.flow = null;
    return nav.show("shelf", "/");
  }
  if (action === "continue") return continueCard(session, nav);
  if (action === "submit") {
    const field = /** @type {HTMLInputElement} */ (document.querySelector("#answer"));
    return submit(session, nav, field.value, false);
  }
  if (action === "idk") return submit(session, nav, null, true);
  if (action === "advance") return commit(session, nav, advance(session.lesson, session.flow, newAttempt()));
  if (action === "corrective") return commit(session, nav, enterCorrective(session.lesson, session.flow));
  if (action === "return") return commit(session, nav, leaveCorrective(session.flow));
  if (action === "back") return goBack(session, nav);
}

/**
 * Replace the flow, checkpoint it, and re-render.
 * @param {Session} session
 * @param {any} nav
 * @param {any} flow
 */
async function commit(session, nav, flow) {
  session.flow = flow;
  await session.saveCheckpoint();
  await nav.refresh();
}

/**
 * Continue marks the Card Seen once and advances.
 * @param {Session} session
 * @param {any} nav
 */
async function continueCard(session, nav) {
  const lesson = session.lesson;
  const flow = session.flow;
  const concept = lesson.concepts[flow.conceptIndex];
  const card = concept.cards[flow.cardIndex];
  const seen = session.hasEvent("card_seen", (event) => event.cardId === card.id);
  if (!seen) await session.recordEvent("card_seen", { cardId: card.id, conceptId: concept.id });
  await commit(session, nav, continueFromCard(lesson, flow, newAttempt()));
}

/**
 * Evaluate an answer, persist the evidence, and show feedback.
 * @param {Session} session
 * @param {any} nav
 * @param {unknown} answer
 * @param {boolean} idk
 */
async function submit(session, nav, answer, idk) {
  const result = submitAnswer(session.lesson, session.flow, answer, idk);
  await session.recordEvent("question_answered", {
    flowKind: session.flow.flowKind,
    conceptId: result.question.conceptId,
    poolId: result.question.poolId,
    questionId: result.question.id,
    attemptId: session.flow.attemptId,
    answer,
    correct: result.correct,
  });
  await commit(session, nav, result.flow);
}

/**
 * Back inspects without reversing progress or replacing the canonical checkpoint.
 * At the first Card it returns to the overview.
 * @param {Session} session
 * @param {any} nav
 */
async function goBack(session, nav) {
  if (atFirstCard(session.flow)) {
    session.flow = null;
    return nav.show("overview");
  }
  session.flow = stepBack(session.flow);
  await nav.refresh();
}
