// @ts-check
// Boot module: loads the session, picks the surface from the URL and routes between surface entries.
import { createSession } from "../../src/client/learning/session.js";
import { atFirstCard } from "../../src/client/learning/flow.js";
import { renderShelf } from "./shelf.js";
import { renderOverview } from "./overview.js";
import { renderLearning } from "./learn.js";
import { renderDrill } from "./drill.js";

/** @type {any} */
const lesson = (/** @type {any} */ (window)).__LESSON__;
const root = /** @type {HTMLElement} */ (document.querySelector("#app"));
const session = createSession(lesson);

const nav = {
  lessonPath: `/learn/${lesson.lessonId}`,
  drillPath: `/learn/${lesson.lessonId}/drill`,
  /**
   * Switch surface. A path pushes a history entry; without one the URL stays as it is.
   * @param {"shelf"|"overview"|"learn"|"drill"} surface
   * @param {string} [path]
   */
  async show(surface, path) {
    session.surface = surface;
    if (path !== undefined) history.pushState({ surface }, "", path);
    await render();
  },
  async refresh() {
    await render();
  },
};

async function render() {
  const progress = await session.rebuildProgress();
  if (session.surface === "shelf") return renderShelf(root, session, progress, nav);
  if (session.surface === "overview") return renderOverview(root, session, progress, nav);
  if (session.surface === "drill") return renderDrill(root, session, nav);
  return renderLearning(root, session, progress, nav);
}

window.addEventListener("popstate", () => {
  if (session.surface === "learn" && session.flow && atFirstCard(session.flow)) {
    session.surface = "shelf";
    session.flow = null;
  }
  if (session.surface === "drill") {
    session.surface = "overview";
    session.drillFlow = null;
  }
  render();
});

async function boot() {
  await session.load();
  if (location.pathname === nav.drillPath && session.savedDrillCheckpoint) {
    session.drillFlow = session.savedDrillCheckpoint;
    session.surface = "drill";
  } else if (location.pathname.startsWith("/learn/")) {
    session.flow = session.savedCheckpoint || null;
    session.surface = session.savedCheckpoint ? "learn" : "overview";
  }
  await render();
}

boot();
