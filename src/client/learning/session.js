// @ts-check
// Learner session: holds the loaded evidence for one Lesson Revision and appends new evidence
// through the storage repository. Progress and checkpoints are projections rebuilt by shared reducers.
// Drill evidence is a separate stream with its own checkpoint; it never feeds the progress reducer.
// Evidence is read and written under one progress epoch: a discard advances the epoch, and evidence
// from an older epoch or another revision is never part of this session.
import { localRepository } from "../storage/repository.js";
import { reduceProgress } from "../../shared/learning/progress.js";
import { reduceCheckpoint } from "../../shared/learning/checkpoint.js";
import { DRILL_CHECKPOINTED, reduceDrillCheckpoint } from "../../shared/learning/drill.js";

function now() {
  return new Date().toISOString();
}

/**
 * Only evidence for this revision under this epoch counts. Events written before epochs existed
 * carry none and belong to epoch 0.
 * @param {any[]} events
 * @param {string} revisionId
 * @param {number} epoch
 */
export function evidenceFor(events, revisionId, epoch) {
  return events.filter((event) => event.lessonRevisionId === revisionId && (event.epoch ?? 0) === epoch);
}

/**
 * @typedef {object} Session
 * @property {any} lesson
 * @property {any[]} learningEvents
 * @property {any} flow
 * @property {any} savedCheckpoint
 * @property {any[]} drillEvents
 * @property {any} drillFlow
 * @property {any} savedDrillCheckpoint
 * @property {"shelf"|"overview"|"learn"|"drill"} surface
 * @property {() => Promise<void>} load
 * @property {(type: string, data?: Record<string, unknown>) => Promise<void>} recordEvent
 * @property {() => Promise<void>} saveCheckpoint
 * @property {() => Promise<any>} rebuildProgress
 * @property {(type: string, predicate?: (event: any) => boolean) => boolean} hasEvent
 * @property {(type: string, data?: Record<string, unknown>) => Promise<void>} recordDrillEvent
 * @property {() => Promise<void>} saveDrillCheckpoint
 * @property {() => Promise<void>} endDrill
 */

/**
 * @param {any} lesson
 * @param {number} epoch
 * @param {string} type
 * @param {Record<string, unknown>} data
 */
function event(lesson, epoch, type, data) {
  return { id: crypto.randomUUID(), type, lessonRevisionId: lesson.revisionId, epoch, occurredAt: now(), ...data };
}

/**
 * @param {any} lesson
 * @param {{ epoch: number }} [stream]  The Lesson's progress stream; new evidence is written under its epoch.
 * @returns {Session}
 */
export function createSession(lesson, stream = { epoch: 0 }) {
  const EPOCH = stream.epoch;
  const progressKey = `progress:${lesson.revisionId}:${EPOCH}`;
  const checkpointKey = `checkpoint:${lesson.revisionId}:${EPOCH}`;
  const drillCheckpointKey = `drill_checkpoint:${lesson.revisionId}:${EPOCH}`;
  /** @type {Session} */
  const session = {
    lesson,
    learningEvents: [],
    flow: null,
    savedCheckpoint: null,
    drillEvents: [],
    drillFlow: null,
    savedDrillCheckpoint: null,
    surface: "shelf",

    async load() {
      await localRepository.seed(lesson);
      session.learningEvents = evidenceFor(await localRepository.events("learning_events"), lesson.revisionId, EPOCH);
      session.drillEvents = evidenceFor(await localRepository.events("drill_events"), lesson.revisionId, EPOCH);
      session.savedCheckpoint = await localRepository.projection(checkpointKey);
      if (!session.savedCheckpoint) {
        session.savedCheckpoint = reduceCheckpoint(evidenceFor(await localRepository.events("navigation_events"), lesson.revisionId, EPOCH));
        if (session.savedCheckpoint) await localRepository.projection(checkpointKey, session.savedCheckpoint);
      }
      session.savedDrillCheckpoint = await localRepository.projection(drillCheckpointKey);
      if (!session.savedDrillCheckpoint) {
        session.savedDrillCheckpoint = reduceDrillCheckpoint(session.drillEvents);
        if (session.savedDrillCheckpoint) await localRepository.projection(drillCheckpointKey, session.savedDrillCheckpoint);
      }
    },

    async recordEvent(type, data = {}) {
      const recorded = event(lesson, EPOCH, type, data);
      session.learningEvents.push(recorded);
      await localRepository.append("learning_events", recorded);
      await session.rebuildProgress();
    },

    async saveCheckpoint() {
      if (!session.flow) return;
      const checkpoint = {
        ...structuredClone(session.flow),
        learningEventFrontier: session.learningEvents.map((event) => event.id),
      };
      session.savedCheckpoint = checkpoint;
      await localRepository.append("navigation_events", event(lesson, EPOCH, "navigation_checkpointed", { checkpoint }));
      await localRepository.projection(checkpointKey, checkpoint);
    },

    async recordDrillEvent(type, data = {}) {
      const recorded = event(lesson, EPOCH, type, data);
      session.drillEvents.push(recorded);
      await localRepository.append("drill_events", recorded);
    },

    async saveDrillCheckpoint() {
      if (!session.drillFlow) return;
      const checkpoint = {
        ...structuredClone(session.drillFlow),
        drillEventFrontier: session.drillEvents.map((candidate) => candidate.id),
      };
      session.savedDrillCheckpoint = checkpoint;
      await session.recordDrillEvent(DRILL_CHECKPOINTED, { checkpoint });
      await localRepository.projection(drillCheckpointKey, checkpoint);
    },

    /** Close the drill run: a null checkpoint means there is nothing to resume. */
    async endDrill() {
      session.drillFlow = null;
      session.savedDrillCheckpoint = null;
      await session.recordDrillEvent(DRILL_CHECKPOINTED, { checkpoint: null });
      await localRepository.projection(drillCheckpointKey, null);
    },

    async rebuildProgress() {
      const progress = reduceProgress(lesson, session.learningEvents);
      await localRepository.projection(progressKey, progress);
      return progress;
    },

    hasEvent(type, predicate = () => true) {
      return session.learningEvents.some((event) => event.type === type && predicate(event));
    },
  };
  return session;
}
