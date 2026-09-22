// Validation of pushed progress events against the Lesson Revision they claim. The server never
// trusts a client's shape: every event needs a UUIDv4 ID, the batch's revision and epoch, a client
// timestamp, and references that exist in that revision. Correctness of an answer is recomputed with
// the shared evaluator, so a stored `correct` is never a client assertion.
import { evaluateAnswer } from "../../shared/learning/evaluate.js";

export const LEARNING_STREAM = "learning";
export const NAVIGATION_STREAM = "navigation";
export type StreamName = typeof LEARNING_STREAM | typeof NAVIGATION_STREAM;

export const LEARNING_TYPES = ["lesson_started", "card_seen", "question_answered"] as const;
export const NAVIGATION_TYPES = ["navigation_checkpointed"] as const;

/** Events accepted in one push. Larger batches are refused so a retry never re-sends a large body. */
export const MAX_BATCH_EVENTS = 200;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FLOW_KINDS = new Set(["check", "wrap_up"]);

/** One rejected event, with the JSON Pointer of the field at fault relative to the events array. */
export interface EventRejection {
  index: number;
  id: string | null;
  code: string;
  path: string;
  message: string;
}

/** A learning or navigation event as the browser stores it. */
export type SyncEvent = Record<string, unknown> & {
  id: string;
  type: string;
  lessonRevisionId: string;
  epoch: number;
  occurredAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTime(value: unknown): boolean {
  return typeof value === "string" && value.length >= 20 && Number.isFinite(Date.parse(value));
}

/** The answer field as the browser records it: an option ID, typed text, a number, or null for I don't know. */
function isAnswer(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "number";
}

type Reject = (code: string, path: string, message: string) => void;

function validateCommon(event: Record<string, unknown>, revisionId: string, epoch: number, types: readonly string[], reject: Reject): boolean {
  let ok = true;
  const fail: Reject = (code, path, message) => {
    ok = false;
    reject(code, path, message);
  };
  if (typeof event.id !== "string" || !UUID_V4.test(event.id)) fail("event.id", "/id", "Every event needs a UUIDv4 id.");
  if (typeof event.type !== "string" || !types.includes(event.type)) fail("event.type", "/type", `type must be one of ${types.join(", ")}.`);
  if (event.lessonRevisionId !== revisionId) fail("event.revision", "/lessonRevisionId", "Every event in a push belongs to the push's Lesson Revision.");
  if (event.epoch !== epoch) fail("event.epoch", "/epoch", "Every event in a push belongs to the push's progress epoch.");
  if (!isIsoTime(event.occurredAt)) fail("event.occurredAt", "/occurredAt", "occurredAt must be an ISO 8601 timestamp.");
  return ok;
}

function validateLearning(event: Record<string, unknown>, lesson: Record<string, any>, reject: Reject): void {
  if (event.type === "lesson_started") return;
  const concepts: Array<Record<string, any>> = Array.isArray(lesson.concepts) ? lesson.concepts : [];
  if (event.type === "card_seen") {
    const concept = concepts.find((candidate) => candidate.id === event.conceptId);
    if (!concept) return reject("concept.unknown", "/conceptId", "conceptId is not a Concept of this Lesson Revision.");
    if (!concept.cards.some((card: Record<string, any>) => card.id === event.cardId)) reject("card.unknown", "/cardId", "cardId is not a Card of that Concept in this Lesson Revision.");
    return;
  }
  const questions: Array<Record<string, any>> = Array.isArray(lesson.questions) ? lesson.questions : [];
  const question = questions.find((candidate) => candidate.id === event.questionId);
  if (!question) return reject("question.unknown", "/questionId", "questionId is not a Question of this Lesson Revision.");
  if (question.conceptId !== event.conceptId) reject("question.concept", "/conceptId", "conceptId is not the Concept that owns this Question.");
  if (question.poolId !== event.poolId) reject("question.pool", "/poolId", "poolId is not the Pool that owns this Question.");
  if (typeof event.flowKind !== "string" || !FLOW_KINDS.has(event.flowKind)) reject("answer.flowKind", "/flowKind", "flowKind must be check or wrap_up.");
  if (typeof event.attemptId !== "string" || !event.attemptId) reject("answer.attemptId", "/attemptId", "attemptId must name the Check or Wrap-up attempt.");
  if (!isAnswer(event.answer)) return reject("answer.value", "/answer", "answer must be text, a number, or null for I don't know.");
  if (typeof event.correct !== "boolean") return reject("answer.correct", "/correct", "correct must be a boolean.");
  const expected = event.answer !== null && evaluateAnswer(lesson, question, event.answer);
  if (expected !== event.correct) reject("answer.correctness", "/correct", "correct does not match the shared evaluator's verdict for this answer.");
}

function validateNavigation(event: Record<string, unknown>, lesson: Record<string, any>, reject: Reject): void {
  if (!("checkpoint" in event)) return reject("checkpoint.missing", "/checkpoint", "A navigation_checkpointed event carries a checkpoint, or null to close the run.");
  const checkpoint = event.checkpoint;
  if (checkpoint === null) return;
  if (!isRecord(checkpoint)) return reject("checkpoint.shape", "/checkpoint", "checkpoint must be an object or null.");
  const frontier = checkpoint.learningEventFrontier;
  if (!Array.isArray(frontier) || !frontier.every((id) => typeof id === "string" && UUID_V4.test(id))) {
    return reject("checkpoint.frontier", "/checkpoint/learningEventFrontier", "learningEventFrontier must list the UUIDv4 IDs of the learning events the checkpoint depends on.");
  }
  const concepts: Array<unknown> = Array.isArray(lesson.concepts) ? lesson.concepts : [];
  if (!Number.isInteger(checkpoint.conceptIndex) || Number(checkpoint.conceptIndex) < 0 || Number(checkpoint.conceptIndex) >= concepts.length) {
    reject("checkpoint.concept", "/checkpoint/conceptIndex", "conceptIndex must name a Concept of this Lesson Revision.");
  }
  const questions: Array<Record<string, any>> = Array.isArray(lesson.questions) ? lesson.questions : [];
  const known = new Set(questions.map((question) => question.id));
  if (!Array.isArray(checkpoint.queue) || !checkpoint.queue.every((id) => typeof id === "string" && known.has(id))) {
    reject("checkpoint.queue", "/checkpoint/queue", "queue must list Question IDs of this Lesson Revision.");
  }
}

/**
 * Validate one push. Returns the accepted events in submission order and every rejection; a push
 * with any rejection is refused as a whole so a retry is the same batch.
 */
export function validateBatch(
  stream: StreamName,
  events: unknown,
  revisionId: string,
  epoch: number,
  lesson: Record<string, any>,
): { accepted: SyncEvent[]; rejections: EventRejection[] } {
  const rejections: EventRejection[] = [];
  const accepted: SyncEvent[] = [];
  if (!Array.isArray(events)) {
    rejections.push({ index: -1, id: null, code: "events.shape", path: "/events", message: "events must be an array." });
    return { accepted, rejections };
  }
  if (events.length > MAX_BATCH_EVENTS) {
    rejections.push({ index: -1, id: null, code: "events.count", path: "/events", message: `A push carries at most ${MAX_BATCH_EVENTS} events.` });
    return { accepted, rejections };
  }
  const types = stream === LEARNING_STREAM ? LEARNING_TYPES : NAVIGATION_TYPES;
  const seen = new Set<string>();
  events.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      rejections.push({ index, id: null, code: "event.shape", path: `/events/${index}`, message: "Every event is an object." });
      return;
    }
    const id = typeof candidate.id === "string" ? candidate.id : null;
    const reject: Reject = (code, path, message) => rejections.push({ index, id, code, path: `/events/${index}${path}`, message });
    if (!validateCommon(candidate, revisionId, epoch, types, reject)) return;
    if (seen.has(candidate.id as string)) {
      reject("event.duplicate", "/id", "The same event id appears twice in one push.");
      return;
    }
    seen.add(candidate.id as string);
    if (stream === LEARNING_STREAM) validateLearning(candidate, lesson, reject);
    else validateNavigation(candidate, lesson, reject);
    accepted.push(candidate as SyncEvent);
  });
  return { accepted: rejections.length ? [] : accepted, rejections };
}
