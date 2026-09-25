// @ts-check
// The sync routes as the browser calls them. The session cookie travels with every request. Every
// failure, including no network, is a plain outcome the client acts on; nothing here throws.

/** @typedef {import("../../shared/api/v1.d.ts").StreamState} StreamState */

/**
 * @typedef {object} Failure
 * @property {false} ok
 * @property {number} status     0 when the network was unreachable
 * @property {string} code       A structured code from the server, or `network`, `http`
 * @property {string} message
 * @property {StreamState|null} stream  The server's current stream when it refused a stale epoch
 */

/** @typedef {{ ok: true, accepted: number, duplicates: number, stream: StreamState|null }} Pushed */
/** @typedef {import("../learning/session.js").RecordedEvent} RecordedEvent */
/** @typedef {{ ok: true, events: RecordedEvent[], cursor: string, hasMore: boolean, stream: StreamState|null }} Pulled */

import { field, isRecord } from "../../shared/json.js";

/**
 * @param {unknown} value
 * @returns {value is StreamState}
 */
function isStreamState(value) {
  return isRecord(value) && typeof value.lessonId === "string" &&
    typeof value.lessonRevisionId === "string" &&
    typeof value.epoch === "number";
}

/**
 * An event as a pull returns it. The sync layer unions by `id` and the reducers narrow by `type`,
 * so those two are checked here; the server validated the rest when the event was pushed.
 * @param {unknown} value
 * @returns {value is RecordedEvent}
 */
function isPulledEvent(value) {
  return isRecord(value) && typeof value.id === "string" &&
    typeof value.type === "string";
}

/** The route each IndexedDB store syncs with. */
const PATHS = {
  learning_events: "learning-events",
  navigation_events: "navigation-events",
};

/**
 * @param {Response} response
 * @returns {Promise<Failure>}
 */
async function failure(response) {
  const body = await response.json().catch(() => null);
  const code = field(body, "code");
  const detail = field(body, "detail");
  const stream = field(body, "stream");
  return {
    ok: false,
    status: response.status,
    code: typeof code === "string" ? code : "http",
    message: typeof detail === "string"
      ? detail
      : `The server answered ${response.status}.`,
    stream: isStreamState(stream) ? stream : null,
  };
}

/** @returns {Failure} */
function unreachable() {
  return {
    ok: false,
    status: 0,
    code: "network",
    message: "The server could not be reached.",
    stream: null,
  };
}

/**
 * @param {typeof fetch} [fetchImpl]
 */
export function createTransport(
  fetchImpl = (input, init) => fetch(input, init),
) {
  return {
    /**
     * Upload one bounded batch. The same events may be sent again after a lost response; the server
     * stores each ID once and reports the repeats as duplicates.
     * @param {string} store
     * @param {{ lessonRevisionId: string, epoch: number }} scope
     * @param {RecordedEvent[]} events
     * @returns {Promise<Pushed|Failure>}
     */
    async push(store, scope, events) {
      let response;
      try {
        response = await fetchImpl(
          `/api/v1/progress/${
            PATHS[/** @type {keyof typeof PATHS} */ (store)]
          }`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({
              lessonRevisionId: scope.lessonRevisionId,
              epoch: scope.epoch,
              events,
            }),
            cache: "no-store",
          },
        );
      } catch {
        return unreachable();
      }
      if (!response.ok) return failure(response);
      const body = await response.json().catch(() => null);
      if (!isRecord(body)) {
        return {
          ok: false,
          status: response.status,
          code: "http",
          message: "The server's answer could not be read.",
          stream: null,
        };
      }
      return {
        ok: true,
        accepted: Number(body.accepted ?? 0),
        duplicates: Number(body.duplicates ?? 0),
        stream: isStreamState(body.stream) ? body.stream : null,
      };
    },

    /**
     * Read one page after `cursor`. The cursor is opaque: it goes back exactly as it came.
     * @param {string} store
     * @param {{ lessonRevisionId: string, epoch: number }} scope
     * @param {string} cursor
     * @returns {Promise<Pulled|Failure>}
     */
    async pull(store, scope, cursor) {
      const query = new URLSearchParams({
        revision: scope.lessonRevisionId,
        epoch: String(scope.epoch),
      });
      if (cursor) query.set("cursor", cursor);
      let response;
      try {
        response = await fetchImpl(
          `/api/v1/progress/${
            PATHS[/** @type {keyof typeof PATHS} */ (store)]
          }?${query}`,
          { headers: { accept: "application/json" }, cache: "no-store" },
        );
      } catch {
        return unreachable();
      }
      if (!response.ok) return failure(response);
      const body = await response.json().catch(() => null);
      if (
        !isRecord(body) || !Array.isArray(body.events) ||
        !body.events.every(isPulledEvent)
      ) {
        return {
          ok: false,
          status: response.status,
          code: "http",
          message: "The server's answer could not be read.",
          stream: null,
        };
      }
      return {
        ok: true,
        events: body.events,
        cursor: String(body.cursor ?? cursor),
        hasMore: body.hasMore === true,
        stream: isStreamState(body.stream) ? body.stream : null,
      };
    },
  };
}

/** @typedef {ReturnType<typeof createTransport>} Transport */
