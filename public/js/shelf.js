// @ts-check
// Mine shelf surface: the learner's lessons, their progress state, and who is signed in.
import { CHEVRON, bind, icon, stateName } from "../../src/client/ui/controls.js";
import { signInWithPasskey, signOut } from "../../src/client/identity/passkey.js";

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
  const lessons = `<button class="lesson" data-action="overview">${main}<span class="chev">${icon(CHEVRON)}</span></button>`;
  root.innerHTML = `<section class="page shelf">${head}${lessons}${accountPanel(nav.account)}</section>`;
  bind(root, (action) => handle(action, nav), () => {});
}

/**
 * Who is signed in, with the one action that changes it.
 * @param {{ signedIn: boolean, displayName: string | null, message?: string }} account
 */
function accountPanel(account) {
  const who = account.signedIn ? `Signed in as ${escape(account.displayName ?? "")}` : "Guest";
  const action = account.signedIn
    ? '<button class="go quiet" data-action="sign-out">Sign out</button>'
    : '<button class="go quiet" data-action="sign-in">Sign in with a passkey</button>';
  const message = account.message ? `<p class="state" id="account-message" aria-live="polite">${escape(account.message)}</p>` : "";
  return `<div class="account"><p class="state" id="account-status">${who}</p>${message}<div class="actions">${action}</div></div>`;
}

/** @param {string} text */
function escape(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * @param {string} action
 * @param {any} nav
 */
async function handle(action, nav) {
  if (action === "overview") return nav.show("overview", nav.lessonPath);
  if (action === "sign-in") {
    const outcome = await signInWithPasskey();
    if (outcome.ok) nav.account = { signedIn: true, displayName: outcome.displayName };
    else nav.account = { ...nav.account, message: outcome.message };
    return nav.refresh();
  }
  if (action === "sign-out") {
    const done = await signOut();
    nav.account = done ? { signedIn: false, displayName: null } : { ...nav.account, message: "Could not sign out. Try again." };
    return nav.refresh();
  }
}
