// The record shapes the browser keeps in IndexedDB (`learn-local-v1`), for tests that read the
// stores directly. Each store is named once here, so a reader gets the right type from the name.
import type { Lesson } from "../../src/shared/lessons/types.d.ts";
import type {
  CheckpointEvent,
  DrillAnswered,
  LearningEvent,
} from "../../src/shared/learning/types.d.ts";
import type { Flow } from "../../src/client/learning/flow.js";
import type { DrillFlow } from "../../src/client/learning/drill-flow.js";
import type { ProgressStream } from "../../src/client/storage/repository.js";
import type { Progress } from "../../src/shared/learning/progress.js";

export type NavigationEvent = CheckpointEvent<Flow> & {
  type: "navigation_checkpointed";
};

export type DrillEvent =
  | DrillAnswered
  | (CheckpointEvent<DrillFlow> & { type: "drill_checkpointed" });

export interface Stores {
  lessons: { id: string; lesson: Lesson; cachedAt: string };
  learning_events: LearningEvent;
  navigation_events: NavigationEvent;
  drill_events: DrillEvent;
  projections: { id: string; value: unknown };
  progress_streams: ProgressStream;
  outbox: {
    id: string;
    store: string;
    event: LearningEvent | NavigationEvent;
    queuedAt: string;
  };
  sync_cursors: { id: string; cursor: string };
}

export type StoreName = keyof Stores;

/** Projections are keyed `<name>:<revision>:<epoch>`; the name fixes the value's shape. */
export interface Projections {
  checkpoint: Flow & { learningEventFrontier?: string[] };
  drill_checkpoint: DrillFlow | null;
  progress: Progress;
}
