// The shared sync rules: union by ID, frontier-first checkpoint selection, and the tie breaker for
// equal frontiers. Pure, so the browser and the server agree on every answer here.
import { assert, assertEquals } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { reduceProgress } from "../../src/shared/learning/progress.js";
import { compareCheckpointEvents, frontierCount, missingFrom, selectCheckpoint, unionById } from "../../src/shared/learning/sync.js";

const REVISION = lesson.revisionId;

function learning(id: string, type: string, data: Record<string, unknown> = {}) {
  return { id, type, lessonRevisionId: REVISION, epoch: 0, occurredAt: "2026-09-22T10:00:00.000Z", ...data };
}

function checkpoint(id: string, occurredAt: string, frontier: string[], marker: string) {
  return { id, type: "navigation_checkpointed", lessonRevisionId: REVISION, epoch: 0, occurredAt, checkpoint: { screen: "card", marker, learningEventFrontier: frontier } };
}

Deno.test("union by id keeps one copy of each event and the first copy seen", () => {
  const local = [learning("a", "lesson_started"), learning("b", "card_seen", { cardId: "x", from: "local" })];
  const remote = [learning("b", "card_seen", { cardId: "x", from: "remote" }), learning("c", "card_seen", { cardId: "y" })];
  const union = unionById(local, remote);
  assertEquals(union.map((event) => event.id), ["a", "b", "c"]);
  assertEquals((union[1] as any).from, "local");
  assertEquals(missingFrom(local, remote).map((event) => event.id), ["c"]);
});

Deno.test("progress reduces to the same state whatever order the events arrive in", () => {
  const cards = lesson.concepts[0].cards.map((card, index) => learning(`card-${index}`, "card_seen", { cardId: card.id, conceptId: lesson.concepts[0].id }));
  const wrapUp = learning("wrap", "question_answered", { flowKind: "wrap_up", conceptId: lesson.concepts[1].id, correct: true });
  const inOrder = [learning("start", "lesson_started"), ...cards, wrapUp];
  const reversed = [...inOrder].reverse();
  const shuffledOnce = [wrapUp, cards[1], learning("start", "lesson_started"), cards[0], ...cards.slice(2)];
  const expected = reduceProgress(lesson, inOrder);
  for (const order of [reversed, shuffledOnce]) {
    const actual = reduceProgress(lesson, order);
    assertEquals(actual.state, expected.state);
    assertEquals([...actual.cardsSeen].sort(), [...expected.cardsSeen].sort());
    assertEquals([...actual.learnedConcepts], [...expected.learnedConcepts]);
    assertEquals(actual.conceptStates, expected.conceptStates);
  }
});

Deno.test("a checkpoint's frontier counts only learning events the union has accepted", () => {
  const accepted = new Set(["a", "b"]);
  assertEquals(frontierCount(checkpoint("c1", "2026-09-22T10:00:00.000Z", ["a", "b", "unknown"], "x"), accepted), 2);
  assertEquals(frontierCount({ ...checkpoint("c2", "2026-09-22T10:00:00.000Z", [], "y"), checkpoint: null }, accepted), 0);
});

Deno.test("a checkpoint that depends on less accepted evidence never replaces one that depends on more, however late or recent", () => {
  const evidence = [learning("a", "lesson_started"), learning("b", "card_seen"), learning("c", "card_seen")];
  const fuller = checkpoint("full", "2026-09-22T10:00:00.000Z", ["a", "b", "c"], "ahead");
  const staleButLater = checkpoint("stale", "2026-09-22T11:00:00.000Z", ["a"], "behind");
  assertEquals(selectCheckpoint([fuller, staleButLater], evidence)?.marker, "ahead");
  assertEquals(selectCheckpoint([staleButLater, fuller], evidence)?.marker, "ahead");
  // A frontier that names evidence nobody has accepted counts for nothing.
  const bluffing = checkpoint("bluff", "2026-09-22T12:00:00.000Z", ["a", "ghost-1", "ghost-2", "ghost-3"], "bluff");
  assertEquals(selectCheckpoint([fuller, bluffing], evidence)?.marker, "ahead");
});

Deno.test("equal frontiers: the later client clock wins, then the greater id, so both sides agree without either clock alone", () => {
  const evidence = [learning("a", "lesson_started"), learning("b", "card_seen")];
  const earlier = checkpoint("id-b", "2026-09-22T10:00:00.000Z", ["a", "b"], "earlier");
  const later = checkpoint("id-a", "2026-09-22T10:00:01.000Z", ["a", "b"], "later");
  assertEquals(selectCheckpoint([earlier, later], evidence)?.marker, "later");
  assertEquals(selectCheckpoint([later, earlier], evidence)?.marker, "later");
  const sameClockLow = checkpoint("00000000-0000-4000-8000-000000000001", "2026-09-22T10:00:00.000Z", ["a", "b"], "low");
  const sameClockHigh = checkpoint("00000000-0000-4000-8000-000000000002", "2026-09-22T10:00:00.000Z", ["a", "b"], "high");
  assertEquals(selectCheckpoint([sameClockLow, sameClockHigh], evidence)?.marker, "high");
  assertEquals(selectCheckpoint([sameClockHigh, sameClockLow], evidence)?.marker, "high");
  const accepted = new Set(["a", "b"]);
  assert(compareCheckpointEvents(sameClockHigh, sameClockLow, accepted) > 0);
  assert(compareCheckpointEvents(sameClockLow, sameClockHigh, accepted) < 0);
  assertEquals(compareCheckpointEvents(sameClockLow, sameClockLow, accepted), 0);
});

Deno.test("selection ignores other event types and returns null without a checkpoint", () => {
  assertEquals(selectCheckpoint([learning("a", "lesson_started")], []), null);
  assertEquals(selectCheckpoint([], []), null);
  const drill = { ...checkpoint("d", "2026-09-22T10:00:00.000Z", [], "drill"), type: "drill_checkpointed" };
  assertEquals(selectCheckpoint([drill], []), null);
});
