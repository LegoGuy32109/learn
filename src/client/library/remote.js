// @ts-check
// The shelf's reads from the server. The browser session cookie travels with every request, so a
// signed-in phone needs no token. Every failure, including no network, is reported as a plain
// outcome; nothing here throws into a surface.
import { apiFetch } from "../api.js";
import { field } from "../../shared/json.js";

/**
 * @template T
 * @typedef {{ ok: true, value: T } | { ok: false, status: number, message: string }} Fetched
 */

/**
 * A JSON read. The caller names the shape the endpoint documents.
 * @template T
 * @param {string} path
 * @returns {Promise<Fetched<T>>}
 */
async function read(path) {
  let response;
  try {
    response = await apiFetch(path, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, message: "You are offline." };
  }
  if (!response.ok) {
    const detail = field(await response.json().catch(() => null), "detail");
    await response.body?.cancel().catch(() => {});
    return {
      ok: false,
      status: response.status,
      message: typeof detail === "string"
        ? detail
        : `The server answered ${response.status}.`,
    };
  }
  // This application's own server answered, with the body its endpoint documents.
  return { ok: true, value: /** @type {T} */ (await response.json()) };
}

/**
 * The account's lessons, newest first.
 * @returns {Promise<Fetched<{ lessons: import("./shelf-model.js").RemoteLesson[] }>>}
 */
export function fetchShelf() {
  return read("/api/v1/shelf");
}

/**
 * One immutable Lesson Revision's content, ready to cache.
 * @param {string} lessonId
 * @param {string} revisionId
 * @returns {Promise<Fetched<import("../../shared/lessons/types.d.ts").Lesson>>}
 */
export async function fetchRevision(lessonId, revisionId) {
  /** @type {Fetched<{ content: import("../../shared/lessons/types.d.ts").Lesson }>} */
  const stored = await read(
    `/api/v1/lessons/${encodeURIComponent(lessonId)}/revisions/${
      encodeURIComponent(revisionId)
    }`,
  );
  if (!stored.ok) return stored;
  return { ok: true, value: stored.value.content };
}
