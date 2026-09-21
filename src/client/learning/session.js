// @ts-check
// Learner session: holds the loaded evidence for one Lesson Revision and appends new evidence
// through the storage repository. Progress and checkpoints are projections rebuilt by shared reducers.
import { localRepository } from "../storage/repository.js";
import { reduceProgress } from "../../shared/learning/progress.js";
import { reduceCheckpoint } from "../../shared/learning/checkpoint.js";

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
 * @property {"shelf"|"overview"|"learn"} surface
 * @property {() => Promise<void>} load
 * @property {(type: string, data?: Record<string, unknown>) => Promise<void>} recordEvent
 * @property {() => Promise<void>} saveCheckpoint
 * @property {() => Promise<any>} rebuildProgress
 * @property {(type: string, predicate?: (event: any) => boolean) => boolean} hasEvent
 */

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
    surface: "shelf",

    async load() {
      await localRepository.seed(lesson);
      session.learningEvents = await localRepository.events("learning_events");
      session.savedCheckpoint = await localRepository.projection("checkpoint");
      if (session.savedCheckpoint) return;
      session.savedCheckpoint = reduceCheckpoint(await localRepository.events("navigation_events"));
      if (session.savedCheckpoint) await localRepository.projection("checkpoint", session.savedCheckpoint);
    },

    async recordEvent(type, data = {}) {
      const event = {
        id: crypto.randomUUID(),
        type,
        lessonRevisionId: lesson.revisionId,
        epoch: EPOCH,
        occurredAt: now(),
        ...data,
      };
      session.learningEvents.push(event);
      await localRepository.append("learning_events", event);
      await session.rebuildProgress();
    },

    async saveCheckpoint() {
      if (!session.flow) return;
      const checkpoint = {
        ...structuredClone(session.flow),
        learningEventFrontier: session.learningEvents.map((event) => event.id),
      };
      const event = {
        id: crypto.randomUUID(),
        type: "navigation_checkpointed",
        lessonRevisionId: lesson.revisionId,
        epoch: EPOCH,
        occurredAt: now(),
        checkpoint,
      };
      session.savedCheckpoint = checkpoint;
      await localRepository.append("navigation_events", event);
      await localRepository.projection("checkpoint", checkpoint);
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
