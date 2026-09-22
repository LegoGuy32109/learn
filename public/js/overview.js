// @ts-check
// Lesson overview surface: title, assumed knowledge, Concept count, progress and the Start or Resume
// action. When the server has a newer revision than the one the learner has progress on, the overview
// says so and offers two actions: continue this revision, or discard progress and start the new one.
// Discarding always asks for confirmation first.
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
  const outdated = nav.entry?.outdated === true;
  const intro = `<div><p class="eyebrow">Lesson</p><h1>${lesson.title}</h1><p>${lesson.assumedKnowledge}</p></div>`;
  const marks = `<span class="state">${stateName(progress)}</span>${outdated ? '<span class="status outdated">Outdated</span>' : ""}`;
  const facts = `<div class="facts"><strong>${lesson.concepts.length} concepts</strong><br>${marks}</div>`;
  const notice = nav.notice ? `<p class="notice" role="alert">${nav.notice}</p>` : "";
  const drillLabel = session.savedDrillCheckpoint ? "Resume every question" : "Every question";
  const drillNote = `<p class="drillnote">Already read the cards? Skip straight to every question, including the ones the Wrap-up holds back. Drill does not earn Learned.</p>`;
  const actions = outdated
    ? revisionChoice(nav, label, drillLabel)
    : `${drillNote}<div class="actions">${actionButton(label, "start")}${actionButton(drillLabel, "drill", true)}</div>`;
  root.innerHTML = `<section class="page overview">${backButton("shelf", "Back to shelf")}${intro}${facts}${notice}${actions}</section>`;
  bind(root, (action) => handle(action, session, nav), () => {});
}

/**
 * The two actions for an outdated revision, or the confirmation step once Discard was chosen.
 * Drill stays available on the old revision; it never touches progress.
 * @param {any} nav
 * @param {string} continueLabel
 * @param {string} drillLabel
 */
function revisionChoice(nav, continueLabel, drillLabel) {
  if (nav.confirmingDiscard) {
    const warning = '<div class="notice" id="discard-confirm"><strong>Discard your progress on this revision?</strong> Seen and Learned here are left behind, and the new revision starts from Not started. This cannot be undone.</div>';
    const actions = `<div class="actions stack">${actionButton("Discard and start the new revision", "confirm-discard")}${actionButton("Keep my progress", "keep", true)}</div>`;
    return `${warning}${actions}`;
  }
  const note = '<div class="notice" id="outdated-notice"><strong>A newer revision of this lesson exists.</strong> Your progress belongs to this revision and does not carry over. Continue here, or discard it and start the new revision.</div>';
  const actions = `<div class="actions stack">${actionButton(`${continueLabel} this revision`, "start")}${actionButton(drillLabel, "drill", true)}${actionButton("Discard progress and start the new revision", "discard", true)}</div>`;
  return `${note}${actions}`;
}

/**
 * @param {string} action
 * @param {import("../../src/client/learning/session.js").Session} session
 * @param {any} nav
 */
function handle(action, session, nav) {
  if (action === "shelf") {
    session.flow = null;
    nav.confirmingDiscard = false;
    return nav.show("shelf", "/");
  }
  if (action === "start") return startLearning(session, nav);
  if (action === "drill") return startDrilling(session, nav);
  if (action === "discard") {
    nav.confirmingDiscard = true;
    return nav.refresh();
  }
  if (action === "keep") {
    nav.confirmingDiscard = false;
    return nav.refresh();
  }
  if (action === "confirm-discard") return nav.discardAndStart();
}
