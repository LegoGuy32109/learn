// @ts-check
// The Mine shelf as pure data: what the server says the account owns, merged with what this device
// has cached, each Lesson pinned to one revision with its progress derived from local evidence.
// No DOM, no IndexedDB, no fetch here, so every rule is unit-tested under Deno.
import { reduceProgress } from "../../shared/learning/progress.js";
import { evidenceFor } from "../learning/session.js";

/**
 * @typedef {object} RemoteLesson  One entry of `GET /api/v1/shelf`
 * @property {string} lessonId
 * @property {string} title
 * @property {number} conceptCount
 * @property {number} questionCount
 * @property {string} latestRevisionId
 * @property {number} updatedAt  Milliseconds
 */

/**
 * @typedef {object} ShelfEntry
 * @property {string} lessonId
 * @property {string} title
 * @property {number} conceptCount
 * @property {number} questionCount
 * @property {string} revisionId       The revision this device opens: pinned by the stream, else the newest known
 * @property {import("../../shared/lessons/types.d.ts").Lesson|null} lesson  The pinned revision's content when cached on this device
 * @property {number} epoch
 * @property {import("../../shared/learning/progress.js").Progress} progress  Reduced from local evidence for the pinned revision and epoch
 * @property {string|null} latestRevisionId  The server's newest revision, when the server answered
 * @property {boolean} outdated        Progress exists on an older revision than the server's newest
 * @property {number} updatedAt        Sort key, newest first
 */

/** @type {import("../../shared/learning/progress.js").Progress} */
const NOT_STARTED = Object.freeze({
  state: "not_started",
  cardsSeen: new Set(),
  learnedConcepts: new Set(),
  conceptStates: [],
});

/**
 * Build the shelf, newest first, one entry per Lesson.
 * @param {object} input
 * @param {import("../storage/repository.js").CachedRevision[]} input.cached  Every revision on this device
 * @param {RemoteLesson[]|null} input.remote   The server's list, or null for a guest or an unreachable server
 * @param {import("../storage/repository.js").ProgressStream[]} input.streams
 * @param {import("../learning/session.js").RecordedEvent[]} input.learningEvents  Every learning event on this device
 * @returns {ShelfEntry[]}
 */
export function buildShelf({ cached, remote, streams, learningEvents }) {
  /** @type {Map<string, import("../storage/repository.js").CachedRevision[]>} */
  const byLesson = new Map();
  for (const revision of cached) {
    const list = byLesson.get(revision.lesson.lessonId) ?? [];
    list.push(revision);
    byLesson.set(revision.lesson.lessonId, list);
  }
  const streamByLesson = new Map(streams.map((stream) => [stream.id, stream]));
  const remoteByLesson = new Map(
    (remote ?? []).map((lesson) => [lesson.lessonId, lesson]),
  );
  const lessonIds = new Set([...remoteByLesson.keys(), ...byLesson.keys()]);

  /** @type {ShelfEntry[]} */
  const entries = [];
  for (const lessonId of lessonIds) {
    const revisions = byLesson.get(lessonId) ?? [];
    const stream = streamByLesson.get(lessonId) ?? null;
    const server = remoteByLesson.get(lessonId) ?? null;
    const pinned = pinnedRevision(revisions, stream, server, learningEvents);
    const epoch = stream?.epoch ?? 0;
    const cachedPinned = revisions.find((revision) =>
      revision.lesson.revisionId === pinned
    )?.lesson ?? null;
    const progress = cachedPinned
      ? reduceProgress(cachedPinned, evidenceFor(learningEvents, pinned, epoch))
      : NOT_STARTED;
    const latestRevisionId = server?.latestRevisionId ?? null;
    const outdated = latestRevisionId !== null && latestRevisionId !== pinned &&
      progress.state !== "not_started";
    const source = cachedPinned ?? revisions.at(-1)?.lesson ?? null;
    entries.push({
      lessonId,
      title: source?.title ?? server?.title ?? "Untitled lesson",
      conceptCount: source ? source.concepts.length : server?.conceptCount ?? 0,
      questionCount: source
        ? source.questions.length
        : server?.questionCount ?? 0,
      revisionId: pinned,
      lesson: cachedPinned,
      epoch,
      progress,
      latestRevisionId,
      outdated,
      updatedAt: server?.updatedAt ??
        Math.max(
          0,
          ...revisions.map((revision) => Date.parse(revision.cachedAt) || 0),
        ),
    });
  }
  return entries.sort((a, b) =>
    b.updatedAt - a.updatedAt || a.title.localeCompare(b.title)
  );
}

/**
 * Which revision of one Lesson this device opens. A stream pins it while progress exists. Without
 * progress the newest revision wins, so an unstarted lesson quietly follows the server. Evidence
 * recorded before streams existed pins the revision it was recorded against.
 * @param {import("../storage/repository.js").CachedRevision[]} revisions
 * @param {import("../storage/repository.js").ProgressStream|null} stream
 * @param {RemoteLesson|null} server
 * @param {import("../learning/session.js").RecordedEvent[]} learningEvents
 * @returns {string}
 */
function pinnedRevision(revisions, stream, server, learningEvents) {
  if (stream) {
    const cached = revisions.find((revision) =>
      revision.lesson.revisionId === stream.revisionId
    )?.lesson;
    const started = cached
      ? reduceProgress(
        cached,
        evidenceFor(learningEvents, stream.revisionId, stream.epoch),
      ).state !== "not_started"
      : false;
    if (started || !server || server.latestRevisionId === stream.revisionId) {
      return stream.revisionId;
    }
    return server.latestRevisionId;
  }
  const withEvidence = revisions.find((revision) =>
    evidenceFor(learningEvents, revision.lesson.revisionId, 0).length > 0
  );
  if (withEvidence) return withEvidence.lesson.revisionId;
  if (server) return server.latestRevisionId;
  const newest =
    [...revisions].sort((a, b) =>
      (Date.parse(b.cachedAt) || 0) - (Date.parse(a.cachedAt) || 0)
    )[0];
  return newest.lesson.revisionId;
}

/**
 * Discard progress on the pinned revision and start the newer one. The epoch advances so evidence
 * written under the old epoch, on this device or on one that was offline, is never read again.
 * Nothing is copied across revisions.
 * @param {import("../storage/repository.js").ProgressStream} stream
 * @param {string} newRevisionId
 * @returns {import("../storage/repository.js").ProgressStream}
 */
export function discardTo(stream, newRevisionId) {
  return { id: stream.id, revisionId: newRevisionId, epoch: stream.epoch + 1 };
}

/**
 * The stream to save when a Lesson is opened: the existing one, or a new pin at epoch 0.
 * @param {import("../storage/repository.js").ProgressStream|undefined} existing
 * @param {ShelfEntry} entry
 * @returns {import("../storage/repository.js").ProgressStream}
 */
export function pinOnOpen(existing, entry) {
  if (existing && existing.revisionId === entry.revisionId) return existing;
  return {
    id: entry.lessonId,
    revisionId: entry.revisionId,
    epoch: existing?.epoch ?? entry.epoch,
  };
}
