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
import { renderDrill } from "./drill.js";

/** @type {{ signedIn: boolean, displayName: string | null }} */
const account = (/** @type {any} */ (window)).__SESSION__ ?? { signedIn: false, displayName: null };
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
  const pwa = installPwa({ canInterrupt: () => canInterrupt(session.surface, session.surface === "drill" ? session.drillFlow : session.flow) });

  const nav = {
    lessonPath: `/learn/${lesson.lessonId}`,
    drillPath: `/learn/${lesson.lessonId}/drill`,
    /** The signed-in account as the server rendered it; sign-in and sign-out replace it. */
    account,
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
    if (session.surface === "shelf") renderShelf(root, session, progress, nav);
    else if (session.surface === "overview") renderOverview(root, session, progress, nav);
    else if (session.surface === "drill") renderDrill(root, session, nav);
    else renderLearning(root, session, progress, nav);
    pwa.notifyRender();
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

  return boot();
}

async function main() {
  const lesson = await loadLesson();
  if (lesson) return start(lesson);
  root.innerHTML = '<section class="page shelf"><h1>Nothing cached yet</h1><p class="state">Open learn once while connected to load your shelf.</p></section>';
  installPwa({ canInterrupt: () => true });
}

main();
