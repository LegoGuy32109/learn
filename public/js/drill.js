// @ts-check
// Drill surface: every Question in every Pool, reserved ones included, in one seeded random order.
// Answers are evidence in the drill stream only. Nothing here records a learning event or touches
// the learning checkpoint, so Seen, Learned and the resume position are exactly as they were.
import {
  activeConcept,
  current,
  enterCorrective,
  leaveCorrective,
  submitAnswer,
} from "../../src/client/learning/flow.js";
import {
  advanceDrill,
  startDrill,
} from "../../src/client/learning/drill-flow.js";
import {
  DRILL_ANSWERED,
  reduceDrill,
} from "../../src/shared/learning/drill.js";
import {
  afterFooterView,
  drillRailView,
  drillSummaryView,
  footerView,
  regionView,
} from "../../src/client/learning/views.js";
import { backButton, bind, CLOSE, icon } from "../../src/client/ui/controls.js";

/** @typedef {import("../../src/client/learning/session.js").Session} Session */

/** A fresh seed and run ID for a new drill run. */
function newRun() {
  return {
    seed: Math.floor(Math.random() * 2 ** 31),
    runId: crypto.randomUUID(),
  };
}

let inFlight = false;

/**
 * One action at a time: a second tap that lands before the re-render replaces the DOM is dropped,
 * and so is a click on a button rendered from a drill flow that has since moved.
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
 * Enter the drill from the overview, resuming an open run when one exists.
 * @param {Session} session
 * @param {any} nav
 */
export async function startDrilling(session, nav) {
  session.surface = "drill";
  if (!session.drillFlow) {
    session.drillFlow = session.savedDrillCheckpoint ||
      startDrill(session.lesson, newRun());
  }
  await session.saveDrillCheckpoint();
  await nav.show("drill", nav.drillPath);
}

/**
 * @param {HTMLElement} root
 * @param {Session} session
 * @param {any} nav
 */
export function renderDrill(root, session, nav) {
  const lesson = session.lesson;
  const flow = session.drillFlow;
  const outcomes = reduceDrill(lesson, session.drillEvents, flow.runId);
  const close =
    `<button class="close" data-action="overview" aria-label="Close drill">${
      icon(CLOSE)
    }</button>`;
  const header = `<header class="shellhead">${
    backButton("back", "Back")
  }<h1>${lesson.title}</h1>${close}</header>`;
  const body = flow.screen === "summary"
    ? drillSummaryView(outcomes)
    : regionView(
      lesson,
      flow,
      activeConcept(lesson, flow),
      current(lesson, flow),
    );
  const region = `<main class="region">${body}</main>`;
  const footer = `<footer class="footer">${footerView(flow)}</footer>`;
  const corrects = afterFooterView(lesson, flow);
  root.innerHTML = `<section class="shell drill">${header}${
    drillRailView(lesson, outcomes)
  }${region}${footer}${corrects}</section>`;
  const live = () => session.drillFlow === flow;
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
 * @param {any} nav
 */
async function handle(action, session, nav) {
  if (action === "overview") return leave(session, nav);
  if (action === "back") {
    if (session.drillFlow.screen === "corrective") {
      return commit(session, nav, leaveCorrective(session.drillFlow));
    }
    return leave(session, nav);
  }
  if (action === "submit") {
    const field =
      /** @type {HTMLInputElement} */ (document.querySelector("#answer"));
    return submit(session, nav, field.value, false);
  }
  if (action === "idk") return submit(session, nav, null, true);
  if (action === "advance") {
    return commit(session, nav, advanceDrill(session.drillFlow));
  }
  if (action === "corrective") {
    return commit(
      session,
      nav,
      enterCorrective(session.lesson, session.drillFlow),
    );
  }
  if (action === "return") {
    return commit(session, nav, leaveCorrective(session.drillFlow));
  }
}

/**
 * Leave the drill for the overview. A finished run is closed; an unfinished run stays resumable.
 * The drill's history entry becomes the overview's, so browser Back does not reopen the drill.
 * @param {Session} session
 * @param {any} nav
 */
async function leave(session, nav) {
  if (session.drillFlow?.screen === "summary") await session.endDrill();
  session.drillFlow = null;
  return nav.show("overview", nav.lessonPath, { replace: true });
}

/**
 * Replace the drill flow, checkpoint it in the drill stream, and re-render.
 * @param {Session} session
 * @param {any} nav
 * @param {any} flow
 */
async function commit(session, nav, flow) {
  session.drillFlow = flow;
  await session.saveDrillCheckpoint();
  await nav.refresh();
}

/**
 * Evaluate an answer with the learning flow's rules, record it as drill evidence, and show feedback.
 * @param {Session} session
 * @param {any} nav
 * @param {unknown} answer
 * @param {boolean} idk
 */
async function submit(session, nav, answer, idk) {
  const result = submitAnswer(session.lesson, session.drillFlow, answer, idk);
  await session.recordDrillEvent(DRILL_ANSWERED, {
    runId: session.drillFlow.runId,
    conceptId: result.question.conceptId,
    poolId: result.question.poolId,
    questionId: result.question.id,
    answer,
    idk,
    correct: result.correct,
  });
  await commit(session, nav, result.flow);
}
