// @ts-check
// Background reconciliation of immutable events with the account's server streams. IndexedDB stays
// authoritative for this device: an event is written locally and queued in the outbox first, the UI
// updates, and only then does a cycle here upload it. A cycle drains the outbox in bounded batches
// with idempotent retries, then pulls the server's events by opaque cursor, unions them by ID and
// asks the session to replay the shared reducers. Nothing here touches the DOM or IndexedDB directly;
// the repository, the transport and the timers are passed in so every rule is unit-tested under Deno.

/** Events per upload. Small enough that a retry after a lost response re-sends little. */
export const BATCH_SIZE = 50;
/** How long after a render a cycle waits, so the checkpoint that follows an event joins its batch. */
export const KICK_DELAY_MS = 150;
/** Retry backoff: 1s, 2s, 4s ... capped, with a little jitter so two devices do not retry in step. */
export const RETRY_BASE_MS = 1000;
export const RETRY_MAX_MS = 60_000;

const STORES = ["learning_events", "navigation_events"];

/**
 * @typedef {"hidden"|"local"|"syncing"|"synced"|"failed"} SyncStatus
 * `hidden`: a guest, nothing to show. `local`: Saved on this device. `syncing`: a cycle is running.
 * `synced`: the outbox is empty and the last pull succeeded. `failed`: the server refused or erred.
 */

/**
 * @typedef {object} SyncState
 * @property {SyncStatus} status
 * @property {import("./transport.js").StreamState|null} remote  The server's newer epoch, when it refused ours as stale
 * @property {string|null} message
 * @property {number} outbox  Events still awaiting upload
 */

/** @typedef {{ lessonId: string, lessonRevisionId: string, epoch: number }} Scope */

/**
 * The slice of the storage repository a cycle needs. `localRepository` satisfies it; tests pass a map.
 * @typedef {object} SyncStore
 * @property {() => Promise<import("../storage/repository.js").OutboxEntry[]>} outbox
 * @property {(ids: string[]) => Promise<void>} acknowledge
 * @property {(store: string) => Promise<any[]>} events
 * @property {(store: string, events: any[]) => Promise<void>} appendRemote
 * @property {(key: string) => Promise<string>} cursor
 * @property {(key: string, cursor: string) => Promise<void>} saveCursor
 * @property {(stream: import("../storage/repository.js").ProgressStream) => Promise<void>} saveStream
 */

/**
 * @typedef {object} Timers
 * @property {(work: () => void, delay: number) => unknown} set
 * @property {(handle: unknown) => void} clear
 */

/**
 * @param {object} options
 * @param {SyncStore} options.repository
 * @param {import("./transport.js").Transport} options.transport
 * @param {(state: SyncState) => void} options.onStatus
 * @param {Timers} [options.timers]
 * @param {() => number} [options.random]
 */
