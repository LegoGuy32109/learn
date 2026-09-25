// The sync client's rules with an in-memory repository and a scripted transport: an event is in the
// outbox before the UI runs and no request leaves before a render; uploads are bounded, retried with
// backoff and idempotent; a lost response after acceptance duplicates nothing; pulls union by id and
// hand the reducers the union; a 409 never moves the local stream, only the explicit adoption does;
// and every request failing leaves every event in the outbox with a sensible state.
import type { RecordedEvent } from "../../src/client/learning/session.js";
import { assert, assertEquals } from "@std/assert";
import {
  BATCH_SIZE,
  createSyncClient,
  KICK_DELAY_MS,
  RETRY_BASE_MS,
  type SyncState,
} from "../../src/client/sync/client.js";
import type { Transport } from "../../src/client/sync/transport.js";
import type {
  OutboxEntry,
  ProgressStream,
} from "../../src/client/storage/repository.js";

const REVISION = "0b7e5b4e-8c2d-4f1a-b3e6-1d9a7c5e2f33";
const LESSON = "6f1c1c2a-3b1e-4b6f-9a1c-2f6d8e4b7a10";
const SCOPE = { lessonId: LESSON, lessonRevisionId: REVISION, epoch: 0 };

/** An event as the sync layer handles it: the recorded envelope, otherwise opaque. */
type Synced = RecordedEvent;

/** The IndexedDB repository's sync surface over plain maps, with the same semantics. */
function memoryRepository() {
  const stores: Record<string, Map<string, Synced>> = {
    learning_events: new Map(),
    navigation_events: new Map(),
  };
  const outbox = new Map<string, OutboxEntry>();
  const cursors = new Map<string, string>();
  const streams = new Map<string, ProgressStream>();
  let clock = 0;
  const log: string[] = [];
  return {
    log,
    streams,
    stores,
    appendOutgoing(store: string, event: Synced) {
      log.push(`store:${event.id}`);
      stores[store].set(event.id, event);
      clock += 1;
      outbox.set(event.id, {
        id: event.id,
        store,
        event,
        queuedAt: String(clock).padStart(6, "0"),
      });
      return Promise.resolve();
    },
    appendRemote(store: string, events: Synced[]) {
      for (const event of events) {
        if (!stores[store].has(event.id)) stores[store].set(event.id, event);
      }
      return Promise.resolve();
    },
    events(store: string) {
      return Promise.resolve(Array.from(stores[store].values()));
    },
    outbox() {
      return Promise.resolve(
        Array.from(outbox.values()).sort((a, b) =>
          a.queuedAt.localeCompare(b.queuedAt)
        ),
      );
    },
    acknowledge(ids: string[]) {
      for (const id of ids) outbox.delete(id);
      return Promise.resolve();
    },
    cursor(key: string) {
      return Promise.resolve(cursors.get(key) ?? "");
    },
    saveCursor(key: string, cursor: string) {
      cursors.set(key, cursor);
      return Promise.resolve();
    },
    saveStream(stream: ProgressStream) {
      streams.set(stream.id, stream);
      return Promise.resolve();
    },
  };
}

/** Timers under test control: nothing fires until `run` advances the clock. */
function fakeTimers() {
  let now = 0;
  let nextHandle = 1;
  const scheduled = new Map<number, { at: number; work: () => void }>();
  return {
    set(work: () => void, delay: number) {
      const handle = nextHandle++;
      scheduled.set(handle, { at: now + delay, work });
      return handle;
    },
    clear(handle: unknown) {
      scheduled.delete(handle as number);
    },
    /** Fire everything due within `ms`, in order, letting each cycle settle. */
    async run(ms: number) {
      const until = now + ms;
      while (true) {
        const due = Array.from(scheduled.entries()).filter(([, entry]) =>
          entry.at <= until
        ).sort((a, b) =>
          a[1].at - b[1].at
        )[0];
        if (!due) break;
        now = due[1].at;
        scheduled.delete(due[0]);
        due[1].work();
        await settle();
      }
      now = until;
    },
    pending() {
      return Array.from(scheduled.values()).map((entry) => entry.at - now);
    },
  };
}

