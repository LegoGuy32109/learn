// @ts-check
// Pure routing decisions for the service worker. No `self`, `caches` or `fetch` here, so every
// decision the worker makes can be unit-tested under Deno without a browser. sw.js itself needs
// the webworker lib and is type-checked separately (see deno.worker.json).

/**
 * @typedef {"network-only"|"navigate"|"shell"|"pass-through"} RouteKind
 * - network-only: never touches the cache. Every mutation, and every `/api/` path.
 * - navigate: a page load. Network first, then the cached lesson-free shell.
 * - shell: a precached static asset. Served from the versioned cache.
 * - pass-through: anything else goes straight to the network and is never stored.
 */

const CACHE_PREFIX = "learn-shell-";

/**
 * Decide how the worker handles one request.
 * @param {{ pathname: string, method: string, mode: string }} request
 * @param {ReadonlySet<string>} precache  Every path in the current build's precache list
 * @returns {RouteKind}
 */
export function classifyRequest({ pathname, method, mode }, precache) {
  if (method !== "GET") return "network-only";
  if (pathname.startsWith("/api/")) return "network-only";
  if (mode === "navigate") return "navigate";
  if (precache.has(pathname)) return "shell";
  return "pass-through";
}

/**
 * The cache that holds one build's shell.
 * @param {string} hash
 */
export function cacheName(hash) {
  return `${CACHE_PREFIX}${hash}`;
}

/**
 * Caches an activating worker deletes: every shell cache except its own. Caches that are not
 * shell caches are left alone.
 * @param {string[]} names  Every cache name in the origin
 * @param {string} current  This worker's cache name
 * @returns {string[]}
 */
export function staleCaches(names, current) {
  return names.filter((name) =>
    name.startsWith(CACHE_PREFIX) && name !== current
  );
}
