// @ts-check

/**
 * Navigation projections are solely derived from immutable checkpoint events. The learning flow
 * and the drill each keep their own checkpoint stream, so the event type names the stream. An
 * event whose `checkpoint` is null ends the run: no resume position remains.
 * @template Checkpoint
 * @param {ReadonlyArray<{ type: string, occurredAt: string, checkpoint?: Checkpoint | null }>} events
 * @param {string} [type]
 * @returns {Checkpoint | null}
 */
export function reduceCheckpoint(events, type = "navigation_checkpointed") {
  const checkpoints = events.filter((event) => event.type === type);
  checkpoints.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return checkpoints.at(-1)?.checkpoint ?? null;
}
