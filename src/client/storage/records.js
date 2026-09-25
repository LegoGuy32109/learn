// @ts-check
// Checks for what IndexedDB hands back. The database outlives the code that wrote it: the shell
// updates only when the learner accepts, and two tabs can run different builds against one
// database, so a newer build reads records an older one wrote. Each record kind has one rule:
//
// - Projections (checkpoints, progress) are derived. The repository stamps them with
//   PROJECTION_VERSION; a record from another version, or one these checks refuse, reads as
//   missing and is rebuilt from events.
// - Events are evidence and are never discarded. `upcastEvent` brings an older shape to the current
//   one; an event it cannot read is kept in the store and skipped, and the skip is logged.
// - Cached lessons, pins and cursors fall back to what a first launch would do: fetch the lesson
//   again, pin on open, pull from the start.
import { isRecord } from "../../shared/json.js";

/** @typedef {import("../learning/session.js").RecordedEvent} RecordedEvent */
/** @typedef {import("../learning/session.js").Checkpoint} Checkpoint */
/** @typedef {import("../learning/session.js").DrillCheckpoint} DrillCheckpoint */
/** @typedef {import("../learning/flow.js").Flow} Flow */
/** @typedef {import("../learning/drill-flow.js").DrillFlow} DrillFlow */
/** @typedef {import("../learning/flow.js").Feedback} Feedback */
/** @typedef {import("./repository.js").LessonRecord} LessonRecord */
/** @typedef {import("./repository.js").ProgressStream} ProgressStream */
/** @typedef {import("./repository.js").OutboxEntry} OutboxEntry */

/**
 * The shape version of every projection. Bump it when Flow, DrillFlow or Progress changes shape:
 * every stored projection then reads as missing once and is rebuilt.
 */
export const PROJECTION_VERSION = 1;

/** @param {unknown} value @returns {value is string[]} */
function strings(value) {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string");
}

/** @param {unknown} value @returns {value is number} */
function index(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** @param {unknown} value @returns {value is string | null} */
function stringOrNull(value) {
  return value === null || typeof value === "string";
}

/** @param {unknown} value @returns {value is Feedback | null} */
function feedback(value) {
  if (value === null) return true;
  return isRecord(value) && typeof value.correct === "boolean" &&
    typeof value.idk === "boolean" && typeof value.text === "string" &&
    stringOrNull(value.belief) && stringOrNull(value.cardId);
}

const FLOW_SCREENS = new Set(["card", "question", "corrective", "summary"]);
const FLOW_KINDS = new Set(["cards", "check", "wrap_up"]);

/** @param {unknown} value @returns {value is Flow} */
export function isFlow(value) {
  return isRecord(value) && typeof value.screen === "string" &&
    FLOW_SCREENS.has(value.screen) && typeof value.flowKind === "string" &&
    FLOW_KINDS.has(value.flowKind) && index(value.conceptIndex) &&
    index(value.cardIndex) && typeof value.seed === "number" &&
    typeof value.attemptId === "string" && strings(value.queue) &&
    (value.wrapTotal === undefined || index(value.wrapTotal)) &&
    feedback(value.feedback) &&
    (value.detour === null || isFlow(value.detour));
}

/** @param {unknown} value @returns {value is Checkpoint} */
export function isCheckpoint(value) {
  return isFlow(value) && isRecord(value) &&
    strings(value.learningEventFrontier);
}

const DRILL_SCREENS = new Set(["question", "corrective", "summary"]);

/** @param {unknown} value @returns {value is DrillFlow} */
export function isDrillFlow(value) {
  return isRecord(value) && typeof value.screen === "string" &&
    DRILL_SCREENS.has(value.screen) && value.flowKind === "drill" &&
    typeof value.runId === "string" && typeof value.seed === "number" &&
    typeof value.attemptId === "string" && strings(value.queue) &&
    index(value.total) && index(value.conceptIndex) &&
    index(value.cardIndex) && feedback(value.feedback) &&
    (value.detour === null || isDrillFlow(value.detour));
}

/** @param {unknown} value @returns {value is DrillCheckpoint} */
export function isDrillCheckpoint(value) {
  return isDrillFlow(value) && isRecord(value) &&
    strings(value.drillEventFrontier);
}

/**
 * An event in the current shape, or null when the record cannot be read as one. Events written
 * before epochs existed carry none and belong to epoch 0.
 * @param {unknown} value
 * @returns {RecordedEvent | null}
 */
export function upcastEvent(value) {
  if (
    !isRecord(value) || typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    typeof value.lessonRevisionId !== "string" ||
    typeof value.occurredAt !== "string"
  ) return null;
  const epoch = value.epoch ?? 0;
  if (!index(epoch)) return null;
  return {
    ...value,
    id: value.id,
    type: value.type,
    lessonRevisionId: value.lessonRevisionId,
    occurredAt: value.occurredAt,
    epoch,
  };
}

/**
 * A cached lesson record whose content can be opened. The content came from this application's
 * server, which resolved it; this checks only what opening a lesson reads first.
 * @param {unknown} value
 * @returns {value is LessonRecord}
 */
export function isLessonRecord(value) {
  const lesson = isRecord(value) ? value.lesson : undefined;
  return isRecord(value) && typeof value.id === "string" &&
    isRecord(lesson) && typeof lesson.lessonId === "string" &&
    typeof lesson.revisionId === "string" && Array.isArray(lesson.concepts) &&
    Array.isArray(lesson.questions);
}

/** @param {unknown} value @returns {value is ProgressStream} */
export function isProgressStream(value) {
  return isRecord(value) && typeof value.id === "string" &&
    typeof value.revisionId === "string" && index(value.epoch);
}

/**
 * An outbox entry, with its event brought to the current shape, or null when it cannot be read.
 * @param {unknown} value
 * @returns {OutboxEntry | null}
 */
export function upcastOutboxEntry(value) {
  if (
    !isRecord(value) || typeof value.id !== "string" ||
    typeof value.store !== "string" || typeof value.queuedAt !== "string"
  ) return null;
  const event = upcastEvent(value.event);
  return event
    ? { id: value.id, store: value.store, event, queuedAt: value.queuedAt }
    : null;
}

/**
 * Keep the readable records, and log how many were not. Evidence that cannot be read stays in its
 * store; this only keeps it away from the reducers.
 * @template T
 * @param {unknown[]} records
 * @param {(record: unknown) => T | null} read
 * @param {string} store
 * @returns {T[]}
 */
export function readable(records, read, store) {
  /** @type {T[]} */
  const kept = [];
  for (const record of records) {
    const value = read(record);
    if (value !== null) kept.push(value);
  }
  const skipped = records.length - kept.length;
  if (skipped) {
    console.warn(
      `${store}: skipped ${skipped} record(s) this build cannot read`,
    );
  }
  return kept;
}
