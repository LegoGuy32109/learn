// @ts-check
import { shuffled } from "./shuffle.js";
/** Pure next-state rule for a Concept Check feedback action. @param {any} state */
export function advanceCheck(state) {
  if (state.correct || state.idk || state.queue.length === 1) return { ...state, queue: [], done: true };
  return { ...state, queue: state.queue.slice(1), done: false };
}
/** Pure Wrap-up rule: missed concepts return after remaining concepts in stable shuffled order. @param {any} state */
export function advanceWrapUp(state) {
  if (state.correct) { const queue=state.queue.slice(1); return {...state,queue,done:queue.length===0}; }
  return {...state,queue:shuffled([...state.queue.slice(1),state.queue[0]],state.seed+state.queue.length),done:false};
}
