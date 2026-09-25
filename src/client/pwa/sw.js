// @ts-check
/// <reference lib="webworker" />
// The application shell's service worker, registered at scope "/" by register.js.
//
// The server renders this file: the two placeholders below become the build hash and the
// precache list for the shell on disk. A changed asset changes those bytes, the browser sees a
// new worker, and the new worker opens its own cache and deletes the old one on activation.
//
// This worker caches only the versioned shell: HTML shell, stylesheets, browser modules, icons
// and the manifest. Lesson content and progress live in IndexedDB. No `/api/` response and no
// mutation is ever stored. Routing decisions are pure functions in sw-routing.js so they are
// unit-tested without a browser.

import { cacheName, classifyRequest, staleCaches } from "./sw-routing.js";

const BUILD_HASH = "__BUILD_HASH__";
const PRECACHE = ["__PRECACHE__"];
const SHELL_PATH = "/shell";

const worker =
  /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));
const CACHE = cacheName(BUILD_HASH);
const precached = new Set(PRECACHE);

worker.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await worker.caches.open(CACHE);
    await cache.addAll(PRECACHE);
    // No skipWaiting here. register.js shows "Update ready" and the learner chooses when to reload,
    // so a new version never replaces the page in the middle of a Question.
  })());
});

worker.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await worker.caches.keys();
    await Promise.all(
      staleCaches(names, CACHE).map((name) => worker.caches.delete(name)),
    );
    await worker.clients.claim();
  })());
});

worker.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") worker.skipWaiting();
});

/**
 * A precached asset: serve the cached copy. A miss (a partial install) fetches once and stores it,
 * which is safe because the cache is already pinned to this build.
 * @param {Request} request
 */
async function fromShellCache(request) {
  const cache = await worker.caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/**
 * A page load: the network first, so a fresh deploy and the inlined featured lesson arrive when
 * they can; the cached lesson-free shell when they cannot. The browser app then reads its lesson
 * from IndexedDB.
 * @param {Request} request
 */
async function navigation(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await worker.caches.open(CACHE);
    const shell = await cache.match(SHELL_PATH);
    if (shell) return shell;
    throw error;
  }
}

worker.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== worker.location.origin) return;
  const kind = classifyRequest({
    pathname: url.pathname,
    method: request.method,
    mode: request.mode,
  }, precached);
  if (kind === "network-only") return;
  if (kind === "pass-through") return;
  if (kind === "navigate") {
    event.respondWith(navigation(request));
    return;
  }
  event.respondWith(fromShellCache(request));
});
