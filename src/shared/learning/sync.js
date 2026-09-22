// @ts-check
// Cross-device sync rules, pure so the browser and the server reach the same answer from the same
// events. Events are immutable and identified by UUIDv4; a union of two devices' streams is a set
// union by ID. Order is never inferred from an ID: the progress reducer is order-insensitive, and the
// checkpoint is chosen by the evidence it depends on, not by who wrote it last.

/**
 * Union two or more event lists by event ID. The first occurrence of an ID wins, so a device's own
 * copy of an event is kept when the server returns the same event.
 * @template {{ id: string }} T
 * @param {...T[]} lists
 * @returns {T[]}
 */
export function unionById(...lists) {
  /** @type {Map<string, T>} */
  const byId = new Map();
  for (const list of lists) {
    for (const event of list) {
      if (!byId.has(event.id)) byId.set(event.id, event);
    }
  }
  return Array.from(byId.values());
}

/**
 * How much accepted learning evidence a checkpoint depends on: the number of IDs in its
 * `learningEventFrontier` that are present in `accepted`. IDs the union has never seen do not count,
 * so a checkpoint cannot claim evidence nobody else can replay.
 * @param {any} checkpointEvent  A `navigation_checkpointed` event
 * @param {Set<string>} accepted  IDs of the learning events in the union
 */
export function frontierCount(checkpointEvent, accepted) {
  const frontier = checkpointEvent?.checkpoint?.learningEventFrontier;
  if (!Array.isArray(frontier)) return 0;
  let count = 0;
  for (const id of frontier) {
    if (accepted.has(id)) count += 1;
  }
  return count;
}

/**
 * Total order over checkpoint events. Positive when `a` should replace `b`.
 *
 * 1. The larger accepted learning-event frontier wins: a checkpoint that depends on less evidence
 *    never replaces one that depends on more, however late it arrives.
 * 2. Equal frontiers: the later client `occurredAt` wins. This is the only place the client clock is
 *    consulted, and only between checkpoints that saw the same amount of evidence.
 * 3. Equal `occurredAt` too: the greater event ID wins. This is a deterministic last resort so every
 *    device and the server agree; it says nothing about when either event happened.
 * @param {any} a
 * @param {any} b
 * @param {Set<string>} accepted
 */
export function compareCheckpointEvents(a, b, accepted) {
  const byEvidence = frontierCount(a, accepted) - frontierCount(b, accepted);
  if (byEvidence !== 0) return byEvidence;
  const byClock = String(a.occurredAt ?? "").localeCompare(String(b.occurredAt ?? ""));
  if (byClock !== 0) return byClock;
  return String(a.id).localeCompare(String(b.id));
}

/**
 * The canonical resume position for one revision and epoch: the checkpoint event that depends on the
 * most accepted learning evidence, with the tie breaker above. Null when no checkpoint exists.
 * @param {any[]} navigationEvents
 * @param {any[]} learningEvents  The learning events in the union; only their IDs matter
 * @param {string} [type]
 */
export function selectCheckpoint(navigationEvents, learningEvents, type = "navigation_checkpointed") {
  const accepted = new Set(learningEvents.map((event) => event.id));
  let best = null;
  for (const event of navigationEvents) {
    if (event.type !== type) continue;
    if (best === null || compareCheckpointEvents(event, best, accepted) > 0) best = event;
  }
  return best?.checkpoint ?? null;
}

/**
 * The events in `remote` that `local` does not already hold, by ID.
 * @template {{ id: string }} T
 * @param {T[]} local
 * @param {T[]} remote
 * @returns {T[]}
 */
export function missingFrom(local, remote) {
  const known = new Set(local.map((event) => event.id));
  return remote.filter((event) => !known.has(event.id));
}
