// @ts-check
import { shuffled } from "./shuffle.js";

/**
 * Pure next-state rule for a Concept Check feedback action.
 * @template {{ correct?: boolean, idk?: boolean, queue: string[] }} State
 * @param {State} state
 * @returns {State & { done: boolean }}
 */
export function advanceCheck(state) {
  if (state.correct || state.idk || state.queue.length === 1) {
    return { ...state, queue: [], done: true };
  }
  return { ...state, queue: state.queue.slice(1), done: false };
}

/**
 * Pure Wrap-up rule: a missed Concept returns after every remaining Concept. Only the remaining
 * Questions are shuffled, so the missed one is never asked again as the very next Question.
 * @template {{ correct?: boolean, queue: string[], seed: number }} State
 * @param {State} state
 * @returns {State & { done: boolean }}
 */
export function advanceWrapUp(state) {
  if (state.correct) {
    const queue = state.queue.slice(1);
    return { ...state, queue, done: queue.length === 0 };
  }
  const remaining = shuffled(
    state.queue.slice(1),
    state.seed + state.queue.length,
  );
  const queue = [...remaining, state.queue[0]];
  return { ...state, queue, done: false };
}
