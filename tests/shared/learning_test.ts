import { assertEquals, assert } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { validateLesson } from "../../src/shared/lessons/lesson.js";
import { evaluateAnswer, canonicalize } from "../../src/shared/learning/evaluate.js";
import { reduceProgress } from "../../src/shared/learning/progress.js";
import { shuffled } from "../../src/shared/learning/shuffle.js";
import { reduceCheckpoint } from "../../src/shared/learning/checkpoint.js";
import { advanceCheck, advanceWrapUp } from "../../src/shared/learning/transitions.js";

Deno.test("demo fixture satisfies structural invariants", () => assertEquals(validateLesson(lesson), []));
Deno.test("answer evaluation is exact and normalized", () => {
  assert(evaluateAnswer(lesson.questions[0], "a")); assert(!evaluateAnswer(lesson.questions[0], "b"));
  assert(evaluateAnswer(lesson.questions[2], "  THE   AGE HEADER ")); assert(!evaluateAnswer(lesson.questions[2], "ages"));
  assert(evaluateAnswer(lesson.questions[1], "60.0")); assert(!evaluateAnswer(lesson.questions[1], "60 seconds"));
  assertEquals(canonicalize(" A\u00a0 B "), "a b");
});
Deno.test("progress reducer is monotonic and derives learned", () => {
  const events:any[]=[{type:"lesson_started"}];
  assertEquals(reduceProgress(lesson,events).state,"in_progress");
  for(const c of lesson.concepts) for(const card of c.cards) events.push({type:"card_seen",cardId:card.id});
  assertEquals(reduceProgress(lesson,events).state,"seen");
  for(const c of lesson.concepts) events.push({type:"question_answered",flowKind:"wrap_up",correct:true,conceptId:c.id});
  assertEquals(reduceProgress(lesson,events).state,"learned");
});
Deno.test("shuffling is stable and seed-sensitive", () => { assertEquals(shuffled([1,2,3,4],99),shuffled([1,2,3,4],99)); assert(shuffled([1,2,3,4],99).join()!=shuffled([1,2,3,4],11).join()); });
Deno.test("checkpoint reconstruction chooses the last immutable checkpoint", () => {
  const events=[{type:"navigation_checkpointed",occurredAt:"2026-01-01T00:00:00Z",checkpoint:{screen:"card",cardIndex:0}},{type:"navigation_checkpointed",occurredAt:"2026-01-01T00:01:00Z",checkpoint:{screen:"question",queue:["q"]}}];
  assertEquals(reduceCheckpoint(events),{screen:"question",queue:["q"]});
});
Deno.test("Check and Wrap-up transitions preserve their distinct retry rules", () => {
  assertEquals(advanceCheck({queue:["a","b","c"],correct:false,idk:false}).queue,["b","c"]);
  assert(advanceCheck({queue:["a","b"],correct:false,idk:true}).done);
  assertEquals(advanceWrapUp({queue:["a","b"],correct:true,seed:2}).queue,["b"]);
  const retry=advanceWrapUp({queue:["a","b"],correct:false,seed:2});
  assertEquals(new Set(retry.queue),new Set(["a","b"])); assert(!retry.done);
});
