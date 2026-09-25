// @ts-check
/** @typedef {import("../../shared/lessons/types.d.ts").Lesson} Lesson */
// IndexedDB adapter. UI modules never issue raw IndexedDB operations; they call this repository.
//
// Stores: `lessons` holds cached Lesson Revisions keyed by revision ID; `learning_events` and
// `navigation_events` hold immutable evidence for every revision on the device; `projections`
// holds rebuildable derived state; `drill_events` is the drill's own stream; `progress_streams` pins each Lesson to the revision the
// learner is on and the progress epoch new evidence is written under; `outbox` holds every event
// this device created and the server has not yet acknowledged; `sync_cursors` holds the opaque
// server cursor per stream, revision and epoch.

const DB = "learn-local-v1";
// Version 2 added `drill_events` (the drill's own evidence and checkpoint stream) and
// `progress_streams` (the revision and epoch each Lesson is pinned to).
// Version 3 added `outbox` (events awaiting upload) and `sync_cursors` (where each pull left off).
const VERSION = 3;
const STORES = [
  "lessons",
  "learning_events",
  "navigation_events",
  "drill_events",
  "projections",
  "progress_streams",
  "outbox",
  "sync_cursors",
];

/**
 * @typedef {object} ProgressStream
 * @property {string} id           The Lesson ID
 * @property {string} revisionId   The Lesson Revision the learner's progress is pinned to
 * @property {number} epoch        Advanced only by an explicit discard; older epochs are never read
 */

/**
 * @typedef {object} CachedRevision
 * @property {any} lesson
 * @property {string} cachedAt  ISO time this device stored the revision
 */

/**
 * One event this device created that the server has not acknowledged yet.
 * @typedef {object} OutboxEntry
 * @property {string} id       The event ID, so an acknowledged event leaves by ID
 * @property {string} store    `learning_events` or `navigation_events`
 * @property {any} event
 * @property {string} queuedAt ISO time it entered the outbox
 */

/** @param {IDBTransaction} transaction */
function committed(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** @returns {Promise<IDBDatabase>} */
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * @param {IDBDatabase} db
 * @param {string} store
 * @param {IDBTransactionMode} mode
 */
function objectStore(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

/** @param {IDBRequest} request */
function done(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const localRepository = {
  /** Store a Lesson Revision once; an existing copy is never replaced. @param {Lesson} lesson */
  async seed(lesson) {
    const db = await open();
    const found = await done(
      objectStore(db, "lessons", "readonly").get(lesson.revisionId),
    );
    if (found) return;
    await done(
      objectStore(db, "lessons", "readwrite").put({
        id: lesson.revisionId,
        lesson,
        cachedAt: new Date().toISOString(),
      }),
    );
  },
  /** Every cached Lesson Revision, for a launch with no network and no inlined lesson. */
  async lessons() {
    const db = await open();
    const records = /** @type {any[]} */ (await done(
      objectStore(db, "lessons", "readonly").getAll(),
    ));
    return records.map((record) => record.lesson);
  },
  /** Every cached Lesson Revision with when this device stored it. @returns {Promise<CachedRevision[]>} */
  async revisions() {
    const db = await open();
    const records = /** @type {any[]} */ (await done(
      objectStore(db, "lessons", "readonly").getAll(),
    ));
    return records.map((record) => ({
      lesson: record.lesson,
      cachedAt: record.cachedAt ?? "",
    }));
  },
  /** @param {string} id */
  async lesson(id) {
    const db = await open();
    const record = /** @type {any} */ (await done(
      objectStore(db, "lessons", "readonly").get(id),
    ));
    return record?.lesson;
  },
  /** @param {string} store */
  async events(store) {
    const db = await open();
    return /** @type {any[]} */ (await done(
      objectStore(db, store, "readonly").getAll(),
    ));
  },
  /** @param {string} store @param {any} event */
  async append(store, event) {
    const db = await open();
    await done(objectStore(db, store, "readwrite").put(event));
  },
  /**
   * Record an event this device created: it enters its store and the outbox in one transaction, so
   * it is queued for upload before anything can read it back. @param {string} store @param {any} event
   */
  async appendOutgoing(store, event) {
    const db = await open();
    const transaction = db.transaction([store, "outbox"], "readwrite");
    transaction.objectStore(store).put(event);
    transaction.objectStore("outbox").put({
      id: event.id,
      store,
      event,
      queuedAt: new Date().toISOString(),
    });
    await committed(transaction);
  },
  /**
   * Store events that arrived from the server. They never enter the outbox; an event this device
   * already holds is left as it is. @param {string} store @param {any[]} events
   */
  async appendRemote(store, events) {
    if (!events.length) return;
    const db = await open();
    const transaction = db.transaction(store, "readwrite");
    const target = transaction.objectStore(store);
    for (const event of events) {
      target.add(event).onerror = (error) => error.preventDefault();
    }
    await committed(transaction);
  },
  /** Every event awaiting upload, oldest first. @returns {Promise<OutboxEntry[]>} */
  async outbox() {
    const db = await open();
    const entries = /** @type {OutboxEntry[]} */ (await done(
      objectStore(db, "outbox", "readonly").getAll(),
    ));
    return entries.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  },
  /** Leave the outbox once the server acknowledged the events. @param {string[]} ids */
  async acknowledge(ids) {
    if (!ids.length) return;
    const db = await open();
    const transaction = db.transaction("outbox", "readwrite");
    const target = transaction.objectStore("outbox");
    for (const id of ids) target.delete(id);
    await committed(transaction);
  },
  /** The server cursor a pull left off at, or an empty string for the first page. @param {string} key */
  async cursor(key) {
    const db = await open();
    const record = /** @type {any} */ (await done(
      objectStore(db, "sync_cursors", "readonly").get(key),
    ));
    return typeof record?.cursor === "string" ? record.cursor : "";
  },
  /** @param {string} key @param {string} cursor */
  async saveCursor(key, cursor) {
    const db = await open();
    await done(
      objectStore(db, "sync_cursors", "readwrite").put({ id: key, cursor }),
    );
  },
  /** Read a projection when `value` is omitted; otherwise write it. @param {string} id @param {any} [value] */
  async projection(id, value) {
    const db = await open();
    if (value === undefined) {
      const record = /** @type {any} */ (await done(
        objectStore(db, "projections", "readonly").get(id),
      ));
      return record?.value;
    }
    await done(objectStore(db, "projections", "readwrite").put({ id, value }));
  },
  async clearProjections() {
    const db = await open();
    await done(objectStore(db, "projections", "readwrite").clear());
  },
  /** Every Lesson's pinned revision and epoch. @returns {Promise<ProgressStream[]>} */
  async streams() {
    const db = await open();
    return /** @type {ProgressStream[]} */ (await done(
      objectStore(db, "progress_streams", "readonly").getAll(),
    ));
  },
  /** Pin a Lesson to a revision and epoch. Discarding progress writes a higher epoch here. @param {ProgressStream} stream */
  async saveStream(stream) {
    const db = await open();
    await done(objectStore(db, "progress_streams", "readwrite").put(stream));
  },
};