async function settle() {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** A server double: stores by id per scope, hands out pages by arrival order, and can be told to fail. */
function fakeServer() {
  const stored: Record<string, Map<string, Synced>> = {
    learning_events: new Map(),
    navigation_events: new Map(),
  };
  const arrival: Record<string, Synced[]> = {
    learning_events: [],
    navigation_events: [],
  };
  const calls: string[] = [];
  let epoch = 0;
  /** @type {null | { status: number, code?: string, loseResponse?: boolean }} */
  let failing:
    | { status: number; code?: string; loseResponse?: boolean }
    | null = null;
  let pageSize = 1000;
  const transport: Transport = {
    push(store, scope, events) {
      calls.push(`push:${store}:${events.length}`);
      if (failing && !failing.loseResponse) {
        return Promise.resolve({
          ok: false,
          status: failing.status,
          code: failing.code ?? "http",
          message: "nope",
          stream: failing.code === "epoch.stale"
            ? { lessonId: LESSON, lessonRevisionId: "newer-revision", epoch }
            : null,
        });
      }
      if (scope.epoch < epoch) {
        return Promise.resolve({
          ok: false,
          status: 409,
          code: "epoch.stale",
          message: "stale",
          stream: {
            lessonId: LESSON,
            lessonRevisionId: "newer-revision",
            epoch,
          },
        });
      }
      let accepted = 0;
      for (const event of events) {
        if (stored[store].has(event.id)) continue;
        stored[store].set(event.id, event);
        arrival[store].push(event);
        accepted += 1;
      }
      if (failing?.loseResponse) {
        return Promise.resolve({
          ok: false,
          status: 0,
          code: "network",
          message: "lost",
          stream: null,
        });
      }
      return Promise.resolve({
        ok: true,
        accepted,
        duplicates: events.length - accepted,
        stream: { lessonId: LESSON, lessonRevisionId: REVISION, epoch },
      });
    },
    pull(store, scope, cursor) {
      calls.push(`pull:${store}:${cursor || "start"}`);
      if (failing) {
        return Promise.resolve({
          ok: false,
          status: failing.status,
          code: failing.code ?? "http",
          message: "nope",
          stream: null,
        });
      }
      if (scope.epoch < epoch) {
        return Promise.resolve({
          ok: false,
          status: 409,
          code: "epoch.stale",
          message: "stale",
          stream: {
            lessonId: LESSON,
            lessonRevisionId: "newer-revision",
            epoch,
          },
        });
      }
      const after = cursor ? Number(atob(cursor)) : 0;
      const slice = arrival[store].slice(after, after + pageSize);
      const next = after + slice.length;
      return Promise.resolve({
        ok: true,
        events: slice,
        cursor: btoa(String(next)),
        hasMore: next < arrival[store].length,
        stream: { lessonId: LESSON, lessonRevisionId: REVISION, epoch },
      });
    },
  };
  return {
    transport,
    calls,
    stored,
    arrival,
    fail(value: typeof failing) {
      failing = value;
    },
    discardTo(newEpoch: number) {
      epoch = newEpoch;
    },
    pageSize(size: number) {
      pageSize = size;
    },
  };
}

function event(type: string, extra: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    lessonRevisionId: REVISION,
    epoch: 0,
    occurredAt: new Date().toISOString(),
    ...extra,
  };
}

function harness() {
  const repository = memoryRepository();
  const server = fakeServer();
  const timers = fakeTimers();
  const states: SyncState[] = [];
  const client = createSyncClient({
    repository,
    transport: server.transport,
    onStatus: (state) => states.push(state),
    timers,
    random: () => 0.5,
  });
  const statuses = () => states.map((state) => state.status);
  return { repository, server, timers, client, states, statuses };
}

