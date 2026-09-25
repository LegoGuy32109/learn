// Learning and navigation evidence as the browser records it and the server stores it. Events are
// immutable. Events written before epochs existed carry none and belong to epoch 0.

interface EventBase {
  id: string;
  lessonRevisionId: string;
  epoch?: number;
  occurredAt: string;
}

export interface LessonStarted extends EventBase {
  type: "lesson_started";
}

export interface CardSeen extends EventBase {
  type: "card_seen";
  conceptId: string;
  cardId: string;
}

export interface QuestionAnswered extends EventBase {
  type: "question_answered";
  flowKind: "check" | "wrap_up";
  conceptId: string;
  poolId: string;
  questionId: string;
  attemptId: string;
  /** An option ID, typed text, a number, or null for I don't know. */
  answer: string | number | null;
  correct: boolean;
}

export type LearningEvent = LessonStarted | CardSeen | QuestionAnswered;

/** A resume position. The learning flow and the drill each write their own checkpoint type. */
export interface CheckpointEvent<Checkpoint = unknown> extends EventBase {
  type: string;
  /** Null ends the run: no resume position remains. */
  checkpoint: (Checkpoint & { learningEventFrontier?: string[] }) | null;
}

/** One answer in a drill run. Drill evidence stays on the device and never feeds progress. */
export interface DrillAnswered extends EventBase {
  type: "drill_question_answered";
  runId: string;
  conceptId: string;
  poolId: string;
  questionId: string;
  answer: string | number | null;
  idk: boolean;
  correct: boolean;
}
