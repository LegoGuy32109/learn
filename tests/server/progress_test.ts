// Progress sync routes against the database-free application: idempotent push, order-insensitive
// projection, epoch rejection, short-answer round trip, revision and Question validation, opaque
// cursor paging, and frontier-first checkpoint selection with its tie breaker. Cookie or bearer.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import fixture from "../../fixtures/lessons/browser-http-cache.json" with {
  type: "json",
};
import { reduceProgress } from "../../src/shared/learning/progress.js";
import { selectCheckpoint } from "../../src/shared/learning/sync.js";
import {
  createApp,
  FIXTURE_ACCOUNT,
  fixtureDependencies,
} from "../../src/app.ts";
import { MAX_BATCH_EVENTS } from "../../src/server/progress/validation.ts";
import { stubAuthenticator } from "../support/stub-auth.ts";

const ORIGIN = "http://localhost";
const OWNER = "owner-token";
const READER_ONLY = "reader-token";
const WRITER_ONLY = "writer-token";
const OTHER = "other-account-token";
const REVISION = fixture.revisionId;
const lesson = fixture as any;

type Event = Record<string, unknown> & { id: string };

let clock = Date.parse("2026-09-22T10:00:00Z");
function at(offsetSeconds = 0): string {
  return new Date(clock + offsetSeconds * 1000).toISOString();
}

function event(
  type: string,
  data: Record<string, unknown> = {},
  epoch = 0,
): Event {
  clock += 1000;
  return {
    id: crypto.randomUUID(),
    type,
    lessonRevisionId: REVISION,
    epoch,
    occurredAt: at(),
    ...data,
  };
}

function correctAnswer(question: any): string {
  return question.type === "mcq" ? question.key : String(question.answer);
}

function answered(
  question: any,
  answer: unknown,
  correct: boolean,
  flowKind = "check",
  epoch = 0,
): Event {
  return event("question_answered", {
    flowKind,
    conceptId: question.conceptId,
    poolId: question.poolId,
    questionId: question.id,
    attemptId: "attempt-1",
    answer,
    correct,
  }, epoch);
}

function checkpointed(
  frontier: string[],
  marker: string,
  occurredAt?: string,
  id?: string,
): Event {
  const made = event("navigation_checkpointed", {
    checkpoint: {
      screen: "card",
      conceptIndex: 0,
      cardIndex: 0,
      flowKind: "cards",
      seed: 0,
      attemptId: "",
      queue: [],
      feedback: null,
      detour: null,
      marker,
      learningEventFrontier: frontier,
    },
  });
  if (occurredAt) made.occurredAt = occurredAt;
  if (id) made.id = id;
  return made;
}

