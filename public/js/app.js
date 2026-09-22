// @ts-check
// Boot module: seeds the inlined lesson, builds the shelf from the server and this device, picks the
// surface from the URL and routes between surface entries. One learner session exists at a time,
// for the Lesson Revision the opened Lesson is pinned to.
import { createSession } from "../../src/client/learning/session.js";
import { atFirstCard } from "../../src/client/learning/flow.js";
import { localRepository } from "../../src/client/storage/repository.js";
import { buildShelf, discardTo, pinOnOpen } from "../../src/client/library/shelf-model.js";
import { fetchRevision, fetchShelf } from "../../src/client/library/remote.js";
import { installPwa } from "../../src/client/pwa/register.js";
import { canInterrupt } from "../../src/client/pwa/update-policy.js";
import { renderLessonPrompt, renderShelf } from "./shelf.js";
import { renderOverview } from "./overview.js";
import { renderLearning } from "./learn.js";
import { renderDrill } from "./drill.js";

/** @typedef {import("../../src/client/library/shelf-model.js").ShelfEntry} ShelfEntry */
/** @typedef {import("../../src/client/library/shelf-model.js").RemoteLesson} RemoteLesson */

/** @type {{ signedIn: boolean, displayName: string | null, message?: string }} */
const account = (/** @type {any} */ (window)).__SESSION__ ?? { signedIn: false, displayName: null };
const root = /** @type {HTMLElement} */ (document.querySelector("#app"));

const state = {
  /** @type {"shelf"|"overview"|"learn"|"drill"|"prompt"} */
  surface: "shelf",
  /** @type {ShelfEntry[]} */
  shelf: [],
  /** The server's list from the last successful fetch, or null for a guest or an unreachable server. @type {RemoteLesson[]|null} */
  remote: null,
  /** How the last server fetch went, for the shelf's status line. @type {"guest"|"ok"|"offline"|"failed"} */
  remoteStatus: "guest",
  /** @type {string|null} */
  notice: null,
  /** @type {ShelfEntry|null} */
  entry: null,
  /** @type {import("../../src/client/learning/session.js").Session|null} */
  session: null,
  /** The overview is asking the learner to confirm a discard. */
  confirmingDiscard: false,
  /** Why a learning URL could not open: the lesson is not on this device and the viewer cannot fetch it. @type {string|null} */
  promptReason: null,
};

/** Read this device and rebuild the shelf entries around the last server answer. */
async function rebuildShelf() {
  const [cached, streams, learningEvents] = await Promise.all([
    localRepository.revisions(),
    localRepository.streams(),
    localRepository.events("learning_events"),
  ]);
  state.shelf = buildShelf({ cached, remote: state.remote, streams, learningEvents });
  if (state.entry) state.entry = state.shelf.find((entry) => entry.lessonId === state.entry?.lessonId) ?? state.entry;
}

/** Ask the server for the account's lessons, then rebuild. A guest or an unreachable server keeps this device's view. */
async function loadShelf() {
  if (!nav.account.signedIn) {
    state.remote = null;
    state.remoteStatus = "guest";
  } else {
    const fetched = await fetchShelf();
    if (fetched.ok) {
      state.remote = fetched.value.lessons;
      state.remoteStatus = "ok";
    } else if (fetched.status === 401) {
      nav.account = { signedIn: false, displayName: null };
      state.remote = null;
      state.remoteStatus = "guest";
    } else {
      state.remoteStatus = fetched.status === 0 ? "offline" : "failed";
    }
  }
  await rebuildShelf();
}

/**
 * Make sure the entry's pinned revision is on this device, fetching it from the server if it is not.
 * @param {ShelfEntry} entry
 * @returns {Promise<string|null>}  A message when the revision could not be loaded
 */
async function ensureCached(entry) {
  if (entry.lesson) return null;
  const known = await localRepository.lesson(entry.revisionId);
  if (known) {
    entry.lesson = known;
    return null;
  }
  const fetched = await fetchRevision(entry.lessonId, entry.revisionId);
  if (!fetched.ok) return fetched.status === 0 ? "This lesson is not on this device yet. Connect to load it." : `Could not load this lesson. ${fetched.message}`;
  await localRepository.seed(fetched.value);
  entry.lesson = fetched.value;
  return null;
}

/**
 * Open one Lesson: cache its pinned revision, pin the stream, and load its learner session.
 * @param {ShelfEntry} entry
 * @returns {Promise<string|null>}  A message when the Lesson could not be opened
 */
async function openEntry(entry) {
  const failure = await ensureCached(entry);
  if (failure) return failure;
  const streams = await localRepository.streams();
  const stream = pinOnOpen(streams.find((candidate) => candidate.id === entry.lessonId), entry);
  await localRepository.saveStream(stream);
  const session = createSession(entry.lesson, stream);
  await session.load();
  state.entry = entry;
  state.session = session;
  state.confirmingDiscard = false;
  return null;
}

