// @ts-check
// Boot module: loads the session, picks the surface from the URL and routes between surface entries.
import { createSession } from "../../src/client/learning/session.js";
import { atFirstCard } from "../../src/client/learning/flow.js";
import { renderShelf } from "./shelf.js";
import { renderOverview } from "./overview.js";
import { renderLearning } from "./learn.js";

/** @type {any} */
const lesson = (/** @type {any} */ (window)).__LESSON__;
/** @type {{ signedIn: boolean, displayName: string | null }} */
const account = (/** @type {any} */ (window)).__SESSION__ ?? { signedIn: false, displayName: null };
const root = /** @type {HTMLElement} */ (document.querySelector("#app"));
const session = createSession(lesson);

const nav = {
  lessonPath: `/learn/${lesson.lessonId}`,
  /** The signed-in account as the server rendered it; sign-in and sign-out replace it. */
  account,
  /**
   * Switch surface. A path pushes a history entry; without one the URL stays as it is.
   * @param {"shelf"|"overview"|"learn"} surface
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
  return renderLearning(root, session, progress, nav);
}

window.addEventListener("popstate", () => {
  if (session.surface === "learn" && session.flow && atFirstCard(session.flow)) {
    session.surface = "shelf";
    session.flow = null;
  }
  render();
});

async function boot() {
  await session.load();
  if (location.pathname.startsWith("/learn/")) {
    session.flow = session.savedCheckpoint || null;
    session.surface = session.savedCheckpoint ? "learn" : "overview";
  }
  await render();
}

boot();
