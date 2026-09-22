// @ts-check
// Boot module: loads the session, picks the surface from the URL and routes between surface entries.
import { createSession } from "../../src/client/learning/session.js";
import { atFirstCard } from "../../src/client/learning/flow.js";
import { localRepository } from "../../src/client/storage/repository.js";
import { installPwa } from "../../src/client/pwa/register.js";
import { canInterrupt } from "../../src/client/pwa/update-policy.js";
import { renderShelf } from "./shelf.js";
import { renderOverview } from "./overview.js";
import { renderLearning } from "./learn.js";

const root = /** @type {HTMLElement} */ (document.querySelector("#app"));

/**
 * The lesson to boot with. Online, the page shell inlines the featured lesson. Offline, the
 * service worker serves the lesson-free shell and the lesson comes from IndexedDB: the one the
 * URL names, or the only one cached.
 * @returns {Promise<any>}
 */
async function loadLesson() {
  const inlined = (/** @type {any} */ (window)).__LESSON__;
  if (inlined) return inlined;
  const cached = await localRepository.lessons();
  const match = location.pathname.match(/^\/learn\/([^/]+)/);
  const wanted = match ? cached.find((lesson) => lesson.lessonId === match[1]) : null;
  return wanted || cached[0] || null;
}

/** @param {any} lesson */
function start(lesson) {
  const session = createSession(lesson);
  const pwa = installPwa({ canInterrupt: () => canInterrupt(session.surface, session.flow) });

  const nav = {
    lessonPath: `/learn/${lesson.lessonId}`,
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
    if (session.surface === "shelf") renderShelf(root, session, progress, nav);
    else if (session.surface === "overview") renderOverview(root, session, progress, nav);
    else renderLearning(root, session, progress, nav);
    pwa.notifyRender();
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

  return boot();
}

async function main() {
  const lesson = await loadLesson();
  if (lesson) return start(lesson);
  root.innerHTML = '<section class="page shelf"><h1>Nothing cached yet</h1><p class="state">Open learn once while connected to load your shelf.</p></section>';
  installPwa({ canInterrupt: () => true });
}

main();
