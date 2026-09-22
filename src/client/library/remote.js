// @ts-check
// The shelf's reads from the server. The browser session cookie travels with every request, so a
// signed-in phone needs no token. Every failure, including no network, is reported as a plain
// outcome; nothing here throws into a surface.

/** @typedef {{ ok: true, value: any } | { ok: false, status: number, message: string }} Fetched */

/**
 * @param {string} path
 * @returns {Promise<Fetched>}
 */
async function read(path) {
  let response;
  try {
    response = await fetch(path, { headers: { accept: "application/json" }, cache: "no-store" });
  } catch {
    return { ok: false, status: 0, message: "You are offline." };
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    await response.body?.cancel().catch(() => {});
    return { ok: false, status: response.status, message: typeof body.detail === "string" ? body.detail : `The server answered ${response.status}.` };
  }
  return { ok: true, value: await response.json() };
}

/** The account's lessons, newest first. @returns {Promise<Fetched>} */
export function fetchShelf() {
  return read("/api/v1/shelf");
}

/**
 * One immutable Lesson Revision's content, ready to cache.
 * @param {string} lessonId
 * @param {string} revisionId
 * @returns {Promise<Fetched>}
 */
export async function fetchRevision(lessonId, revisionId) {
  const stored = await read(`/api/v1/lessons/${encodeURIComponent(lessonId)}/revisions/${encodeURIComponent(revisionId)}`);
  if (!stored.ok) return stored;
  return { ok: true, value: stored.value.content };
}
