// @ts-check
// Drill: every Question in every Pool, reserved ones included, in one seeded random order.
// Drill evidence lives in its own stream and never touches Seen, Learned or the learning checkpoint.
import { shuffled } from "./shuffle.js";
import { reduceCheckpoint } from "./checkpoint.js";

export const DRILL_ANSWERED = "drill_question_answered";
export const DRILL_CHECKPOINTED = "drill_checkpointed";

/** @typedef {import("../lessons/types.d.ts").Lesson} Lesson */
/** @typedef {import("./types.d.ts").DrillAnswered} DrillAnswered */

/**
 * @param {{ type: string }} event
 * @returns {event is DrillAnswered}
 */
const isDrillAnswer = (event) => event.type === DRILL_ANSWERED;

/**
 * Every Question ID in the lesson exactly once, in the order fixed by `seed`.
 * @param {Lesson} lesson
 * @param {number} seed
 * @returns {string[]}
 */
export function drillQueue(lesson, seed) {
  const ids = lesson.questions.map((question) => question.id);
  return shuffled(ids, seed);
}

/**
 * The drill resume position, or null when no drill run is open.
 * @template Checkpoint
 * @param {ReadonlyArray<{ type: string, occurredAt: string, checkpoint?: Checkpoint | null }>} events
 * @returns {Checkpoint | null}
 */
export function reduceDrillCheckpoint(events) {
  return reduceCheckpoint(events, DRILL_CHECKPOINTED);
}

/**
 * What happened to each Concept during one drill run. Counts describe outcomes for the summary;
 * they are never a score.
 * @param {Lesson} lesson
 * @param {ReadonlyArray<{ type: string }>} events  Events of other types are ignored
 * @param {string} runId
 * @returns {{ id: string, title: string, questions: number, asked: number, retrieved: number, missed: number, unknown: number }[]}
 */
export function reduceDrill(lesson, events, runId) {
  const answers = events.filter(isDrillAnswer).filter((event) =>
    event.runId === runId
  );
  return lesson.concepts.map((concept) => {
    const own = answers.filter((event) => event.conceptId === concept.id);
    const questions = lesson.questions.filter((question) =>
      question.conceptId === concept.id
    ).length;
    const retrieved = own.filter((event) => event.correct).length;
    const unknown = own.filter((event) => event.idk).length;
    return {
      id: concept.id,
      title: concept.title,
      questions,
      asked: own.length,
      retrieved,
      missed: own.length - retrieved - unknown,
      unknown,
    };
  });
}

/**
 * One line of plain words for a Concept's drill outcome.
 * @param {ReturnType<typeof reduceDrill>[number]} outcome
 */
export function describeOutcome(outcome) {
  if (outcome.asked === 0) return "Not reached";
  const parts = [];
  if (outcome.retrieved) parts.push(`${outcome.retrieved} retrieved`);
  if (outcome.missed) parts.push(`${outcome.missed} missed`);
  if (outcome.unknown) parts.push(`${outcome.unknown} unknown`);
  const noun = outcome.asked === 1 ? "question" : "questions";
  return `${outcome.asked} ${noun} · ${parts.join(", ")}`;
}