Deno.test("the retry delay doubles from one second and caps at one minute", async () => {
  const h = harness();
  h.client.setEnabled(true);
  h.client.attach(SCOPE);
  h.server.fail({ status: 503 });
  await h.repository.appendOutgoing("learning_events", event("lesson_started"));
  await h.client.flush();
  const delays: number[] = [];
  for (let i = 0; i < 8; i++) {
    const [next] = h.timers.pending();
    delays.push(next);
    await h.timers.run(next);
  }
  assertEquals(
    delays,
    [1, 2, 4, 8, 16, 32, 60, 60].map((seconds) => seconds * RETRY_BASE_MS),
  );
});

Deno.test("an event enters the outbox before the UI is told, and no request leaves before a render kicks the client", async () => {
  const h = harness();
  h.client.setEnabled(true);
  let merged = 0;
  h.client.attach(SCOPE, () => Promise.resolve(void merged++));
  // The session's write path: store plus outbox in one step, then the UI hook, then the render kicks.
  const made = event("lesson_started");
  await h.repository.appendOutgoing("learning_events", made);
  assertEquals((await h.repository.outbox()).map((entry) => entry.id), [
    made.id,
  ]);
  assertEquals(h.server.calls, [], "nothing left before the render");
  h.client.kick();
  assertEquals(h.server.calls, [], "kick only schedules");
  await h.timers.run(KICK_DELAY_MS - 1);
  assertEquals(h.server.calls, []);
  await h.timers.run(1);
  assertEquals(h.server.calls.slice(0, 1), ["push:learning_events:1"]);
  assertEquals((await h.repository.outbox()).length, 0);
  assertEquals(h.statuses().at(-1), "synced");
  assertEquals(merged, 0, "our own events coming back are not a merge");
});

Deno.test("uploads are bounded batches per stream and epoch; repeated kicks coalesce into one cycle", async () => {
  const h = harness();
  h.client.setEnabled(true);
  h.client.attach(SCOPE);
  for (let i = 0; i < BATCH_SIZE * 2 + 3; i++) {
    await h.repository.appendOutgoing(
      "learning_events",
      event("lesson_started"),
    );
  }
  for (let i = 0; i < 2; i++) {
    await h.repository.appendOutgoing(
      "navigation_events",
      event("navigation_checkpointed", { checkpoint: null }),
    );
  }
  h.client.kick();
  h.client.kick();
  h.client.kick();
  await h.timers.run(KICK_DELAY_MS * 3);
  const pushes = h.server.calls.filter((call) => call.startsWith("push:"));
  assertEquals(pushes, [
    `push:learning_events:${BATCH_SIZE}`,
    `push:learning_events:${BATCH_SIZE}`,
    "push:learning_events:3",
    "push:navigation_events:2",
  ]);
  assertEquals(h.server.stored.learning_events.size, BATCH_SIZE * 2 + 3);
  assertEquals((await h.repository.outbox()).length, 0);
});

Deno.test("a response lost after the server accepted a batch is retried with backoff and duplicates nothing", async () => {
  const h = harness();
  h.client.setEnabled(true);
  h.client.attach(SCOPE);
  const events = [event("lesson_started"), event("card_seen", { cardId: "c" })];
  for (const made of events) {
    await h.repository.appendOutgoing("learning_events", made);
  }
  h.server.fail({ status: 0, loseResponse: true });
  await h.client.flush();
  assertEquals(
    h.server.stored.learning_events.size,
    2,
    "the server accepted the batch",
  );
  assertEquals(
    (await h.repository.outbox()).length,
    2,
    "the client never learned that, so the events stay queued",
  );
  assertEquals(
    h.statuses().at(-1),
    "local",
    "an unreachable network reads as Saved on this device",
  );
  assertEquals(h.timers.pending(), [RETRY_BASE_MS]);
  h.server.fail(null);
  await h.timers.run(RETRY_BASE_MS);
  assertEquals(
    h.server.calls.filter((call) => call.startsWith("push:")).length,
    2,
  );
  assertEquals(
    h.server.stored.learning_events.size,
    2,
    "the retry stored nothing twice",
  );
  assertEquals((await h.repository.outbox()).length, 0);
  assertEquals(h.statuses().at(-1), "synced");
  // Local stores hold each event once too: the pull returned our own events and they were not re-added.
  assertEquals((await h.repository.events("learning_events")).length, 2);
});