export function createSyncClient(
  {
    repository,
    transport,
    onStatus,
    timers = {
      set: (work, delay) => setTimeout(work, delay),
      clear: (handle) => clearTimeout(/** @type {number} */ (handle)),
    },
    random = Math.random,
  },
) {
  let enabled = false;
  /** @type {Scope|null} */
  let scope = null;
  /** @type {(() => Promise<void>)|null} */
  let onMerged = null;
  let busy = false;
  let pending = false;
  let attempt = 0;
  /** @type {unknown} */
  let kickTimer = null;
  /** @type {unknown} */
  let retryTimer = null;
  /** @type {SyncState} */
  let state = { status: "hidden", remote: null, message: null, outbox: 0 };

  /** @param {Partial<SyncState>} next */
  function setState(next) {
    state = { ...state, ...next };
    onStatus(state);
  }

  function clearTimers() {
    if (kickTimer !== null) timers.clear(kickTimer);
    if (retryTimer !== null) timers.clear(retryTimer);
    kickTimer = null;
    retryTimer = null;
  }

  function scheduleRetry() {
    if (retryTimer !== null) timers.clear(retryTimer);
    attempt += 1;
    const base = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
    const jitter = base * 0.2 * (random() - 0.5);
    retryTimer = timers.set(() => {
      retryTimer = null;
      flush();
    }, Math.round(base + jitter));
  }

  /** @param {string} store */
  const cursorKey = (store) =>
    `${store}:${scope?.lessonRevisionId}:${scope?.epoch}`;

  /**
   * Upload every outbox entry, grouped by stream, revision and epoch, in bounded batches. `failure`
   * is transient (no network, server error) and worth a retry; `refused` is permanent and is not.
   * @returns {Promise<{ failure: import("./transport.js").Failure|null, refused: import("./transport.js").Failure|null, stale: boolean }>}
   */
  async function drainOutbox() {
    const entries = await repository.outbox();
    if (!entries.length) return { failure: null, refused: null, stale: false };
    setState({ status: "syncing", outbox: entries.length });
    /** @type {Map<string, typeof entries>} */
    const groups = new Map();
    for (const entry of entries) {
      const key = `${entry.store}|${entry.event.lessonRevisionId}|${
        entry.event.epoch ?? 0
      }`;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    /** @type {import("./transport.js").Failure|null} */
    let refused = null;
    let stale = false;
    for (const group of groups.values()) {
      const { store, event } = group[0];
      const groupScope = {
        lessonRevisionId: String(event.lessonRevisionId),
        epoch: Number(event.epoch ?? 0),
      };
      for (let start = 0; start < group.length; start += BATCH_SIZE) {
        const batch = group.slice(start, start + BATCH_SIZE);
        const result = await transport.push(
          store,
          groupScope,
          batch.map((entry) => entry.event),
        );
        if (result.ok) {
          // Acknowledged: the server holds these. A response lost before this line leaves them in the
          // outbox, and the next cycle re-sends them; the server counts them as duplicates.
          await repository.acknowledge(batch.map((entry) => entry.id));
          continue;
        }
        if (result.status === 0 || result.status >= 500) {
          return { failure: result, refused, stale };
        }
        if (result.status === 401) {
          setEnabled(false);
          return { failure: null, refused, stale };
        }
        // The server will never take these: a discarded epoch, an unknown revision or a malformed event.
        // They stay in their local store; only the upload is given up.
        await repository.acknowledge(batch.map((entry) => entry.id));
        if (result.code === "epoch.stale") {
          if (scope && result.stream?.lessonId === scope.lessonId) {
            stale = true;
            setState({ remote: result.stream });
          }
          break;
        }
        refused = refused ?? result;
        break;
      }
    }
    return { failure: null, refused, stale };
  }

  /**
   * Pull every new event for the attached lesson, page by page, union by ID.
   * @returns {Promise<{ failure: import("./transport.js").Failure|null, stale: boolean, merged: number }>}
   */
  async function pullScope() {
    if (!scope) return { failure: null, stale: false, merged: 0 };
    const current = scope;
    let merged = 0;
    for (const store of STORES) {
      const known = new Set(
        (await repository.events(store)).map((event) => event.id),
      );
      let cursor = await repository.cursor(cursorKey(store));
      for (let pages = 0; pages < 1000; pages += 1) {
        const page = await transport.pull(store, current, cursor);
        if (!page.ok) {
          if (page.code === "epoch.stale") {
            setState({ remote: page.stream });
            return { failure: null, stale: true, merged };
          }
          if (page.status === 401) {
            setEnabled(false);
            return { failure: null, stale: false, merged };
          }
          return { failure: page, stale: false, merged };
        }
        const fresh = page.events.filter((event) =>
          typeof event?.id === "string" && !known.has(event.id)
        );
        for (const event of fresh) known.add(event.id);
        await repository.appendRemote(store, fresh);
        merged += fresh.length;
        cursor = page.cursor;
        await repository.saveCursor(cursorKey(store), cursor);
        if (!page.hasMore) break;
      }
    }
    return { failure: null, stale: false, merged };
  }

  /** One full cycle: drain the outbox, then pull. Coalesces cycles requested while one runs. */
  async function flush() {
    if (busy) {
      pending = true;
      return;
    }
    if (!enabled) return;
    busy = true;
    try {
      do {
        pending = false;
        const pushed = await drainOutbox();
        if (!enabled) return;
        let failure = pushed.failure;
        let stale = pushed.stale;
        let merged = 0;
        if (!failure && !stale) {
          if (scope) setState({ status: "syncing" });
          const pulled = await pullScope();
          if (!enabled) return;
          failure = pulled.failure;
          stale = pulled.stale;
          merged = pulled.merged;
        }
        const remaining = (await repository.outbox()).length;
        // Only no network and a server error are worth a retry; any other refusal is permanent.
        if (failure && (failure.status === 0 || failure.status >= 500)) {
          setState({
            status: failure.status === 0 ? "local" : "failed",
            message: failure.message,
            outbox: remaining,
          });
          scheduleRetry();
        } else if (stale) {
          setState({
            status: "failed",
            message: "Progress on this lesson was discarded on another device.",
            outbox: remaining,
          });
        } else if (failure || pushed.refused) {
          attempt = 0;
          setState({
            status: "failed",
            message: (failure ?? pushed.refused)?.message ?? null,
            outbox: remaining,
          });
        } else {
          attempt = 0;
          setState({
            status: remaining ? "local" : "synced",
            message: null,
            remote: null,
            outbox: remaining,
          });
        }
        if (merged && onMerged) await onMerged();
      } while (pending && enabled);
    } finally {
      busy = false;
    }
  }

  /** @param {boolean} value */
  function setEnabled(value) {
    enabled = value;
    if (!enabled) {
      clearTimers();
      setState({ status: "hidden", remote: null, message: null });
    }
  }

  return {
    /** Sign-in state. A guest syncs nothing and sees nothing. @param {boolean} value */
    setEnabled,
    /**
     * The lesson whose streams a cycle pulls, or null between lessons. Pushes always cover the whole
     * outbox. `onMerged` runs after remote events were stored, so the session can replay the reducers.
     * @param {Scope|null} next
     * @param {(() => Promise<void>)|null} [merged]
     */
    attach(next, merged = null) {
      scope = next;
      onMerged = merged;
      if (enabled) {
        setState({
          status: state.status === "hidden" ? "local" : state.status,
          remote: null,
          message: null,
        });
      }
    },
    /**
     * Request a cycle shortly. Called after every render, so an event is in the outbox and on screen
     * before any request leaves. Repeated calls coalesce.
     */
    kick() {
      if (!enabled) return;
      if (state.status === "hidden") setState({ status: "local" });
      if (kickTimer !== null) timers.clear(kickTimer);
      kickTimer = timers.set(() => {
        kickTimer = null;
        flush();
      }, KICK_DELAY_MS);
    },
    /** Run a cycle now; resolves when it has finished. */
    flush,
    /** The network came back or the page became visible: retry now with fresh backoff. */
    wake() {
      attempt = 0;
      if (retryTimer !== null) timers.clear(retryTimer);
      retryTimer = null;
      return flush();
    },
    /**
     * Announce this device's epoch after an explicit discard: an empty push advances the server's
     * stream so an old offline device is refused instead of restoring the discarded progress.
     * @param {Scope} announced
     */
    async announce(announced) {
      if (!enabled) return;
      const result = await transport.push("learning_events", announced, []);
      if (!result.ok && (result.status === 0 || result.status >= 500)) {
        scheduleRetry();
      }
    },
    /**
     * The learner chose to discard local progress and follow the newer epoch the server reported.
     * Only this call moves the local stream; a 409 alone never does.
     * @returns {Promise<import("../storage/repository.js").ProgressStream|null>}
     */
    async adoptRemoteEpoch() {
      const remote = state.remote;
      if (!remote || !scope || remote.lessonId !== scope.lessonId) return null;
      const stream = {
        id: remote.lessonId,
        revisionId: remote.lessonRevisionId,
        epoch: remote.epoch,
      };
      await repository.saveStream(stream);
      setState({ remote: null, message: null, status: "local" });
      return stream;
    },
    /** The current state, for tests and for a first paint. */
    state() {
      return state;
    },
  };
}

/** @typedef {ReturnType<typeof createSyncClient>} SyncClient */
