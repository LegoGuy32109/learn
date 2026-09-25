// @ts-check
// The compact sync state in the shell: Saved on this device, Syncing, Synced, or Sync failed. The
// element lives outside the surface root so a surface render never wipes it. When the server reports
// that another device discarded this progress, the state offers the one explicit way forward: discard
// here too. Nothing is applied until the learner chooses it.

/** @type {Record<import("./client.js").SyncStatus, string>} */
export const LABELS = {
  hidden: "",
  local: "Saved on this device",
  syncing: "Syncing",
  synced: "Synced",
  failed: "Sync failed",
};

/**
 * Bind the status element. Returns the function to call with every state change.
 * @param {HTMLElement|null} element
 * @param {{ onDiscard: () => Promise<void> }} actions
 * @returns {(state: import("./client.js").SyncState) => void}
 */
export function mountSyncStatus(element, actions) {
  if (!element) return () => {};
  /** @type {HTMLElement|null} */
  let banner = null;

  function hideBanner() {
    banner?.remove();
    banner = null;
  }

  /** @param {import("./client.js").SyncState} state */
  function showBanner(state) {
    if (banner || !state.remote) return;
    banner = document.createElement("div");
    banner.className = "update syncbanner";
    banner.id = "sync-discard";
    banner.setAttribute("role", "status");
    banner.innerHTML =
      '<span>Progress on this lesson was discarded on another device. Discard here too to sync again.</span><button type="button">Discard here</button>';
    const button =
      /** @type {HTMLButtonElement} */ (banner.querySelector("button"));
    button.addEventListener("click", async () => {
      button.disabled = true;
      await actions.onDiscard();
    });
    document.body.append(banner);
  }

  return (state) => {
    const label = LABELS[state.status];
    element.hidden = state.status === "hidden";
    element.textContent = label;
    element.dataset.sync = state.status;
    element.title = state.message ?? "";
    if (state.remote) showBanner(state);
    else hideBanner();
  };
}

/**
 * Re-render without losing what the learner has typed into the answer field. Drafts are local only:
 * a merge from another device must never blank one.
 * @param {() => Promise<void>} work
 */
export async function withDraftPreserved(work) {
  const field =
    /** @type {HTMLInputElement|null} */ (document.querySelector("#answer"));
  const draft = field?.value ?? null;
  const focused = field !== null && document.activeElement === field;
  await work();
  if (draft === null || !draft) return;
  const restored =
    /** @type {HTMLInputElement|null} */ (document.querySelector("#answer"));
  if (!restored) return;
  restored.value = draft;
  if (focused) restored.focus();
}
