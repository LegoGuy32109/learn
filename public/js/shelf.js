// @ts-check
// Mine shelf surface: the learner's lessons and their progress state.
import { CHEVRON, bind, icon, stateName } from "../../src/client/ui/controls.js";

/**
 * @param {HTMLElement} root
 * @param {import("../../src/client/learning/session.js").Session} session
 * @param {any} progress
 * @param {any} nav
 */
export function renderShelf(root, session, progress, nav) {
  const lesson = session.lesson;
  const meta = `${lesson.concepts.length} concepts · ${lesson.questions.length} questions`;
  const status = `<span class="status ${progress.state}">${stateName(progress)}</span>`;
  const main = `<span class="lmain"><span class="lname">${lesson.title}</span><span class="lmeta">${meta}</span><span class="lstatus">${status}</span></span>`;
  const head = `<div class="libhead"><div><p class="eyebrow">Your learning</p><h1 class="libtitle">Mine</h1></div></div>`;
  root.innerHTML = `<section class="page shelf">${head}<button class="lesson" data-action="overview">${main}<span class="chev">${icon(CHEVRON)}</span></button></section>`;
  bind(root, (action) => handle(action, nav), () => {});
}

/**
 * @param {string} action
 * @param {any} nav
 */
function handle(action, nav) {
  if (action === "overview") return nav.show("overview", nav.lessonPath);
}
