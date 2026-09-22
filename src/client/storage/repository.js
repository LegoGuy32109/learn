// @ts-check
// IndexedDB adapter. UI modules never issue raw IndexedDB operations; they call this repository.
//
// Stores: `lessons` holds cached Lesson Revisions keyed by revision ID; `learning_events` and
// `navigation_events` hold immutable evidence for every revision on the device; `projections`
// holds rebuildable derived state; `drill_events` is the drill's own stream; `progress_streams` pins each Lesson to the revision the
// learner is on and the progress epoch new evidence is written under.

const DB = "learn-local-v1";
// Version 2 added `drill_events` (the drill's own evidence and checkpoint stream) and
// `progress_streams` (the revision and epoch each Lesson is pinned to).
const VERSION = 2;
const STORES = ["lessons", "learning_events", "navigation_events", "drill_events", "projections", "progress_streams"];

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

/** @returns {Promise<IDBDatabase>} */
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
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
  /** Store a Lesson Revision once; an existing copy is never replaced. @param {any} lesson */
  async seed(lesson) {
    const db = await open();
    const found = await done(objectStore(db, "lessons", "readonly").get(lesson.revisionId));
    if (found) return;
    await done(objectStore(db, "lessons", "readwrite").put({ id: lesson.revisionId, lesson, cachedAt: new Date().toISOString() }));
  },
  /** Every cached Lesson Revision, for a launch with no network and no inlined lesson. */
  async lessons() {
    const db = await open();
    const records = /** @type {any[]} */ (await done(objectStore(db, "lessons", "readonly").getAll()));
    return records.map((record) => record.lesson);
  },
  /** Every cached Lesson Revision with when this device stored it. @returns {Promise<CachedRevision[]>} */
  async revisions() {
    const db = await open();
    const records = /** @type {any[]} */ (await done(objectStore(db, "lessons", "readonly").getAll()));
    return records.map((record) => ({ lesson: record.lesson, cachedAt: record.cachedAt ?? "" }));
  },
  /** @param {string} id */
  async lesson(id) {
    const db = await open();
    const record = /** @type {any} */ (await done(objectStore(db, "lessons", "readonly").get(id)));
    return record?.lesson;
  },
  /** @param {string} store */
  async events(store) {
    const db = await open();
    return /** @type {any[]} */ (await done(objectStore(db, store, "readonly").getAll()));
  },
  /** @param {string} store @param {any} event */
  async append(store, event) {
    const db = await open();
    await done(objectStore(db, store, "readwrite").put(event));
  },
  /** Read a projection when `value` is omitted; otherwise write it. @param {string} id @param {any} [value] */
  async projection(id, value) {
    const db = await open();
    if (value === undefined) {
      const record = /** @type {any} */ (await done(objectStore(db, "projections", "readonly").get(id)));
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
    return /** @type {ProgressStream[]} */ (await done(objectStore(db, "progress_streams", "readonly").getAll()));
  },
  /** Pin a Lesson to a revision and epoch. Discarding progress writes a higher epoch here. @param {ProgressStream} stream */
  async saveStream(stream) {
    const db = await open();
    await done(objectStore(db, "progress_streams", "readwrite").put(stream));
  },
};
