// @ts-check
// Lesson overview surface: title, assumed knowledge, Concept count, progress and the Start or Resume action.
import { actionButton, backButton, bind, stateName } from "../../src/client/ui/controls.js";
import { startLearning } from "./learn.js";
import { startDrilling } from "./drill.js";

/**
 * @param {HTMLElement} root
 * @param {import("../../src/client/learning/session.js").Session} session
 * @param {any} progress
 * @param {any} nav
 */
export function renderOverview(root, session, progress, nav) {
  const lesson = session.lesson;
  const label = progress.state === "not_started" ? "Start lesson" : "Resume";
  const intro = `<div><p class="eyebrow">Lesson</p><h1>${lesson.title}</h1><p>${lesson.assumedKnowledge}</p></div>`;
  const facts = `<div class="facts"><strong>${lesson.concepts.length} concepts</strong><br><span class="state">${stateName(progress)}</span></div>`;
  const drillLabel = session.savedDrillCheckpoint ? "Resume every question" : "Every question";
  const note = `<p class="drillnote">Already read the cards? Skip straight to every question, including the ones the Wrap-up holds back. Drill does not earn Learned.</p>`;
  const actions = `<div class="actions">${actionButton(label, "start")}${actionButton(drillLabel, "drill", true)}</div>`;
  root.innerHTML = `<section class="page overview">${backButton("shelf", "Back to shelf")}${intro}${facts}${note}${actions}</section>`;
  bind(root, (action) => handle(action, session, nav), () => {});
}

/**
 * @param {string} action
 * @param {import("../../src/client/learning/session.js").Session} session
 * @param {any} nav
 */
function handle(action, session, nav) {
  if (action === "shelf") {
    session.flow = null;
    return nav.show("shelf", "/");
  }
  if (action === "start") return startLearning(session, nav);
  if (action === "drill") return startDrilling(session, nav);
}
