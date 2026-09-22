// @ts-check
// When the "Update ready" affordance may appear. Pure, so the rule is unit-tested.

/**
 * A waiting update must not interrupt a Question the learner has not answered yet, in the learning
 * flow or in a drill. Cards, feedback, the shelf and the overview are all fine moments.
 * @param {"shelf"|"overview"|"learn"|"drill"} surface
 * @param {any} flow  The learner's flow on the learning or drill surface, or null
 * @returns {boolean}
 */
export function canInterrupt(surface, flow) {
  if ((surface !== "learn" && surface !== "drill") || !flow) return true;
  if (flow.screen !== "question") return true;
  return flow.feedback !== null && flow.feedback !== undefined;
}
