// @ts-check

/**
 * Navigation projections are solely derived from immutable checkpoint events.
 * @param {any[]} events
 */
export function reduceCheckpoint(events) {
  const checkpoints = events.filter((event) => event.type === "navigation_checkpointed");
  checkpoints.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return checkpoints.at(-1)?.checkpoint ?? null;
}
