// What IndexedDB hands back is checked before a newer build uses it. The checks must accept every
// flow the application itself produces, or a resume would silently start over, and must refuse a
// shape an older build could have left behind.
import { assert, assertEquals } from "@std/assert";
import { DEMO_LESSON as lesson } from "../support/demo-lesson.ts";
import {
  advance,
  continueFromCard,
  currentQuestion,
  enterCorrective,
  type Flow,
  initialFlow,
  stepBack,
  submitAnswer,
} from "../../src/client/learning/flow.js";
import {
  advanceDrill,
  startDrill,
} from "../../src/client/learning/drill-flow.js";
import {
  isCheckpoint,
  isDrillCheckpoint,
  isFlow,
  isLessonRecord,
  isProgressStream,
  readable,
  upcastEvent,
  upcastOutboxEntry,
} from "../../src/client/storage/records.js";

const attempt = { seed: 7, attemptId: "attempt-1" };

/** Every flow a learner passes through on one wrong-then-right walk of the whole lesson. */
function walk(): Flow[] {
  const seen: Flow[] = [];
  let flow = initialFlow();
  for (let steps = 0; steps < 400 && flow.screen !== "summary"; steps++) {
    seen.push(flow);
    if (flow.screen === "card" || flow.screen === "corrective") {
      seen.push(stepBack(lesson, flow));
      flow = continueFromCard(lesson, flow, attempt);
      continue;
    }
    const question = currentQuestion(lesson, flow);
    const wrong = submitAnswer(lesson, flow, "definitely wrong", false).flow;
    seen.push(wrong, enterCorrective(lesson, wrong), stepBack(lesson, flow));
    const answer = question.type === "mcq"
      ? question.key
      : String(question.answer);
    flow = advance(
      lesson,
      submitAnswer(lesson, flow, answer, false).flow,
      attempt,
    );
  }
  seen.push(flow);
  return seen;
}

Deno.test("every flow the application produces reads back as a checkpoint", () => {
  const flows = walk();
  assert(flows.some((flow) => flow.screen === "summary"), "the walk finishes");
  assert(flows.some((flow) => flow.detour !== null), "the walk takes detours");
  assert(
    flows.some((flow) => flow.flowKind === "wrap_up"),
    "the walk reaches the Wrap-up",
  );
  for (const flow of flows) {
    const stored = structuredClone({ ...flow, learningEventFrontier: ["a"] });
    assert(isCheckpoint(stored), `${flow.screen}/${flow.flowKind} is readable`);
  }
});

Deno.test("every drill flow reads back as a drill checkpoint", () => {
  let flow = startDrill(lesson, { seed: 3, runId: "run-1" });
  for (let steps = 0; steps < 100 && flow.screen !== "summary"; steps++) {
    const wrong = submitAnswer(lesson, flow, "definitely wrong", false).flow;
    for (const candidate of [flow, wrong, enterCorrective(lesson, wrong)]) {
      assert(
        isDrillCheckpoint(
          structuredClone({ ...candidate, drillEventFrontier: [] }),
        ),
        `${candidate.screen} is readable`,
      );
    }
    flow = advanceDrill(wrong);
  }
  assert(
    isDrillCheckpoint({ ...flow, drillEventFrontier: [] }),
    "the summary is readable",
  );
});

Deno.test("a checkpoint missing a field, or holding one of the wrong type, is refused", () => {
  const good = { ...initialFlow(), learningEventFrontier: [] };
  assert(isCheckpoint(good));
  const { detour: _detour, ...noDetour } = good;
  assertEquals(isCheckpoint(noDetour), false);
  const { learningEventFrontier: _frontier, ...noFrontier } = good;
  assertEquals(isCheckpoint(noFrontier), false);
  assertEquals(isCheckpoint({ ...good, screen: "lesson" }), false);
  assertEquals(isCheckpoint({ ...good, cardIndex: -1 }), false);
  assertEquals(isCheckpoint({ ...good, queue: [1] }), false);
  assertEquals(isFlow({ ...good, detour: { screen: "card" } }), false);
  assertEquals(isDrillCheckpoint(good), false);
});

Deno.test("an event without an epoch belongs to epoch 0; an event without its envelope is unreadable", () => {
  const envelope = {
    id: "e1",
    type: "card_seen",
    lessonRevisionId: "r1",
    occurredAt: "2026-09-25T10:00:00.000Z",
    cardId: "c1",
  };
  assertEquals(upcastEvent(envelope), { ...envelope, epoch: 0 });
  assertEquals(upcastEvent({ ...envelope, epoch: 2 })?.epoch, 2);
  assertEquals(upcastEvent({ ...envelope, epoch: "2" }), null);
  const { occurredAt: _occurredAt, ...noTime } = envelope;
  assertEquals(upcastEvent(noTime), null);
  assertEquals(upcastEvent("e1"), null);
  assertEquals(
    upcastOutboxEntry({
      id: "e1",
      store: "learning_events",
      event: envelope,
      queuedAt: "q",
    })
      ?.event.epoch,
    0,
  );
  assertEquals(
    upcastOutboxEntry({
      id: "e1",
      store: "learning_events",
      event: noTime,
      queuedAt: "q",
    }),
    null,
  );
});

Deno.test("unreadable records are skipped and counted, readable ones kept in order", () => {
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (message: string) => warnings.push(message);
  try {
    const kept = readable(
      [1, "x", 2, null, 3],
      (record) => typeof record === "number" ? record * 10 : null,
      "learning_events",
    );
    assertEquals(kept, [10, 20, 30]);
    assertEquals(warnings, [
      "learning_events: skipped 2 record(s) this build cannot read",
    ]);
  } finally {
    console.warn = warn;
  }
});

Deno.test("a cached lesson and a pin are read only when they can be opened", () => {
  assert(isLessonRecord({ id: lesson.revisionId, lesson, cachedAt: "t" }));
  assertEquals(
    isLessonRecord({ id: lesson.revisionId, lesson: { title: "x" } }),
    false,
  );
  assertEquals(isLessonRecord({ id: lesson.revisionId }), false);
  assert(isProgressStream({ id: "l1", revisionId: "r1", epoch: 0 }));
  assertEquals(isProgressStream({ id: "l1", revisionId: "r1" }), false);
});
