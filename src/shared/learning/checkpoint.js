// @ts-check
/** Navigation projections are solely derived from immutable checkpoint events. @param {any[]} events */
export function reduceCheckpoint(events) { return events.filter((e) => e.type === "navigation_checkpointed").sort((a,b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1)?.checkpoint ?? null; }
