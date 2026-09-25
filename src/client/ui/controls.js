// @ts-check
// Small HTML fragments shared by every browser surface.

/** @param {string} path */
export function icon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

export const CHEVRON = "M9 6l6 6l-6 6";
export const BACK = "M12 4l-6 6 6 6";
export const CLOSE = "M18 6l-12 12 M6 6l12 12";

/**
 * @param {string} label
 * @param {string} actionName
 * @param {boolean} [quiet]
 */
export function actionButton(label, actionName, quiet = false) {
  const className = quiet ? "go quiet" : "go";
  return `<button class="${className}" data-action="${actionName}">${label}</button>`;
}

/**
 * @param {string} actionName
 * @param {string} label
 */
export function backButton(actionName, label) {
  return `<button class="back" data-action="${actionName}" aria-label="${label}">${
    icon(BACK)
  }</button>`;
}

const STATE_NAMES = {
  not_started: "Not started",
  in_progress: "In progress",
  seen: "Seen",
  learned: "Learned",
};

/** @param {any} progress */
export function stateName(progress) {
  return /** @type {Record<string, string>} */ (STATE_NAMES)[progress.state];
}

/**
 * Wire every `data-action`, `data-submit` and `data-answer` element inside `root`. A form with
 * `data-submit` runs that action once per submission, whether the learner presses Enter in its
 * field or taps its submit button.
 * @param {HTMLElement} root
 * @param {(action: string) => unknown} onAction
 * @param {(answer: string) => unknown} onAnswer
 */
export function bind(root, onAction, onAnswer) {
  for (const element of root.querySelectorAll("[data-action]")) {
    const button = /** @type {HTMLElement} */ (element);
    button.addEventListener(
      "click",
      () => onAction(button.dataset.action ?? ""),
    );
  }
  for (const element of root.querySelectorAll("form[data-submit]")) {
    const form = /** @type {HTMLFormElement} */ (element);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      onAction(form.dataset.submit ?? "");
    });
  }
  for (const element of root.querySelectorAll("[data-answer]")) {
    const button = /** @type {HTMLElement} */ (element);
    button.addEventListener(
      "click",
      () => onAnswer(button.dataset.answer ?? ""),
    );
  }
}
