// @ts-check
// Drill flow controller: pure transitions over one drill run. A run asks every Question once in
// the order fixed by its seed. Answering reuses the learning flow's evaluation, feedback and
// corrective detour; only the queue rule differs, and nothing here awards Learned.
import { drillQueue } from "../../shared/learning/drill.js";

/**
 * @typedef {object} DrillFlow
 * @property {"question"|"corrective"|"summary"} screen
 * @property {"drill"} flowKind
 * @property {string} runId  Identifies this run's answers in the drill event stream
 * @property {number} seed  Fixes the Question order and the option order
 * @property {string} attemptId  Same as runId; kept so the learning views can read it
 * @property {string[]} queue  Remaining Question IDs; the head is the visible Question
 * @property {number} total
 * @property {number} conceptIndex  Only meaningful on the corrective screen
 * @property {number} cardIndex  Only meaningful on the corrective screen
 * @property {import("./flow.js").Feedback|null} feedback
 * @property {any} detour
 * @property {string[]} [drillEventFrontier]
 */

/**
 * Begin a drill run over every Question in every Pool.
 * @param {any} lesson
 * @param {{ seed: number, runId: string }} run
 * @returns {DrillFlow}
 */
export function startDrill(lesson, run) {
  const queue = drillQueue(lesson, run.seed);
  return {
    screen: "question",
    flowKind: "drill",
    runId: run.runId,
    seed: run.seed,
    attemptId: run.runId,
    queue,
    total: queue.length,
    conceptIndex: 0,
    cardIndex: 0,
    feedback: null,
    detour: null,
  };
}

/**
 * Leave feedback: the next Question, or the summary after the last one. Drill never re-asks.
 * @param {DrillFlow} flow
 * @returns {DrillFlow}
 */
export function advanceDrill(flow) {
  const queue = flow.queue.slice(1);
  const screen = queue.length ? "question" : "summary";
  return { ...flow, screen, queue, feedback: null };
}

/**
 * One-based position of the visible Question in the run.
 * @param {DrillFlow} flow
 */
export function drillPosition(flow) {
  return flow.total - flow.queue.length + 1;
}
