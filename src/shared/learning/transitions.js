// @ts-check
import { shuffled } from "./shuffle.js";

/**
 * Pure next-state rule for a Concept Check feedback action.
 * @param {any} state
 */
export function advanceCheck(state) {
  if (state.correct || state.idk || state.queue.length === 1) {
    return { ...state, queue: [], done: true };
  }
  return { ...state, queue: state.queue.slice(1), done: false };
}

/**
 * Pure Wrap-up rule: missed concepts return after remaining concepts in stable shuffled order.
 * @param {any} state
 */
export function advanceWrapUp(state) {
  if (state.correct) {
    const queue = state.queue.slice(1);
    return { ...state, queue, done: queue.length === 0 };
  }
  const retried = [...state.queue.slice(1), state.queue[0]];
  const queue = shuffled(retried, state.seed + state.queue.length);
  return { ...state, queue, done: false };
}