Deno.test("with every request failing, learning continues, every event stays in the outbox, and backoff grows and caps", async () => {
  const h = harness();
  h.client.setEnabled(true);
  h.client.attach(SCOPE);
  h.server.fail({ status: 503 });
  for (let i = 0; i < 5; i++) {
    await h.repository.appendOutgoing(
      "learning_events",
      event("card_seen", { cardId: `c${i}` }),
    );
    h.client.kick();
    await h.timers.run(KICK_DELAY_MS);
  }
  assertEquals((await h.repository.outbox()).length, 5);
  assertEquals(
    (await h.repository.events("learning_events")).length,
    5,
    "the local store is authoritative and complete",
  );
  assertEquals(h.statuses().at(-1), "failed");
  // Five failed cycles already happened, one per kick, so the backoff is at its fifth step.
  const delays: number[] = [];
  for (let i = 0; i < 6; i++) {
    const [next] = h.timers.pending();
    delays.push(next);
    await h.timers.run(next);
  }
  assertEquals(
    delays,
    [16, 32, 60, 60, 60, 60].map((seconds) => seconds * RETRY_BASE_MS),
  );
  assertEquals(
    (await h.repository.outbox()).length,
    5,
    "still queued after every failure",
  );
  h.server.fail({ status: 0 });
  await h.timers.run(h.timers.pending()[0]);
  assertEquals(
    h.statuses().at(-1),
    "local",
    "offline after a server error reads as Saved on this device",
  );
  h.server.fail(null);
  await h.client.wake();
  assertEquals((await h.repository.outbox()).length, 0);
  assertEquals(h.statuses().at(-1), "synced");
});

Deno.test("the four states follow the network: local, syncing, synced, failed", async () => {
  const h = harness();
  h.client.setEnabled(true);
  h.client.attach(SCOPE);
  assertEquals(h.statuses().at(-1), "local");
  await h.repository.appendOutgoing("learning_events", event("lesson_started"));
  h.client.kick();
  await h.timers.run(KICK_DELAY_MS);
  assert(h.statuses().includes("syncing"));
  assertEquals(h.statuses().at(-1), "synced");
  h.server.fail({ status: 500 });
  await h.repository.appendOutgoing("learning_events", event("lesson_started"));
  await h.client.flush();
  assertEquals(h.statuses().at(-1), "failed");
  h.server.fail({ status: 0 });
  await h.client.flush();
  assertEquals(h.statuses().at(-1), "local");
  h.client.setEnabled(false);
  assertEquals(h.statuses().at(-1), "hidden");
  await h.client.flush();
  assertEquals(
    h.server.calls.filter((call) => call.startsWith("push:")).length,
    3,
    "a guest sends nothing",
  );
});

