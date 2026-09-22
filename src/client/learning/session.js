// @ts-check
// Learner session: holds the loaded evidence for one Lesson Revision and appends new evidence
// through the storage repository. Progress and checkpoints are projections rebuilt by shared reducers.
// Drill evidence is a separate stream with its own checkpoint; it never feeds the progress reducer.
import { localRepository } from "../storage/repository.js";
import { reduceProgress } from "../../shared/learning/progress.js";
import { reduceCheckpoint } from "../../shared/learning/checkpoint.js";
import { DRILL_CHECKPOINTED, reduceDrillCheckpoint } from "../../shared/learning/drill.js";

const EPOCH = 0;

function now() {
  return new Date().toISOString();
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
 * @param {string} type
 * @param {Record<string, unknown>} data
 */
function event(lesson, type, data) {
  return { id: crypto.randomUUID(), type, lessonRevisionId: lesson.revisionId, epoch: EPOCH, occurredAt: now(), ...data };
}

/**
 * @param {any} lesson
 * @returns {Session}
 */
export function createSession(lesson) {
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
      session.learningEvents = await localRepository.events("learning_events");
      session.drillEvents = await localRepository.events("drill_events");
      session.savedCheckpoint = await localRepository.projection("checkpoint");
      if (!session.savedCheckpoint) {
        session.savedCheckpoint = reduceCheckpoint(await localRepository.events("navigation_events"));
        if (session.savedCheckpoint) await localRepository.projection("checkpoint", session.savedCheckpoint);
      }
      session.savedDrillCheckpoint = await localRepository.projection("drill_checkpoint");
      if (!session.savedDrillCheckpoint) {
        session.savedDrillCheckpoint = reduceDrillCheckpoint(session.drillEvents);
        if (session.savedDrillCheckpoint) await localRepository.projection("drill_checkpoint", session.savedDrillCheckpoint);
      }
    },

    async recordEvent(type, data = {}) {
      const recorded = event(lesson, type, data);
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
      await localRepository.append("navigation_events", event(lesson, "navigation_checkpointed", { checkpoint }));
      await localRepository.projection("checkpoint", checkpoint);
    },

    async recordDrillEvent(type, data = {}) {
      const recorded = event(lesson, type, data);
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
      await localRepository.projection("drill_checkpoint", checkpoint);
    },

    /** Close the drill run: a null checkpoint means there is nothing to resume. */
    async endDrill() {
      session.drillFlow = null;
      session.savedDrillCheckpoint = null;
      await session.recordDrillEvent(DRILL_CHECKPOINTED, { checkpoint: null });
      await localRepository.projection("drill_checkpoint", null);
    },

    async rebuildProgress() {
      const progress = reduceProgress(lesson, session.learningEvents);
      await localRepository.projection("progress", progress);
      return progress;
    },

    hasEvent(type, predicate = () => true) {
      return session.learningEvents.some((event) => event.type === type && predicate(event));
    },
  };
  return session;
}
