// @ts-check
/** @typedef {import("./app.js").Nav} Nav */
// Mine shelf surface: the account's lessons merged with what this device has cached, each with its
// progress state and an Outdated mark when a newer revision exists; plus who is signed in.
import {
  bind,
  CHEVRON,
  icon,
  stateName,
} from "../../src/client/ui/controls.js";
import {
  signInWithPasskey,
  signOut,
} from "../../src/client/identity/passkey.js";

/** @typedef {import("../../src/client/library/shelf-model.js").ShelfEntry} ShelfEntry */

const REFRESH =
  "M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4 M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4";
const BOOK =
  "M19 4v16h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12z M19 16h-12a2 2 0 0 0 -2 2 M9 8h6";

/**
 * @param {HTMLElement} root
 * @param {Nav} nav
 */
export function renderShelf(root, nav) {
  /** @type {ShelfEntry[]} */
  const entries = nav.shelf;
  const refresh = nav.account.signedIn
    ? `<button class="iconbtn" data-action="refresh" aria-label="Refresh shelf">${
      icon(REFRESH)
    }</button>`
    : "";
  const head =
    `<div class="libhead"><div><p class="eyebrow">Your learning</p><h1 class="libtitle">Mine</h1></div>${refresh}</div>`;
  const status = statusLine(nav);
  const notice = nav.notice
    ? `<p class="notice" role="alert">${escape(nav.notice)}</p>`
    : "";
  const lessons = entries.length ? entries.map(card).join("") : emptyShelf(nav);
  root.innerHTML =
    `<section class="page shelf">${head}${status}${notice}${lessons}${
      accountPanel(nav.account)
    }</section>`;
  bind(root, (action) => handle(action, nav), () => {});
}

/**
 * A learning URL that cannot open: the lesson is not on this device and the viewer cannot load it.
 * A guest is asked to sign in; an owner is told why.
 * @param {HTMLElement} root
 * @param {Nav} nav
 */
export function renderLessonPrompt(root, nav) {
  const guest = !nav.account.signedIn;
  const title = guest
    ? "Sign in to open this lesson"
    : "This lesson could not be opened";
  const reason = `${escape(nav.promptReason ?? "")} ${
    guest
      ? "Sign in with your passkey while connected and it will load onto this device."
      : ""
  }`.trim();
  const intro =
    `<div><p class="eyebrow">Lesson</p><h1>${title}</h1><p>${reason}</p></div>`;
  const message = nav.account.message
    ? `<p class="state" id="account-message" aria-live="polite">${
      escape(nav.account.message)
    }</p>`
    : "";
  const signIn = guest
    ? '<button class="go" data-action="sign-in">Sign in with a passkey</button>'
    : "";
  const actions =
    `<div class="actions stack">${signIn}<button class="go quiet" data-action="shelf">Back to shelf</button></div>`;
  root.innerHTML =
    `<section class="page overview prompt">${intro}${message}${actions}</section>`;
  bind(root, (action) => handle(action, nav), () => {});
}

/**
 * One lesson card. The pinned revision's state, and Outdated when the server has a newer revision
 * than the one the learner has progress on.
 * @param {ShelfEntry} entry
 */
function card(entry) {
  const meta =
    `${entry.conceptCount} concepts · ${entry.questionCount} questions`;
  const status = `<span class="status ${entry.progress.state}">${
    stateName(entry.progress)
  }</span>`;
  const outdated = entry.outdated
    ? '<span class="status outdated">Outdated</span>'
    : "";
  const main = `<span class="lmain"><span class="lname">${
    escape(entry.title)
  }</span><span class="lmeta">${meta}</span><span class="lstatus">${status}${outdated}</span></span>`;
  return `<button class="lesson" data-action="open:${entry.lessonId}" data-lesson="${entry.lessonId}">${main}<span class="chev">${
    icon(CHEVRON)
  }</span></button>`;
}

/**
 * Where the list came from. A guest sees only this device; a signed-in learner hears when the
 * server could not be reached.
 * @param {Nav} nav
 */
function statusLine(nav) {
  if (!nav.account.signedIn) return "";
  const text = {
    ok: "",
    guest: "",
    offline: "Offline. Showing the lessons on this device.",
    failed:
      "The server could not be reached. Showing the lessons on this device.",
  }[/** @type {"ok"|"guest"|"offline"|"failed"} */ (nav.remoteStatus)];
  return text ? `<p class="state" id="shelf-status">${text}</p>` : "";
}

/**
 * No lessons at all. A short explanation, never an error.
 * @param {Nav} nav
 */
function emptyShelf(nav) {
  let text =
    "Lessons you open while signed in stay on this device. Sign in with your passkey while connected to load your shelf.";
  if (nav.account.signedIn && nav.remoteStatus === "ok") {
    text = "Create a lesson with the agent plugin, then refresh this shelf.";
  } else if (nav.account.signedIn) {
    text =
      "You are offline and no lesson is on this device yet. Reconnect and refresh.";
  }
  return `<div class="empty" id="shelf-empty"><span class="mark">${
    icon(BOOK)
  }</span><h3>Nothing on this shelf yet</h3><p>${text}</p></div>`;
}

/**
 * Who is signed in, with the one action that changes it.
 * @param {{ signedIn: boolean, displayName: string | null, message?: string }} account
 */
function accountPanel(account) {
  const who = account.signedIn
    ? `Signed in as ${escape(account.displayName ?? "")}`
    : "Guest";
  const action = account.signedIn
    ? '<button class="go quiet" data-action="sign-out">Sign out</button>'
    : '<button class="go quiet" data-action="sign-in">Sign in with a passkey</button>';
  const message = account.message
    ? `<p class="state" id="account-message" aria-live="polite">${
      escape(account.message)
    }</p>`
    : "";
  return `<div class="account"><p class="state" id="account-status">${who}</p>${message}<div class="actions">${action}</div></div>`;
}

/** @param {string} text */
function escape(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(
    ">",
    "&gt;",
  ).replaceAll('"', "&quot;");
}

/**
 * @param {string} action
 * @param {Nav} nav
 */
async function handle(action, nav) {
  if (action.startsWith("open:")) return nav.open(action.slice("open:".length));
  if (action === "refresh") return nav.reloadShelf();
  if (action === "shelf") return nav.show("shelf", "/");
  if (action === "sign-in") {
    const outcome = await signInWithPasskey();
    if (outcome.ok) {
      nav.account = { signedIn: true, displayName: outcome.displayName };
    } else nav.account = { ...nav.account, message: outcome.message };
    if (!outcome.ok) return nav.refresh();
    await nav.reloadShelf();
    const wanted = location.pathname.match(/^\/learn\/([^/]+)/);
    if (wanted) await nav.open(decodeURIComponent(wanted[1]));
    return;
  }
  if (action === "sign-out") {
    // A fresh load after signing out, so a closed site shows its private page instead of the shelf.
    if (await signOut()) return location.replace("/");
    nav.account = { ...nav.account, message: "Could not sign out. Try again." };
    return nav.refresh();
  }
}
