// @ts-check
// When the "Update ready" affordance may appear. Pure, so the rule is unit-tested.

/**
 * A waiting update must not interrupt a Question the learner has not answered yet. Cards, feedback,
 * the shelf and the overview are all fine moments.
 * @param {"shelf"|"overview"|"learn"} surface
 * @param {any} flow  The learner's flow while on the learning surface, or null
 * @returns {boolean}
 */
export function canInterrupt(surface, flow) {
  if (surface !== "learn" || !flow) return true;
  if (flow.screen !== "question") return true;
  return flow.feedback !== null && flow.feedback !== undefined;
}