const nav = {
  /** The signed-in account as the server rendered it; sign-in and sign-out replace it. */
  account,
  get lessonPath() {
    return `/learn/${state.entry?.lessonId ?? ""}`;
  },
  get drillPath() {
    return `${nav.lessonPath}/drill`;
  },
  get entry() {
    return state.entry;
  },
  get shelf() {
    return state.shelf;
  },
  get remoteStatus() {
    return state.remoteStatus;
  },
  get notice() {
    return state.notice;
  },
  get confirmingDiscard() {
    return state.confirmingDiscard;
  },
  set confirmingDiscard(value) {
    state.confirmingDiscard = value;
  },
  get promptReason() {
    return state.promptReason;
  },
  /**
   * Switch surface. A path pushes a history entry; without one the URL stays as it is.
   * @param {"shelf"|"overview"|"learn"|"drill"|"prompt"} surface
   * @param {string} [path]
   */
  async show(surface, path) {
    state.surface = surface;
    if (state.session) state.session.surface = surface === "prompt" ? "shelf" : surface;
    if (surface === "shelf") state.session = null;
    if (path !== undefined) history.pushState({ surface }, "", path);
    await render();
  },
  async refresh() {
    await render();
  },
  /** Re-read the server and this device, then show the shelf again. */
  async reloadShelf() {
    state.notice = null;
    await loadShelf();
    await render();
  },
  /**
   * Open a Lesson from the shelf or a prompt.
   * @param {string} lessonId
   */
  async open(lessonId) {
    const entry = state.shelf.find((candidate) => candidate.lessonId === lessonId);
    if (!entry) {
      if (state.surface !== "prompt") return;
      state.promptReason = nav.account.signedIn ? "This lesson is not on your shelf." : "This lesson is not on this device yet.";
      return render();
    }
    const failure = await openEntry(entry);
    if (failure) {
      state.notice = failure;
      return render();
    }
    await nav.show("overview", `/learn/${lessonId}`);
  },
  /**
   * The learner confirmed: leave the pinned revision's progress behind, advance the epoch and start
   * the server's newest revision from Not started.
   */
  async discardAndStart() {
    const entry = state.entry;
    if (!entry?.latestRevisionId || entry.latestRevisionId === entry.revisionId) return;
    /** @type {ShelfEntry} */
    const next = { ...entry, revisionId: entry.latestRevisionId, lesson: null };
    const failure = await ensureCached(next);
    if (failure) {
      state.notice = failure;
      return render();
    }
    const streams = await localRepository.streams();
    const current = streams.find((candidate) => candidate.id === entry.lessonId) ?? { id: entry.lessonId, revisionId: entry.revisionId, epoch: entry.epoch };
    await localRepository.saveStream(discardTo(current, next.revisionId));
    await rebuildShelf();
    const reopened = state.shelf.find((candidate) => candidate.lessonId === entry.lessonId);
    if (reopened) await openEntry(reopened);
    state.notice = null;
    await render();
  },
};

const pwa = installPwa({
  canInterrupt: () => {
    const surface = state.surface === "prompt" ? "shelf" : state.surface;
    const flow = state.surface === "drill" ? state.session?.drillFlow : state.session?.flow;
    return canInterrupt(surface, flow ?? null);
  },
});

async function render() {
  if (state.surface === "shelf") {
    await rebuildShelf();
    renderShelf(root, nav);
  } else if (state.surface === "prompt") {
    renderLessonPrompt(root, nav);
  } else if (state.session) {
    const progress = await state.session.rebuildProgress();
    if (state.surface === "overview") renderOverview(root, state.session, progress, nav);
    else if (state.surface === "drill") renderDrill(root, state.session, nav);
    else renderLearning(root, state.session, progress, nav);
  }
  pwa.notifyRender();
}

window.addEventListener("popstate", () => {
  const session = state.session;
  if (state.surface === "learn" && session?.flow && atFirstCard(session.flow)) {
    state.surface = "shelf";
    session.flow = null;
  } else if (state.surface === "drill" && session) {
    state.surface = "overview";
    session.drillFlow = null;
  } else if (!location.pathname.startsWith("/learn/")) {
    state.surface = "shelf";
  }
  render();
});

/**
 * A learning URL names a Lesson. Its owner lands on the overview, back in the lesson when a
 * checkpoint exists, or back in the drill at its drill URL. Anyone else who has not cached it is
 * asked to sign in.
 * @param {string} lessonId
 */
async function openFromUrl(lessonId) {
  const entry = state.shelf.find((candidate) => candidate.lessonId === lessonId);
  if (!entry) {
    state.promptReason = nav.account.signedIn ? "This lesson is not on your shelf." : "This lesson is not on this device yet.";
    state.surface = "prompt";
    return;
  }
  const failure = await openEntry(entry);
  if (failure) {
    state.promptReason = failure;
    state.surface = "prompt";
    return;
  }
  const session = /** @type {import("../../src/client/learning/session.js").Session} */ (state.session);
  if (location.pathname === nav.drillPath && session.savedDrillCheckpoint) {
    session.drillFlow = session.savedDrillCheckpoint;
    state.surface = "drill";
  } else {
    session.flow = session.savedCheckpoint || null;
    state.surface = session.savedCheckpoint ? "learn" : "overview";
  }
  session.surface = state.surface;
}

async function main() {
  const inlined = (/** @type {any} */ (window)).__LESSON__;
  if (inlined) await localRepository.seed(inlined);
  await loadShelf();
  const match = location.pathname.match(/^\/learn\/([^/]+)/);
  if (match) await openFromUrl(decodeURIComponent(match[1]));
  await render();
}

main();