Deno.test("pull merges by id across pages, never by id order, and hands the reducers the union once", async () => {
  const h = harness();
  h.client.setEnabled(true);
  const merges: number[] = [];
  h.client.attach(
    SCOPE,
    async () =>
      void merges.push((await h.repository.events("learning_events")).length),
  );
  // Another device pushed five events whose ids sort opposite to their arrival.
  const remote = ["f", "e", "d", "c", "b"].map((letter, index) => ({
    ...event("card_seen", { cardId: `card-${index}` }),
    id: `${letter}0000000-0000-4000-8000-000000000000`,
  }));
  for (const made of remote) {
    await h.server.transport.push("learning_events", SCOPE, [made]);
  }
  const mine = {
    ...event("lesson_started"),
    id: "a0000000-0000-4000-8000-000000000000",
  };
  await h.repository.appendOutgoing("learning_events", mine);
  h.server.pageSize(2);
  await h.client.flush();
  const local = await h.repository.events("learning_events");
  assertEquals(local.length, 6);
  assertEquals(
    new Set(local.map((made) => made.id)),
    new Set([mine.id, ...remote.map((made) => made.id)]),
  );
  assertEquals(
    merges,
    [6],
    "one merge after the whole pull, with the full union",
  );
  const pulls = h.server.calls.filter((call) =>
    call.startsWith("pull:learning_events")
  );
  assert(pulls.length >= 3, `paged: ${pulls.join(", ")}`);
  // A second cycle starts from the saved cursor and pulls nothing new.
  await h.client.flush();
  assertEquals(merges, [6]);
  assertEquals((await h.repository.events("learning_events")).length, 6);
  // A later remote event arrives after the cursor.
  const late = event("card_seen", { cardId: "late" });
  await h.server.transport.push("learning_events", SCOPE, [late]);
  await h.client.flush();
  assertEquals(merges, [6, 7]);
});

Deno.test("a newer epoch on the server is reported, never applied on its own, and applied only by the explicit discard", async () => {
  const h = harness();
  h.client.setEnabled(true);
  h.client.attach(SCOPE);
  await h.repository.appendOutgoing("learning_events", event("lesson_started"));
  await h.client.flush();
  assertEquals(h.statuses().at(-1), "synced");
  // Another device discarded: the server stream is now at epoch 1.
  h.server.discardTo(1);
  await h.repository.appendOutgoing(
    "learning_events",
    event("card_seen", { cardId: "c" }),
  );
  await h.client.flush();
  const state = h.states.at(-1)!;
  assertEquals(state.status, "failed");
  assertEquals(state.remote, {
    lessonId: LESSON,
    lessonRevisionId: "newer-revision",
    epoch: 1,
  });
  assertEquals(h.repository.streams.size, 0, "the local stream did not move");
  assertEquals(
    (await h.repository.events("learning_events")).length,
    2,
    "local evidence is kept",
  );
  assertEquals(
    (await h.repository.outbox()).length,
    0,
    "the refused event is no longer retried",
  );
  assertEquals(
    h.timers.pending(),
    [],
    "no retry: only the learner can resolve this",
  );
  const adopted = await h.client.adoptRemoteEpoch();
  assertEquals(adopted, { id: LESSON, revisionId: "newer-revision", epoch: 1 });
  assertEquals(h.repository.streams.get(LESSON), adopted);
  assertEquals(h.states.at(-1)!.remote, null);
});

Deno.test("permanent refusals drop the batch from the outbox and read as failed; a 401 turns the client off", async () => {
  const h = harness();
  h.client.setEnabled(true);
  h.client.attach(SCOPE);
  await h.repository.appendOutgoing("learning_events", event("lesson_started"));
  h.server.fail({ status: 422, code: "events.rejected" });
  await h.client.flush();
  assertEquals((await h.repository.outbox()).length, 0);
  assertEquals(h.statuses().at(-1), "failed");
  assertEquals(h.timers.pending(), [], "a 422 is not retried");
  h.server.fail({ status: 401 });
  await h.repository.appendOutgoing("learning_events", event("lesson_started"));
  await h.client.flush();
  assertEquals(h.statuses().at(-1), "hidden");
  assertEquals(
    (await h.repository.outbox()).length,
    1,
    "a guest's events wait for the next sign-in",
  );
});

Deno.test("announce pushes an empty batch for the new epoch so the server stream advances", async () => {
  const h = harness();
  h.client.setEnabled(true);
  await h.client.announce({ ...SCOPE, epoch: 3 });
  assertEquals(h.server.calls, ["push:learning_events:0"]);
});