async function harness() {
  const dependencies = {
    ...await fixtureDependencies(),
    auth: stubAuthenticator({
      [OWNER]: {
        accountId: FIXTURE_ACCOUNT.id,
        scopes: ["lessons:read", "lessons:write"],
      },
      [READER_ONLY]: {
        accountId: FIXTURE_ACCOUNT.id,
        scopes: ["lessons:read"],
      },
      [WRITER_ONLY]: {
        accountId: FIXTURE_ACCOUNT.id,
        scopes: ["lessons:write"],
      },
      [OTHER]: {
        accountId: "someone-else",
        scopes: ["lessons:read", "lessons:write"],
      },
    }),
  };
  const app = createApp(dependencies);
  const call = (path: string, init: RequestInit = {}) =>
    app(new Request(`${ORIGIN}${path}`, init));
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const setCookie = await dependencies.sessions.issue(new Request(ORIGIN), {
    accountId: FIXTURE_ACCOUNT.id,
    displayName: "Josh",
  });
  const cookie = { cookie: setCookie.split(";")[0] };
  const push = (
    stream: string,
    events: unknown,
    headers: Record<string, string> = cookie,
    epoch = 0,
    revision: unknown = REVISION,
  ) =>
    call(`/api/v1/progress/${stream}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ lessonRevisionId: revision, epoch, events }),
    });
  const pull = async (
    stream: string,
    query = "",
    headers: Record<string, string> = cookie,
  ) => {
    const response = await call(
      `/api/v1/progress/${stream}?revision=${REVISION}&epoch=0${query}`,
      { headers },
    );
    return { status: response.status, body: await response.json() };
  };
  const pullAll = async (
    stream: string,
    headers: Record<string, string> = cookie,
    limit = 100,
  ) => {
    const events: Event[] = [];
    let cursor = "";
    for (let pages = 0; pages < 50; pages++) {
      const page = await pull(
        stream,
        `&limit=${limit}&cursor=${cursor}`,
        headers,
      );
      assertEquals(page.status, 200, JSON.stringify(page.body));
      events.push(...page.body.events);
      cursor = page.body.cursor;
      if (!page.body.hasMore) break;
    }
    return events;
  };
  const checkpoint = async (headers: Record<string, string> = cookie) =>
    (await call(`/api/v1/progress/checkpoint?revision=${REVISION}&epoch=0`, {
      headers,
    })).json();
  return { app, call, bearer, cookie, push, pull, pullAll, checkpoint };
}

Deno.test("progress routes need an account: 401 for nobody, 403 without the scope, cookie and bearer both work", async () => {
  const h = await harness();
  const anonymous = await h.push("learning-events", []);
  await anonymous.body?.cancel();
  assertEquals((await h.push("learning-events", [], {})).status, 401);
  assertEquals(
    (await h.push("learning-events", [], h.bearer(READER_ONLY))).status,
    403,
  );
  assertEquals(
    (await h.push("learning-events", [], h.bearer(WRITER_ONLY))).status,
    200,
  );
  assertEquals((await h.pull("learning-events", "", {})).status, 401);
  assertEquals(
    (await h.pull("learning-events", "", h.bearer(WRITER_ONLY))).status,
    403,
  );
  assertEquals(
    (await h.pull("learning-events", "", h.bearer(READER_ONLY))).status,
    200,
  );
  assertEquals((await h.pull("learning-events")).status, 200);
  const foreign = await h.push("learning-events", [], {
    ...h.cookie,
    origin: "https://evil.example",
  });
  assertEquals(foreign.status, 403);
  await foreign.body?.cancel();
});

Deno.test("repeated upload of the same events is accepted once and returns success each time", async () => {
  const h = await harness();
  const card = lesson.concepts[0].cards[0];
  const events = [
    event("lesson_started"),
    event("card_seen", { cardId: card.id, conceptId: lesson.concepts[0].id }),
  ];
  const first = await h.push("learning-events", events);
  assertEquals(first.status, 200);
  assertEquals(await first.json(), {
    accepted: 2,
    duplicates: 0,
    stream: {
      lessonId: fixture.lessonId,
      lessonRevisionId: REVISION,
      epoch: 0,
    },
  });
  const again = await h.push("learning-events", events);
  assertEquals(again.status, 200);
  assertEquals((await again.json()).duplicates, 2);
  const partial = await h.push("learning-events", [
    events[1],
    event("card_seen", {
      cardId: lesson.concepts[0].cards[1].id,
      conceptId: lesson.concepts[0].id,
    }),
  ]);
  assertEquals(
    await partial.json().then((body) => [body.accepted, body.duplicates]),
    [1, 1],
  );
  const stored = await h.pullAll("learning-events");
  assertEquals(stored.length, 3);
  assertEquals(new Set(stored.map((stored) => stored.id)).size, 3);
});

Deno.test("events arriving out of order produce the same progress and checkpoint as in order", async () => {
  const h = await harness();
  const concept = lesson.concepts[0];
  const cards = concept.cards.map((card: any) =>
    event("card_seen", { cardId: card.id, conceptId: concept.id })
  );
  const wrapUp = answered(
    lesson.questions.find((question: any) =>
      question.conceptId === concept.id && question.reserved
    ),
    correctAnswer(
      lesson.questions.find((question: any) =>
        question.conceptId === concept.id && question.reserved
      ),
    ),
    true,
    "wrap_up",
  );
  const learningEvents = [event("lesson_started"), ...cards, wrapUp];
  const early = checkpointed(
    learningEvents.slice(0, 2).map((made) => made.id),
    "early",
  );
  const late = checkpointed(learningEvents.map((made) => made.id), "late");
  // The owner account receives everything in order; another account receives it reversed, in pieces.
  assertEquals((await h.push("learning-events", learningEvents)).status, 200);
  assertEquals((await h.push("navigation-events", [early, late])).status, 200);
  assertEquals(
    (await h.push("navigation-events", [late], h.bearer(OTHER))).status,
    200,
  );
  assertEquals(
    (await h.push(
      "learning-events",
      [...learningEvents].reverse().slice(0, 3),
      h.bearer(OTHER),
    )).status,
    200,
  );
  assertEquals(
    (await h.push(
      "learning-events",
      [...learningEvents].reverse().slice(3),
      h.bearer(OTHER),
    )).status,
    200,
  );
  assertEquals(
    (await h.push("navigation-events", [early], h.bearer(OTHER))).status,
    200,
  );
  const ordered = await h.pullAll("learning-events");
  const reversed = await h.pullAll("learning-events", h.bearer(OTHER));
  assertEquals(
    new Set(ordered.map((made) => made.id)),
    new Set(reversed.map((made) => made.id)),
  );
  const a = reduceProgress(lesson, ordered);
  const b = reduceProgress(lesson, reversed);
  assertEquals([a.state, [...a.cardsSeen].sort(), [...a.learnedConcepts]], [
    b.state,
    [...b.cardsSeen].sort(),
    [...b.learnedConcepts],
  ]);
  assertEquals(a.conceptStates[0], {
    id: concept.id,
    seen: true,
    learned: true,
  });
  assertEquals((await h.checkpoint()).checkpoint.marker, "late");
  assertEquals((await h.checkpoint(h.bearer(OTHER))).checkpoint.marker, "late");
});

Deno.test("events from an epoch older than the stream's current epoch are rejected with a structured error, on push and on pull", async () => {
  const h = await harness();
  assertEquals(
    (await h.push("learning-events", [event("lesson_started")])).status,
    200,
  );
  const advanced = await h.push(
    "learning-events",
    [event("lesson_started", {}, 2)],
    h.cookie,
    2,
  );
  assertEquals((await advanced.json()).stream.epoch, 2);
  const stale = await h.push("learning-events", [event("lesson_started")]);
  assertEquals(stale.status, 409);
  assertEquals(
    stale.headers.get("content-type"),
    "application/problem+json; charset=utf-8",
  );
  const body = await stale.json();
  assertEquals(body.code, "epoch.stale");
  assertEquals(body.stream, {
    lessonId: fixture.lessonId,
    lessonRevisionId: REVISION,
    epoch: 2,
  });
  const stalePull = await h.pull("learning-events");
  assertEquals(stalePull.status, 409);
  assertEquals(stalePull.body.code, "epoch.stale");
  const staleNavigation = await h.push("navigation-events", [
    checkpointed([], "old"),
  ]);
  assertEquals(staleNavigation.status, 409);
  await staleNavigation.body?.cancel();
  // The current epoch still reads, and the rejected event was never stored anywhere.
  const current = await (await h.call(
    `/api/v1/progress/learning-events?revision=${REVISION}&epoch=2`,
    { headers: h.cookie },
  )).json();
  assertEquals(current.events.length, 1);
  assertEquals(current.stream.epoch, 2);
  // An empty push at a higher epoch announces a discard without any evidence.
  const announced = await h.push("learning-events", [], h.cookie, 3);
  assertEquals((await announced.json()).stream.epoch, 3);
});

Deno.test("short-answer text round-trips unchanged, and the shared evaluator decides correctness", async () => {
  const h = await harness();
  const short = lesson.questions.find((question: any) =>
    question.type === "short"
  );
  const typed = "  If-None-Match\t\u00a0ünïcode « quotes » 🙂 \u2028 line";
  const sent = answered(short, typed, false);
  const numeric = lesson.questions.find((question: any) =>
    question.type === "numeric"
  );
  const idk = answered(numeric, null, false);
  const right = answered(short, ` ${short.answer.toUpperCase()} `, true);
  assertEquals(
    (await h.push("learning-events", [sent, idk, right])).status,
    200,
  );
  const stored = await h.pullAll("learning-events");
  assertEquals(stored.find((made) => made.id === sent.id), sent);
  assertEquals(stored.find((made) => made.id === idk.id), idk);
  assertEquals(stored.find((made) => made.id === right.id), right);
  const lying = await h.push("learning-events", [
    answered(short, "definitely wrong", true),
  ]);
  assertEquals(lying.status, 422);
  const rejection = (await lying.json()).rejections[0];
  assertEquals(rejection.code, "answer.correctness");
  assertEquals(rejection.path, "/events/0/correct");
});

Deno.test("an unknown Lesson Revision, a Question outside its revision and a malformed event are rejected and nothing is stored", async () => {
  const h = await harness();
  const unknown = await h.push(
    "learning-events",
    [event("lesson_started")],
    h.cookie,
    0,
    "6f1c1c2a-3b1e-4b6f-9a1c-2f6d8e4b7a10",
  );
  assertEquals(unknown.status, 404);
  assertEquals((await unknown.json()).code, "revision.unknown");
  const unknownPull = await h.call(
    "/api/v1/progress/learning-events?revision=nope&epoch=0",
    { headers: h.cookie },
  );
  assertEquals(unknownPull.status, 404);
  await unknownPull.body?.cancel();
  const question = lesson.questions[0];
  const foreignQuestion = answered(
    { ...question, id: crypto.randomUUID() },
    correctAnswer(question),
    true,
  );
  const wrongConcept = answered(
    { ...question, conceptId: lesson.concepts[1].id },
    correctAnswer(question),
    true,
  );
  const fine = event("lesson_started");
  const rejected = await h.push("learning-events", [
    fine,
    foreignQuestion,
    wrongConcept,
  ]);
  assertEquals(rejected.status, 422);
  const body = await rejected.json();
  assertEquals(body.code, "events.rejected");
  assertEquals(
    body.rejections.map((entry: any) => [entry.index, entry.code, entry.path]),
    [[1, "question.unknown", "/events/1/questionId"], [
      2,
      "question.concept",
      "/events/2/conceptId",
    ]],
  );
  assertEquals(
    (await h.pullAll("learning-events")).length,
    0,
    "a batch with any rejection stores nothing",
  );
  const malformed = await h.push("learning-events", [{
    id: "not-a-uuid",
    type: "card_seen",
    lessonRevisionId: REVISION,
    epoch: 0,
    occurredAt: "yesterday",
  }, { ...event("lesson_started"), epoch: 4 }]);
  const codes = (await malformed.json()).rejections.map((entry: any) =>
    entry.code
  ).sort();
  assertEquals(codes, ["event.epoch", "event.id", "event.occurredAt"]);
  const foreignCheckpoint = await h.push("navigation-events", [{
    ...checkpointed([], "bad"),
    checkpoint: {
      conceptIndex: 9,
      queue: ["nope"],
      learningEventFrontier: ["x"],
    },
  }]);
  assertEquals(
    (await foreignCheckpoint.json()).rejections.map((entry: any) => entry.code),
    ["checkpoint.frontier"],
  );
  const tooMany = await h.push(
    "learning-events",
    Array.from({ length: MAX_BATCH_EVENTS + 1 }, () => event("lesson_started")),
  );
  assertEquals((await tooMany.json()).rejections[0].code, "events.count");
  const notJson = await h.call("/api/v1/progress/learning-events", {
    method: "POST",
    headers: { ...h.cookie, "content-type": "application/json" },
    body: "{",
  });
  assertEquals(notJson.status, 400);
  await notJson.body?.cancel();
});

Deno.test("incremental pull pages with an opaque cursor and never skips or repeats an event", async () => {
  const h = await harness();
  const concept = lesson.concepts[1];
  const events = [
    event("lesson_started"),
    ...concept.cards.map((card: any) =>
      event("card_seen", { cardId: card.id, conceptId: concept.id })
    ),
  ];
  const drawable = lesson.questions.filter((question: any) =>
    question.conceptId === concept.id && !question.reserved
  );
  for (const question of drawable) {
    events.push(answered(question, correctAnswer(question), true));
  }
  assertEquals(
    (await h.push("learning-events", events.slice(0, 4))).status,
    200,
  );
  assertEquals((await h.push("learning-events", events.slice(4))).status, 200);
  assert(events.length >= 6);
  const seen: string[] = [];
  let cursor = "";
  let pages = 0;
  while (true) {
    const page = await h.pull("learning-events", `&limit=2&cursor=${cursor}`);
    assertEquals(page.status, 200);
    assert(page.body.events.length <= 2);
    assert(
      typeof page.body.cursor === "string" && !/^\d+$/.test(page.body.cursor),
      "the cursor is opaque",
    );
    seen.push(...page.body.events.map((made: Event) => made.id));
    pages += 1;
    if (!page.body.hasMore) break;
    cursor = page.body.cursor;
  }
  assert(pages >= 3);
  assertEquals(seen.length, events.length);
  assertEquals(new Set(seen).size, events.length);
  assertEquals(new Set(seen), new Set(events.map((made) => made.id)));
  // A page after the last cursor is empty, and a later push appears after it.
  const tail = await h.pull("learning-events", `&cursor=${cursor}`);
  assertEquals(
    tail.body.events.map((made: Event) => made.id),
    seen.slice(-1).length ? tail.body.events.map((made: Event) => made.id) : [],
  );
  const latest =
    (await h.pull("learning-events", `&limit=500&cursor=${cursor}`)).body;
  const added = event("card_seen", {
    cardId: lesson.concepts[2].cards[0].id,
    conceptId: lesson.concepts[2].id,
  });
  await (await h.push("learning-events", [added])).body?.cancel();
  const next = await h.pull("learning-events", `&cursor=${latest.cursor}`);
  assertEquals(next.body.events.map((made: Event) => made.id), [added.id]);
  assertEquals(next.body.hasMore, false);
  const bad = await h.pull("learning-events", "&cursor=not-a-cursor!");
  assertEquals(bad.status, 400);
  assertEquals(bad.body.code, "cursor.invalid");
});

Deno.test("the checkpoint is rebuilt from the streams, a smaller frontier never replaces a larger one, and the tie breaker holds", async () => {
  const h = await harness();
  const concept = lesson.concepts[0];
  const evidence = [
    event("lesson_started"),
    ...concept.cards.map((card: any) =>
      event("card_seen", { cardId: card.id, conceptId: concept.id })
    ),
  ];
  assertEquals((await h.push("learning-events", evidence)).status, 200);
  const ids = evidence.map((made) => made.id);
  const ahead = checkpointed(ids, "ahead", "2026-09-22T10:00:00.000Z");
  assertEquals((await h.push("navigation-events", [ahead])).status, 200);
  assertEquals((await h.checkpoint()).checkpoint.marker, "ahead");
  // A stale checkpoint arriving later, with a later clock, depends on less accepted evidence.
  const stale = checkpointed(
    ids.slice(0, 1),
    "stale",
    "2026-09-22T12:00:00.000Z",
  );
  assertEquals((await h.push("navigation-events", [stale])).status, 200);
  const afterStale = await h.checkpoint();
  assertEquals(afterStale.checkpoint.marker, "ahead");
  assertEquals(afterStale.frontier, ids.length);
  // A frontier naming evidence the server has not accepted counts for nothing.
  const bluff = checkpointed(
    [...ids, crypto.randomUUID(), crypto.randomUUID()],
    "bluff",
    "2026-09-22T13:00:00.000Z",
  );
  const bluffFrontier = ids.length; // only accepted ids count, so this ties with "ahead" on evidence
  assertEquals((await h.push("navigation-events", [bluff])).status, 200);
  assertEquals(
    (await h.checkpoint()).checkpoint.marker,
    "bluff",
    "equal accepted frontier: the later client clock wins",
  );
  assertEquals((await h.checkpoint()).frontier, bluffFrontier);
  // Equal frontier and equal clock: the greater id wins, whichever arrived first.
  const low = checkpointed(
    ids,
    "low",
    "2026-09-22T13:00:00.000Z",
    "00000000-0000-4000-8000-00000000000a",
  );
  const high = checkpointed(
    ids,
    "high",
    "2026-09-22T13:00:00.000Z",
    "ffffffff-ffff-4fff-bfff-ffffffffffff",
  );
  assertEquals((await h.push("navigation-events", [high])).status, 200);
  assertEquals((await h.checkpoint()).checkpoint.marker, "high");
  assertEquals((await h.push("navigation-events", [low])).status, 200);
  assertEquals((await h.checkpoint()).checkpoint.marker, "high");
  // Replaying the pulled streams through the shared rule reproduces the served checkpoint exactly.
  const navigation = await h.pullAll("navigation-events");
  const learning = await h.pullAll("learning-events");
  assertEquals(
    selectCheckpoint(navigation, learning),
    (await h.checkpoint()).checkpoint,
  );
  assertEquals(
    selectCheckpoint([...navigation].reverse(), [...learning].reverse()),
    (await h.checkpoint()).checkpoint,
  );
  // More evidence moves the checkpoint forward again.
  const more = event("card_seen", {
    cardId: lesson.concepts[1].cards[0].id,
    conceptId: lesson.concepts[1].id,
  });
  await (await h.push("learning-events", [more])).body?.cancel();
  const further = checkpointed(
    [...ids, more.id],
    "further",
    "2026-09-22T09:00:00.000Z",
  );
  await (await h.push("navigation-events", [further])).body?.cancel();
  const final = await h.checkpoint();
  assertEquals(
    final.checkpoint.marker,
    "further",
    "a larger frontier wins even with an earlier client clock",
  );
  assertEquals(final.frontier, ids.length + 1);
  assertStringIncludes(JSON.stringify(final.stream), REVISION);
});

Deno.test("progress on a revision the account cannot learn is unknown to it", async () => {
  const h = await harness();
  const draft = await h.call("/api/v1/lessons", {
    method: "POST",
    headers: { ...h.bearer(OTHER), "content-type": "application/json" },
    body: JSON.stringify({
      ...structuredClone(fixture),
      lessonId: undefined,
      revisionId: undefined,
      title: "Someone else's draft",
    }),
  });
  assertEquals(draft.status, 201);
  const created = await draft.json();
  const mine = await h.push(
    "learning-events",
    [{ ...event("lesson_started"), lessonRevisionId: created.revisionId }],
    h.cookie,
    0,
    created.revisionId,
  );
  assertEquals(mine.status, 404);
  await mine.body?.cancel();
  const theirs = await h.push(
    "learning-events",
    [{ ...event("lesson_started"), lessonRevisionId: created.revisionId }],
    h.bearer(OTHER),
    0,
    created.revisionId,
  );
  assertEquals(theirs.status, 200);
  await theirs.body?.cancel();
});
