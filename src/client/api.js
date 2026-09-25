// @ts-check
// Every call the browser application makes to /api/ goes through `apiFetch`. It names the API
// revision this copy speaks; when the server answers that the copy is too old (`client.outdated`),
// the copy resets itself instead of running against an API it no longer understands.
import { API_REVISION, API_REVISION_HEADER } from "../shared/api/revision.js";
import { field } from "../shared/json.js";
import { DB } from "./storage/repository.js";

/**
 * Whether a response is the server's refusal of an outdated copy.
 * @param {Response} response
 */
export async function isOutdated(response) {
  if (response.status !== 409) return false;
  const body = await response.clone().json().catch(() => null);
  return field(body, "code") === "client.outdated";
}

/**
 * Reset this device to a first launch: sign out, delete the local database, the shell caches and
 * the service worker, and load the shelf again from the network. Progress not yet synced is lost;
 * the learner signs in again.
 */
export async function resetDevice() {
  await fetch("/api/v1/session", { method: "DELETE" }).catch(() => {});
  const registrations = await navigator.serviceWorker?.getRegistrations()
    .catch(() => []) ?? [];
  for (const registration of registrations) await registration.unregister();
  if (globalThis.caches) {
    for (const name of await caches.keys()) await caches.delete(name);
  }
  // An open connection blocks the deletion; it completes once the reload below closes them.
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB);
    request.onsuccess = request.onerror = request.onblocked = () =>
      resolve(undefined);
  });
  location.replace("/");
}

/**
 * `fetch` for an API path. A copy the server refuses as outdated resets itself, and the returned
 * promise never settles: nothing after it should run against the old API.
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @param {{ fetch?: typeof fetch, reset?: () => Promise<void> }} [dependencies]  Tests substitute these
 * @returns {Promise<Response>}
 */
export async function apiFetch(input, init = {}, dependencies = {}) {
  const send = dependencies.fetch ?? fetch;
  const headers = new Headers(init.headers);
  headers.set(API_REVISION_HEADER, String(API_REVISION));
  const response = await send(input, { ...init, headers });
  if (await isOutdated(response)) {
    await (dependencies.reset ?? resetDevice)();
    return new Promise(() => {});
  }
  return response;
}
