// @ts-check
// The sync routes as the browser calls them. The session cookie travels with every request. Every
// failure, including no network, is a plain outcome the client acts on; nothing here throws.

/** @typedef {{ lessonId: string, lessonRevisionId: string, epoch: number }} StreamState */

/**
 * @typedef {object} Failure
 * @property {false} ok
 * @property {number} status     0 when the network was unreachable
 * @property {string} code       A structured code from the server, or `network`, `http`
 * @property {string} message
 * @property {StreamState|null} stream  The server's current stream when it refused a stale epoch
 */

/** @typedef {{ ok: true, accepted: number, duplicates: number, stream: StreamState|null }} Pushed */
/** @typedef {{ ok: true, events: any[], cursor: string, hasMore: boolean, stream: StreamState|null }} Pulled */

/** The route each IndexedDB store syncs with. */
const PATHS = { learning_events: "learning-events", navigation_events: "navigation-events" };

/**
 * @param {Response} response
 * @returns {Promise<Failure>}
 */
async function failure(response) {
  const body = await response.json().catch(() => ({}));
  return {
    ok: false,
    status: response.status,
    code: typeof body.code === "string" ? body.code : "http",
    message: typeof body.detail === "string" ? body.detail : `The server answered ${response.status}.`,
    stream: body.stream && typeof body.stream === "object" ? body.stream : null,
  };
}

/** @returns {Failure} */
function unreachable() {
  return { ok: false, status: 0, code: "network", message: "The server could not be reached.", stream: null };
}

/**
 * @param {typeof fetch} [fetchImpl]
 */
export function createTransport(fetchImpl = (input, init) => fetch(input, init)) {
  return {
    /**
     * Upload one bounded batch. The same events may be sent again after a lost response; the server
     * stores each ID once and reports the repeats as duplicates.
     * @param {string} store
     * @param {{ lessonRevisionId: string, epoch: number }} scope
     * @param {any[]} events
     * @returns {Promise<Pushed|Failure>}
     */
    async push(store, scope, events) {
      let response;
      try {
        response = await fetchImpl(`/api/v1/progress/${PATHS[/** @type {keyof typeof PATHS} */ (store)]}`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ lessonRevisionId: scope.lessonRevisionId, epoch: scope.epoch, events }),
          cache: "no-store",
        });
      } catch {
        return unreachable();
      }
      if (!response.ok) return failure(response);
      const body = await response.json().catch(() => null);
      if (!body) return { ok: false, status: response.status, code: "http", message: "The server's answer could not be read.", stream: null };
      return { ok: true, accepted: Number(body.accepted ?? 0), duplicates: Number(body.duplicates ?? 0), stream: body.stream ?? null };
    },

    /**
     * Read one page after `cursor`. The cursor is opaque: it goes back exactly as it came.
     * @param {string} store
     * @param {{ lessonRevisionId: string, epoch: number }} scope
     * @param {string} cursor
     * @returns {Promise<Pulled|Failure>}
     */
    async pull(store, scope, cursor) {
      const query = new URLSearchParams({ revision: scope.lessonRevisionId, epoch: String(scope.epoch) });
      if (cursor) query.set("cursor", cursor);
      let response;
      try {
        response = await fetchImpl(`/api/v1/progress/${PATHS[/** @type {keyof typeof PATHS} */ (store)]}?${query}`, { headers: { accept: "application/json" }, cache: "no-store" });
      } catch {
        return unreachable();
      }
      if (!response.ok) return failure(response);
      const body = await response.json().catch(() => null);
      if (!body || !Array.isArray(body.events)) return { ok: false, status: response.status, code: "http", message: "The server's answer could not be read.", stream: null };
      return { ok: true, events: body.events, cursor: String(body.cursor ?? cursor), hasMore: body.hasMore === true, stream: body.stream ?? null };
    },
  };
}

/** @typedef {ReturnType<typeof createTransport>} Transport */
