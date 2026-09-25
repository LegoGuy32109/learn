// @ts-check
// Learning shell surface: compact header, Concept rail, one replaceable region and the action row.
// Every action goes through the flow controller, records evidence, then checkpoints and re-renders.
import {
  activeConcept,
  advance,
  continueFromCard,
  current,
  enterCorrective,
  initialFlow,
  leaveCorrective,
  leavesShellOnBack,
  stepBack,
  submitAnswer,
} from "../../src/client/learning/flow.js";
import {
  afterFooterView,
  footerView,
  railView,
  regionView,
} from "../../src/client/learning/views.js";
import { backButton, bind, CLOSE, icon } from "../../src/client/ui/controls.js";
import { openFlow } from "../../src/client/learning/session.js";

/** @typedef {import("../../src/client/learning/session.js").Session} Session */
/** @typedef {import("./app.js").Nav} Nav */
/** @typedef {import("../../src/client/learning/flow.js").Flow} Flow */
/** @typedef {import("../../src/shared/learning/progress.js").Progress} Progress */

/** A fresh seed and attempt ID for a new Check or Wrap-up attempt. */
function newAttempt() {
  return {
    seed: Math.floor(Math.random() * 2 ** 31),
    attemptId: crypto.randomUUID(),
  };
}

let inFlight = false;

/**
 * One action at a time. Every handler awaits IndexedDB writes before the re-render replaces the
 * DOM, so a phone double tap lands a second click on the old button; the second click is dropped.
 * The flow the DOM was rendered from is checked too, so a click on a detached button does nothing.
 * @param {() => Promise<unknown>} work
 */
async function once(work) {
  if (inFlight) return;
  inFlight = true;
  try {
    await work();
  } finally {
    inFlight = false;
  }
}

/**
 * Enter the learning shell from the overview, resuming the saved checkpoint when one exists.
 * The overview's history entry becomes the learning shell's: browser Back leaves for the shelf.
 * @param {Session} session
 * @param {Nav} nav
 */
export async function startLearning(session, nav) {
  session.surface = "learn";
  if (!session.hasEvent("lesson_started")) {
    await session.recordEvent("lesson_started");
  }
  if (!session.flow) session.flow = session.savedCheckpoint || initialFlow();
  await session.saveCheckpoint();
  await nav.show("learn", nav.lessonPath, { replace: true });
}

/**
 * @param {HTMLElement} root
 * @param {Session} session
 * @param {Progress} progress
 * @param {Nav} nav
 */
export function renderLearning(root, session, progress, nav) {
  const lesson = session.lesson;
  const flow = openFlow(session);
  const item = current(lesson, flow);
  const concept = activeConcept(lesson, flow);
  const close =
    `<button class="close" data-action="shelf" aria-label="Close lesson">${
      icon(CLOSE)
    }</button>`;
  const header = `<header class="shellhead">${
    backButton("back", "Back")
  }<h1>${lesson.title}</h1>${close}</header>`;
  const region = `<main class="region">${
    regionView(lesson, flow, concept, item)
  }</main>`;
  const footer = `<footer class="footer">${footerView(flow)}</footer>`;
  const corrects = afterFooterView(lesson, flow);
  root.innerHTML = `<section class="shell">${header}${
    railView(lesson, flow, progress)
  }${region}${footer}${corrects}</section>`;
  const live = () => session.flow === flow;
  bind(
    root,
    (action) => once(async () => live() && await handle(action, session, nav)),
    (answer) =>
      once(async () => live() && await submit(session, nav, answer, false)),
  );
}

/**
 * @param {string} action
 * @param {Session} session
 * @param {Nav} nav
 */
function handle(action, session, nav) {
  if (action === "shelf") {
    session.flow = null;
    return nav.show("shelf", "/");
  }
  if (action === "continue") return continueCard(session, nav);
  if (action === "submit") {
    const field =
      /** @type {HTMLInputElement} */ (document.querySelector("#answer"));
    return submit(session, nav, field.value, false);
  }
  if (action === "idk") return submit(session, nav, null, true);
  if (action === "advance") {
    return commit(
      session,
      nav,
      advance(session.lesson, openFlow(session), newAttempt()),
    );
  }
  if (action === "corrective") {
    return commit(
      session,
      nav,
      enterCorrective(session.lesson, openFlow(session)),
    );
  }
  if (action === "return") {
    return commit(session, nav, leaveCorrective(openFlow(session)));
  }
  if (action === "back") return goBack(session, nav);
}

/**
 * Replace the flow, checkpoint it, and re-render.
 * @param {Session} session
 * @param {Nav} nav
 * @param {Flow} flow
 */
async function commit(session, nav, flow) {
  session.flow = flow;
  await session.saveCheckpoint();
  await nav.refresh();
}

/**
 * Continue marks the Card Seen once and advances.
 * @param {Session} session
 * @param {Nav} nav
 */
async function continueCard(session, nav) {
  const lesson = session.lesson;
  const flow = openFlow(session);
  const concept = lesson.concepts[flow.conceptIndex];
  const card = concept.cards[flow.cardIndex];
  const seen = session.hasEvent(
    "card_seen",
    (event) => event.cardId === card.id,
  );
  if (!seen) {
    await session.recordEvent("card_seen", {
      cardId: card.id,
      conceptId: concept.id,
    });
  }
  await commit(session, nav, continueFromCard(lesson, flow, newAttempt()));
}

/**
 * Evaluate an answer, persist the evidence, and show feedback.
 * @param {Session} session
 * @param {Nav} nav
 * @param {unknown} answer
 * @param {boolean} idk
 */
async function submit(session, nav, answer, idk) {
  const flow = openFlow(session);
  const result = submitAnswer(session.lesson, flow, answer, idk);
  await session.recordEvent("question_answered", {
    flowKind: flow.flowKind,
    conceptId: result.question.conceptId,
    poolId: result.question.poolId,
    questionId: result.question.id,
    attemptId: flow.attemptId,
    answer,
    correct: result.correct,
  });
  await commit(session, nav, result.flow);
}

/**
 * Back inspects without reversing progress or replacing the canonical checkpoint: the flow moves
 * in memory only, and a reload comes back at the checkpoint. At the first Card and on the Learned
 * summary it returns to the overview, on the same history entry so a reload shows the overview.
 * @param {Session} session
 * @param {Nav} nav
 */
async function goBack(session, nav) {
  const flow = openFlow(session);
  if (leavesShellOnBack(flow)) {
    session.flow = null;
    return nav.show("overview", nav.lessonPath, { replace: true });
  }
  session.flow = stepBack(session.lesson, flow);
  await nav.refresh();
}
