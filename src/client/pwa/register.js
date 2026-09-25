// @ts-check
// Registers the service worker and shows a small "Update ready" affordance when a new build is
// waiting. The affordance never appears over an unanswered Question: the app tells this module
// when it is a good moment through `canInterrupt`, and calls `notifyRender` after every render so
// a held update surfaces at the next good moment.

/**
 * @typedef {object} Pwa
 * @property {() => void} notifyRender  Call after each render; shows a held update when allowed.
 */

/**
 * @param {{ canInterrupt: () => boolean }} options
 * @returns {Pwa}
 */
export function installPwa({ canInterrupt }) {
  /** @type {ServiceWorker|null} */
  let waiting = null;
  let shown = false;

  function showUpdateReady() {
    if (!waiting || shown || !canInterrupt()) return;
    shown = true;
    const worker = waiting;
    const notice = document.createElement("div");
    notice.className = "update";
    notice.setAttribute("role", "status");
    notice.innerHTML =
      '<span>Update ready</span><button type="button">Reload</button>';
    const button =
      /** @type {HTMLButtonElement} */ (notice.querySelector("button"));
    button.addEventListener("click", () => {
      button.disabled = true;
      worker.postMessage("SKIP_WAITING");
    });
    document.body.append(notice);
  }

  /** @param {ServiceWorker|null} worker */
  function track(worker) {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      // "installed" with a controller already in place means an update, not the first install.
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        waiting = worker;
        showUpdateReady();
      }
    });
  }

  async function register() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        type: "module",
      });
      if (registration.waiting && navigator.serviceWorker.controller) {
        waiting = registration.waiting;
        showUpdateReady();
      }
      track(registration.installing);
      registration.addEventListener(
        "updatefound",
        () => track(registration.installing),
      );
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded || !shown) return;
        reloaded = true;
        location.reload();
      });
    } catch {
      // The app works online without a worker. Offline launch is an enhancement, not a requirement.
    }
  }

  register();
  return { notifyRender: showUpdateReady };
}
