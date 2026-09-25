// @ts-check
// Pure lesson/v1 resolver. It runs unchanged in the browser, on the server and as the
// downloadable validator, so it must not touch the DOM, the network or any storage.
//
// Diagnostics carry a stable code, a JSON Pointer path and a severity. Errors make the
// document invalid. Warnings return with `valid: true`. Diagnostics are sorted by path,
// then code, so the same document always produces the same output.

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_ID = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const QUESTION_TYPES = new Set(["mcq", "numeric", "short"]);
const PROVENANCE_FIELDS = [
  "client",
  "harness",
  "model",
  "client_version",
  "session_reference",
];
const SOURCE_FIELDS = ["type", "title", "locator"];

export const MAX_DOCUMENT_BYTES = 1_000_000;
export const MAX_DOCUMENT_DEPTH = 32;
export const OPTION_COUNT = 3;
export const CARD_WORDS_MIN = 80;
export const CARD_WORDS_MAX = 200;
export const OPTION_RATIO_MAX = 1.35;
export const KEY_LONGEST_MAX = 1 / 3;
export const DRAWABLE_MIN = 3;
const UNBOUND_REFERENCE =
  /\b(the (second|third|other|above|former|latter)|besides the|other than the|this approach|as mentioned|that same|the previous)\b/i;

/** @typedef {{ severity: "error" | "warning", code: string, path: string, message: string }} Diagnostic */
/**
 * @typedef {{ valid: true, schemaVersion: 1, fingerprint: string, diagnostics: Diagnostic[],
 *   normalizedLesson: import("../lessons/types.d.ts").NormalizedLesson }} AcceptedLesson
 * @typedef {{ valid: false, schemaVersion: 1, fingerprint: null, diagnostics: Diagnostic[],
 *   normalizedLesson: null }} RejectedLesson
 * @typedef {AcceptedLesson | RejectedLesson} Resolution
 */

/** @param {unknown} value */
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null;
}

/**
 * A non-empty string. As a guard, true proves a string; false proves nothing about the type, and
 * the resolver only reports in that branch.
 * @param {unknown} value
 * @returns {value is string}
 */
function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {unknown} value */
function ownKeys(value) {
  const record = object(value);
  return record ? Object.keys(record) : [];
}

/** @param {Record<string, unknown>} record @param {string} key */
function own(record, key) {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * A UUIDv4 string. RegExp.test coerces its argument, so an array holding one UUID would pass a bare
 * `UUID_V4.test(value)`; the type is checked first.
 * @param {unknown} value
 * @returns {value is string}
 */
function uuid(value) {
  return typeof value === "string" && UUID_V4.test(value);
}

/**
 * The shape the JSON Schema gives an MCQ's `map` and `feedback`: an object of exactly `count`
 * entries, each keyed by a local ID, each value passing `entry`. Membership is checked separately.
 * @param {unknown} value
 * @param {number} count
 * @param {(entry: unknown) => boolean} entry
 */
function shaped(value, count, entry) {
  const record = object(value);
  if (!record) return false;
  const keys = Object.keys(record);
  return keys.length === count &&
    keys.every((key) => localId(key) && entry(record[key]));
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function localId(value) {
  return typeof value === "string" && LOCAL_ID.test(value) &&
    !RESERVED_NAMES.has(value);
}

/** @param {string} paragraphs */
function wordCount(paragraphs) {
  return paragraphs.replace(/<[^>]+>/g, "").trim().split(/\s+/).length;
}

/**
 * Nesting depth of a JSON value, measured without recursion so hostile input cannot
 * overflow the stack. Stops counting once the limit is exceeded.
 * @param {unknown} root
 * @param {number} limit
 */
function exceedsDepth(root, limit) {
  /** @type {Array<{ value: unknown, depth: number }>} */
  const stack = [{ value: root, depth: 1 }];
  while (stack.length) {
    const { value, depth } =
      /** @type {{ value: unknown, depth: number }} */ (stack.pop());
    if (value === null || typeof value !== "object") continue;
    if (depth > limit) return true;
    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) {
      stack.push({ value: child, depth: depth + 1 });
    }
  }
  return false;
}

/** @param {unknown} value @returns {unknown} */
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  const record = object(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.keys(record).sort().map((key) => [key, sortValue(record[key])]),
  );
}

/** @param {string} input */
async function sha256(input) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** @param {string} path */
function pathSegments(path) {
  return path.split("/").slice(1).map((
    segment,
  ) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

/** @param {Diagnostic} a @param {Diagnostic} b */
function compareDiagnostics(a, b) {
  const left = pathSegments(a.path);
  const right = pathSegments(b.path);
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const l = left[index];
    const r = right[index];
    if (l === r) continue;
    if (typeof l === "number" && typeof r === "number") return l - r;
    if (typeof l === "number") return -1;
    if (typeof r === "number") return 1;
    return l < r ? -1 : 1;
  }
  if (left.length !== right.length) return left.length - right.length;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/** A collector for diagnostics. */
class Report {
  constructor() {
    /** @type {Diagnostic[]} */
    this.diagnostics = [];
  }
  /** @param {string} code @param {string} path @param {string} message */
  error(code, path, message) {
    this.diagnostics.push({ severity: "error", code, path, message });
  }
  /** @param {string} code @param {string} path @param {string} message */
  warning(code, path, message) {
    this.diagnostics.push({ severity: "warning", code, path, message });
  }
  get failed() {
    return this.diagnostics.some((diagnostic) =>
      diagnostic.severity === "error"
    );
  }
  sorted() {
    return [...this.diagnostics].sort(compareDiagnostics);
  }
}

/**
 * @typedef {object} ConceptFacts
 * @property {string} id
 * @property {string} poolId
 * @property {string} path
 * @property {Map<string, string>} options  option ID -> text
 * @property {number} longestOption
 * @property {Map<string, { correctingCardId: string, index: number }>} misconceptions
 * @property {Set<string>} usedMisconceptions
 * @property {Set<string>} cardIds
 * @property {string} prose
 * @property {number} drawable
 * @property {number} reserved
 */

/**
 * Validate one Concept and record the facts its Questions are checked against.
 * @param {Report} report
 * @param {unknown} raw
 * @param {number} index
 * @param {{ conceptIds: Set<string>, poolIds: Set<string>, cardIds: Set<string> }} lesson
 * @returns {ConceptFacts}
 */
function resolveConcept(report, raw, index, lesson) {
  const concept = object(raw) ?? {};
  const path = `/concepts/${index}`;
  if (!uuid(concept.id) || lesson.conceptIds.has(concept.id)) {
    report.error(
      "concept.id",
      `${path}/id`,
      "Concept ID must be a unique UUIDv4.",
    );
  } else lesson.conceptIds.add(concept.id);
  if (!text(concept.title)) {
    report.error(
      "concept.title",
      `${path}/title`,
      "Concept title is required.",
    );
  }
  if (concept.statement !== undefined && !text(concept.statement)) {
    report.error(
      "concept.statement",
      `${path}/statement`,
      "Concept statement must be a non-empty string when present.",
    );
  }
  if (
    !uuid(concept.poolId) || lesson.poolIds.has(concept.poolId)
  ) {
    report.error(
      "pool.id",
      `${path}/poolId`,
      "Pool ID must be a unique UUIDv4.",
    );
  } else lesson.poolIds.add(concept.poolId);

  /** @type {Map<string, string>} */
  const options = new Map();
  const rawOptions = Array.isArray(concept.options) ? concept.options : [];
  if (rawOptions.length !== OPTION_COUNT) {
    report.error(
      "concept.options.count",
      `${path}/options`,
      `A Concept owns exactly ${OPTION_COUNT} shared options; found ${rawOptions.length}.`,
    );
  }
  rawOptions.forEach((rawOption, optionIndex) => {
    const option = object(rawOption) ?? {};
    const optionPath = `${path}/options/${optionIndex}`;
    if (!localId(option.id)) {
      report.error(
        "concept.option.id.invalid",
        `${optionPath}/id`,
        "Option ID must match ^[A-Za-z0-9_-]{1,64}$ and not be a reserved name.",
      );
    } else if (options.has(option.id)) {
      report.error(
        "concept.option.id",
        `${optionPath}/id`,
        "Option ID must be unique in the Concept.",
      );
    }
    if (!text(option.text)) {
      report.error(
        "concept.option.text",
        `${optionPath}/text`,
        "Option text is required.",
      );
    }
    if (localId(option.id) && !options.has(option.id)) {
      options.set(option.id, text(option.text) ? option.text : "");
    }
  });
  const lengths = [...options.values()].map((value) => value.length).filter((
    length,
  ) => length > 0);
  const longestOption = lengths.length ? Math.max(...lengths) : 0;
  const shortestOption = lengths.length ? Math.min(...lengths) : 0;
  if (
    options.size === OPTION_COUNT && shortestOption > 0 &&
    longestOption / shortestOption > OPTION_RATIO_MAX
  ) {
    report.error(
      "concept.options.ratio",
      `${path}/options`,
      `Option length ratio ${
        (longestOption / shortestOption).toFixed(2)
      } exceeds ${OPTION_RATIO_MAX}; length must not signal the key.`,
    );
  }

  /** @type {Set<string>} */
  const cardIds = new Set();
  /** @type {string[]} */
  const paragraphs = [];
  const cards = Array.isArray(concept.cards) ? concept.cards : [];
  if (cards.length < 2) {
    report.error(
      "concept.cards.minimum",
      `${path}/cards`,
      "Each Concept needs at least two Cards.",
    );
  }
  cards.forEach((rawCard, cardIndex) => {
    const card = object(rawCard) ?? {};
    const cardPath = `${path}/cards/${cardIndex}`;
    if (!uuid(card.id) || lesson.cardIds.has(card.id)) {
      report.error(
        "card.id",
        `${cardPath}/id`,
        "Card ID must be a unique UUIDv4.",
      );
    } else {
      lesson.cardIds.add(card.id);
      cardIds.add(card.id);
    }
    if (!text(card.heading)) {
      report.error(
        "card.heading",
        `${cardPath}/heading`,
        "Card heading is required.",
      );
    }
    const body =
      Array.isArray(card.body) && card.body.length > 0 && card.body.every(text)
        ? /** @type {string[]} */ (card.body)
        : null;
    if (!body) {
      report.error(
        "card.body.paragraphs",
        `${cardPath}/body`,
        "Card body must be a non-empty array of paragraph strings.",
      );
      return;
    }
    paragraphs.push(...body);
    const words = wordCount(body.join(" "));
    if (words < CARD_WORDS_MIN || words > CARD_WORDS_MAX) {
      report.error(
        "card.words",
        `${cardPath}/body`,
        `Card is ${words} words; write ${CARD_WORDS_MIN} to ${CARD_WORDS_MAX}.`,
      );
    }
    if (body.length < 2) {
      report.warning(
        "card.paragraphs.single",
        `${cardPath}/body`,
        "Single-paragraph Card: the clamped corrective view will have nothing to expand.",
      );
    }
  });

  /** @type {Map<string, { correctingCardId: string, index: number }>} */
  const misconceptions = new Map();
  const rawMisconceptions = Array.isArray(concept.misconceptions)
    ? concept.misconceptions
    : [];
  rawMisconceptions.forEach((rawMisconception, misconceptionIndex) => {
    const misconception = object(rawMisconception) ?? {};
    const misconceptionPath = `${path}/misconceptions/${misconceptionIndex}`;
    if (!localId(misconception.id)) {
      report.error(
        "misconception.id.invalid",
        `${misconceptionPath}/id`,
        "Misconception ID must match ^[A-Za-z0-9_-]{1,64}$ and not be a reserved name.",
      );
    } else if (misconceptions.has(misconception.id)) {
      report.error(
        "misconception.id",
        `${misconceptionPath}/id`,
        "Misconception ID must be unique in the Concept.",
      );
    }
    if (!text(misconception.statement)) {
      report.error(
        "misconception.statement",
        `${misconceptionPath}/statement`,
        "Write the misconception statement as the belief itself.",
      );
    }
    if (
      typeof misconception.correctingCardId !== "string" ||
      !cardIds.has(misconception.correctingCardId)
    ) {
      report.error(
        "misconception.card",
        `${misconceptionPath}/correctingCardId`,
        "A misconception must name a Card in the same Concept.",
      );
    }
    if (localId(misconception.id) && !misconceptions.has(misconception.id)) {
      misconceptions.set(misconception.id, {
        correctingCardId: String(misconception.correctingCardId ?? ""),
        index: misconceptionIndex,
      });
    }
  });

  return {
    id: String(concept.id ?? ""),
    poolId: String(concept.poolId ?? ""),
    path,
    options,
    longestOption,
    misconceptions,
    usedMisconceptions: new Set(),
    cardIds,
    prose: paragraphs.join(" "),
    drawable: 0,
    reserved: 0,
  };
}

/**
 * Validate one Question against its Concept. Returns whether the key is the Concept's longest option.
 * @param {Report} report
 * @param {unknown} raw
 * @param {number} index
 * @param {Map<string, ConceptFacts>} concepts  by Concept ID
 * @param {Set<string>} questionIds
 * @returns {{ mcq: boolean, keyLongest: boolean }}
 */
function resolveQuestion(report, raw, index, concepts, questionIds) {
  const question = object(raw) ?? {};
  const path = `/questions/${index}`;
  const result = { mcq: false, keyLongest: false };
  if (!uuid(question.id) || questionIds.has(question.id)) {
    report.error(
      "question.id",
      `${path}/id`,
      "Question ID must be a unique UUIDv4.",
    );
  } else questionIds.add(question.id);
  const concept = typeof question.conceptId === "string"
    ? concepts.get(question.conceptId)
    : undefined;
  if (!concept) {
    report.error(
      "question.concept",
      `${path}/conceptId`,
      "Question must reference a Concept in this lesson.",
    );
  }
  if (!concept || question.poolId !== concept.poolId) {
    report.error(
      "question.pool",
      `${path}/poolId`,
      "Question must reference the Pool of its Concept.",
    );
  }
  if (typeof question.type !== "string" || !QUESTION_TYPES.has(question.type)) {
    report.error(
      "question.type",
      `${path}/type`,
      "Question type must be mcq, numeric, or short.",
    );
  }
  if (!text(question.stem)) {
    report.error("question.stem", `${path}/stem`, "Question stem is required.");
  } else if (UNBOUND_REFERENCE.test(question.stem)) {
    report.error(
      "question.stem.unbound",
      `${path}/stem`,
      "Stem contains an unbound reference; it must stand alone with the Cards removed.",
    );
  }
  if (
    question.reserved !== undefined && typeof question.reserved !== "boolean"
  ) {
    report.error(
      "question.reserved",
      `${path}/reserved`,
      "reserved must be a boolean when present.",
    );
  }
  const reserved = question.reserved === true;
  if (concept) {
    if (reserved) concept.reserved++;
    else concept.drawable++;
    if (
      typeof question.correctingCardId !== "string" ||
      !concept.cardIds.has(question.correctingCardId)
    ) {
      report.error(
        "question.correctingCard",
        `${path}/correctingCardId`,
        "Question must reference a correcting Card in its Concept.",
      );
    }
  }

  if (question.type === "mcq") {
    result.mcq = true;
    const options = concept ? concept.options : new Map();
    // Shape first: the JSON Schema's own rule for map and feedback, reported with its own code so
    // schema-catchable problems never hide under the identity codes below.
    if (!shaped(question.map, OPTION_COUNT - 1, localId)) {
      report.error(
        "mcq.map.shape",
        `${path}/map`,
        `map must be an object of exactly ${
          OPTION_COUNT - 1
        } entries whose keys and values are local IDs.`,
      );
    }
    if (!shaped(question.feedback, OPTION_COUNT, text)) {
      report.error(
        "mcq.feedback.shape",
        `${path}/feedback`,
        `feedback must be an object of exactly ${OPTION_COUNT} entries whose keys are local IDs and whose values are non-empty text.`,
      );
    }
    const feedback = object(question.feedback) ?? {};
    const map = object(question.map) ?? {};
    const key = typeof question.key === "string" ? question.key : "";
    const keyKnown = options.has(key);
    if (!keyKnown) {
      report.error(
        "mcq.key",
        `${path}/key`,
        "MCQ key must be one option ID from the Concept's shared option set.",
      );
    } else {result.keyLongest = concept !== undefined &&
        options.get(key)?.length === concept.longestOption;}
    for (const optionId of options.keys()) {
      if (!text(own(feedback, optionId))) {
        report.error(
          "mcq.feedback.missing",
          `${path}/feedback/${optionId}`,
          "Every option needs feedback, including the key.",
        );
      }
      if (optionId === key) continue;
      const misconceptionId = own(map, optionId);
      if (misconceptionId === undefined) {
        report.error(
          "mcq.map.missing",
          `${path}/map/${optionId}`,
          "Every distractor maps to one misconception in its Concept.",
        );
        continue;
      }
      if (
        typeof misconceptionId !== "string" ||
        !concept?.misconceptions.has(misconceptionId)
      ) {
        report.error(
          "mcq.map.unknown",
          `${path}/map/${optionId}`,
          "The named misconception is not in this Concept.",
        );
        continue;
      }
      concept?.usedMisconceptions.add(misconceptionId);
    }
    for (const optionId of ownKeys(map)) {
      if (!options.has(optionId) || optionId === key) {
        report.error(
          "mcq.map.extra",
          `${path}/map/${optionId}`,
          "map keys must be the Concept's distractor option IDs.",
        );
      }
    }
    for (const optionId of ownKeys(feedback)) {
      if (!options.has(optionId)) {
        report.error(
          "mcq.feedback.extra",
          `${path}/feedback/${optionId}`,
          "feedback keys must be the Concept's option IDs.",
        );
      }
    }
    return result;
  }

  if (question.type === "numeric") {
    if (reserved) {
      report.error(
        "numeric.reserved",
        `${path}/reserved`,
        "A numeric Question is never reserved; the Wrap-up must not hang on an unseen number.",
      );
    }
    if (
      typeof question.answer !== "number" || !Number.isFinite(question.answer)
    ) {
      report.error(
        "numeric.answer",
        `${path}/answer`,
        "Numeric answer must be a finite number.",
      );
    } else if (concept && !concept.prose.includes(String(question.answer))) {
      report.error(
        "numeric.answer.uncovered",
        `${path}/answer`,
        `The answer ${question.answer} appears in no Card of this Concept.`,
      );
    }
    if (question.tolerance === undefined || question.tolerance === 0) {
      report.error(
        "numeric.tolerance.missing",
        `${path}/tolerance`,
        "Numeric Question has no tolerance; set it from the claim, not the decimal.",
      );
    } else if (
      typeof question.tolerance !== "number" ||
      !Number.isFinite(question.tolerance) || question.tolerance < 0
    ) {
      report.error(
        "numeric.tolerance",
        `${path}/tolerance`,
        "Tolerance must be a non-negative number.",
      );
    }
    if (question.unit !== undefined && typeof question.unit !== "string") {
      report.error(
        "numeric.unit",
        `${path}/unit`,
        "Unit must be a string when present.",
      );
    }
    if (!text(question.feedback)) {
      report.error(
        "question.feedback",
        `${path}/feedback`,
        "Feedback is required.",
      );
    }
    return result;
  }

  if (question.type === "short") {
    if (!text(question.answer)) {
      report.error(
        "short.answer",
        `${path}/answer`,
        "Short answer requires a canonical answer.",
      );
    }
    if (
      question.aliases !== undefined &&
      !(Array.isArray(question.aliases) && question.aliases.every(text))
    ) {
      report.error(
        "short.aliases",
        `${path}/aliases`,
        "Aliases must be an array of non-empty strings when present.",
      );
    }
    if (!text(question.feedback)) {
      report.error(
        "question.feedback",
        `${path}/feedback`,
        "Feedback is required.",
      );
    }
  }
  return result;
}

/** @param {import("../lessons/types.d.ts").ConceptInput} concept */
function normalizeConcept(concept) {
  const normalized = {
    id: concept.id,
    title: concept.title.trim(),
    poolId: concept.poolId,
    options: concept.options.map((option) => ({
      id: option.id,
      text: option.text.trim(),
    })),
    misconceptions: (concept.misconceptions ?? []).map((misconception) => ({
      id: misconception.id,
      statement: misconception.statement.trim(),
      correctingCardId: misconception.correctingCardId,
    })),
    cards: concept.cards.map((card) => ({
      id: card.id,
      heading: card.heading.trim(),
      body: card.body.map((paragraph) => paragraph.trim()),
    })),
  };
  if (concept.statement !== undefined) {
    return { ...normalized, statement: concept.statement.trim() };
  }
  return normalized;
}

/**
 * @param {import("../lessons/types.d.ts").QuestionInput} question
 * @returns {import("../lessons/types.d.ts").Question}
 */
function normalizeQuestion(question) {
  const base = {
    id: question.id,
    conceptId: question.conceptId,
    poolId: question.poolId,
    type: question.type,
    reserved: question.reserved === true,
    stem: question.stem.trim(),
    correctingCardId: question.correctingCardId,
  };
  // Each branch restates `type` as its literal. The key is already in `base`, so its position in
  // the normalized object, and so the stored JSON, does not move.
  if (question.type === "mcq") {
    const feedback = Object.fromEntries(
      Object.keys(question.feedback).sort().map((
        id,
      ) => [id, String(question.feedback[id]).trim()]),
    );
    const authoredMap = question.map ?? {};
    const map = Object.fromEntries(
      Object.keys(authoredMap).sort().map((id) => [id, authoredMap[id]]),
    );
    return { ...base, type: question.type, key: question.key, map, feedback };
  }
  if (question.type === "numeric") {
    const numeric = {
      ...base,
      type: question.type,
      // Validation refuses a reserved numeric Question (numeric.reserved).
      reserved: /** @type {false} */ (false),
      answer: question.answer,
      tolerance: question.tolerance,
      feedback: question.feedback.trim(),
    };
    if (question.unit !== undefined) return { ...numeric, unit: question.unit };
    return numeric;
  }
  return {
    ...base,
    type: question.type,
    answer: question.answer.trim(),
    aliases: (question.aliases ?? []).map((alias) => alias.trim()),
    feedback: question.feedback.trim(),
  };
}

/** @param {import("../lessons/types.d.ts").SourceInput} source */
function normalizeSource(source) {
  return {
    type: source.type.trim(),
    title: source.title.trim(),
    locator: source.locator.trim(),
    capturedText: typeof source.capturedText === "string"
      ? source.capturedText
      : null,
  };
}

/**
 * @param {Report} report
 * @param {Diagnostic[]} diagnostics
 * @returns {RejectedLesson}
 */
function rejected(report, diagnostics = report.sorted()) {
  return {
    valid: false,
    schemaVersion: 1,
    fingerprint: null,
    diagnostics,
    normalizedLesson: null,
  };
}

/**
 * Resolve one JSON lesson document without persistence or outside services.
 * @param {unknown} input
 * @returns {Promise<Resolution>}
 */
export async function resolveLesson(input) {
  const report = new Report();
  const source = object(input);
  if (!source) {
    report.error(
      "document.object",
      "",
      "The lesson document must be a JSON object.",
    );
    return rejected(report);
  }
  if (exceedsDepth(source, MAX_DOCUMENT_DEPTH)) {
    report.error(
      "document.nesting",
      "",
      `The lesson document nests deeper than ${MAX_DOCUMENT_DEPTH} levels.`,
    );
    return rejected(report);
  }
  const bytes = new TextEncoder().encode(JSON.stringify(source)).byteLength;
  if (bytes > MAX_DOCUMENT_BYTES) {
    report.error(
      "document.size",
      "",
      `The lesson document is ${bytes} bytes; the limit is ${MAX_DOCUMENT_BYTES}.`,
    );
    return rejected(report);
  }

  // The published JSON Schema requires `schema`; `schemaVersion` alone does not name the contract.
  if (source.schema !== "lesson/v1") {
    report.error("schema.unsupported", "/schema", "Use schema lesson/v1.");
  }
  if (!text(source.title)) {
    report.error("title.required", "/title", "Title is required.");
  }
  if (!text(source.assumedKnowledge)) {
    report.error(
      "assumedKnowledge.required",
      "/assumedKnowledge",
      "Assumed knowledge is required.",
    );
  }

  const concepts = Array.isArray(source.concepts) ? source.concepts : [];
  const questions = Array.isArray(source.questions) ? source.questions : [];
  const sources = Array.isArray(source.sources) ? source.sources : [];
  if (!concepts.length) {
    report.error(
      "concepts.required",
      "/concepts",
      "At least one Concept is required.",
    );
  }
  if (!sources.length) {
    report.error(
      "sources.required",
      "/sources",
      "At least one structured source is required.",
    );
  }

  const lessonIds = {
    conceptIds: new Set(),
    poolIds: new Set(),
    cardIds: new Set(),
  };
  /** @type {Map<string, ConceptFacts>} */
  const byConcept = new Map();
  /** @type {ConceptFacts[]} */
  const facts = [];
  concepts.forEach((raw, index) => {
    const concept = resolveConcept(report, raw, index, lessonIds);
    facts.push(concept);
    if (concept.id && !byConcept.has(concept.id)) {
      byConcept.set(concept.id, concept);
    }
  });

  const questionIds = new Set();
  let mcqCount = 0;
  let keyLongestCount = 0;
  questions.forEach((raw, index) => {
    const result = resolveQuestion(report, raw, index, byConcept, questionIds);
    if (result.mcq) mcqCount++;
    if (result.keyLongest) keyLongestCount++;
  });
  if (mcqCount > 0 && keyLongestCount / mcqCount > KEY_LONGEST_MAX) {
    report.error(
      "lesson.key.longest",
      "/concepts",
      `The key is the longest option in ${keyLongestCount} of ${mcqCount} MCQs, above one third; length signals the answer.`,
    );
  }

  for (const concept of facts) {
    if (concept.reserved < 1) {
      report.error(
        "pool.reserved.missing",
        `${concept.path}/poolId`,
        "Each Pool marks at least one Question reserved for the Wrap-up.",
      );
    }
    if (concept.drawable < DRAWABLE_MIN) {
      report.error(
        "pool.drawable.minimum",
        `${concept.path}/poolId`,
        `The Pool has ${concept.drawable} drawable Questions; the Check needs ${DRAWABLE_MIN} (one ask plus two re-asks).`,
      );
    }
    for (const [misconceptionId, misconception] of concept.misconceptions) {
      if (!concept.usedMisconceptions.has(misconceptionId)) {
        report.error(
          "misconception.unused",
          `${concept.path}/misconceptions/${misconception.index}`,
          "No option in this Concept maps to this misconception.",
        );
      }
    }
  }

  sources.forEach((raw, index) => {
    const record = object(raw) ?? {};
    const path = `/sources/${index}`;
    for (const field of SOURCE_FIELDS) {
      if (!text(record[field])) {
        report.error(
          `source.${field}`,
          `${path}/${field}`,
          `Source ${field} is required.`,
        );
      }
    }
    if (
      record.capturedText !== undefined && record.capturedText !== null &&
      typeof record.capturedText !== "string"
    ) {
      report.error(
        "source.capturedText",
        `${path}/capturedText`,
        "capturedText must be a string or null.",
      );
    }
  });

  const provenance = object(source.provenance);
  if (
    !provenance || typeof provenance.status !== "string" ||
    !["provided", "declined"].includes(provenance.status)
  ) {
    report.error(
      "provenance.required",
      "/provenance",
      "Provide provenance metadata or set status to declined.",
    );
  } else if (provenance.status === "provided") {
    for (const field of PROVENANCE_FIELDS) {
      if (!text(provenance[field])) {
        report.error(
          `provenance.${field}`,
          `/provenance/${field}`,
          `${field} is required; use unknown when unavailable.`,
        );
      }
    }
  }

  const diagnostics = report.sorted();
  if (report.failed || !provenance) return rejected(report, diagnostics);

  // Every check above passed, so the document has the authored shape; normalization reads it as that.
  const valid = /** @type {import("../lessons/types.d.ts").LessonInput} */ (
    /** @type {unknown} */ (source)
  );
  const authoredProvenance = valid.provenance;
  /** @type {import("../lessons/types.d.ts").Provenance} */
  const normalizedProvenance = authoredProvenance.status === "declined"
    ? { status: "declined" }
    : /** @type {import("../lessons/types.d.ts").Provenance} */ (
      Object.fromEntries([
        ["status", "provided"],
        // PROVENANCE_FIELDS are the schema's provided-provenance fields; validation required each.
        ...PROVENANCE_FIELDS.map((field) => [
          field,
          authoredProvenance[
            /** @type {keyof typeof authoredProvenance} */ (field)
          ].trim(),
        ]),
      ])
    );
  /** @type {import("../lessons/types.d.ts").NormalizedLesson} */
  const normalizedLesson = {
    schemaVersion: 1,
    title: valid.title.trim(),
    assumedKnowledge: valid.assumedKnowledge.trim(),
    concepts: concepts.map((concept) =>
      normalizeConcept(
        /** @type {import("../lessons/types.d.ts").ConceptInput} */ (concept),
      )
    ),
    questions: questions.map((question) =>
      normalizeQuestion(
        /** @type {import("../lessons/types.d.ts").QuestionInput} */ (question),
      )
    ),
    sources: sources.map((record) =>
      normalizeSource(
        /** @type {import("../lessons/types.d.ts").SourceInput} */ (record),
      )
    ),
    provenance: normalizedProvenance,
  };
  const { provenance: _ignored, ...fingerprintInput } = normalizedLesson;
  const fingerprint = `sha256:${await sha256(
    JSON.stringify(sortValue(fingerprintInput)),
  )}`;
  return {
    valid: true,
    schemaVersion: 1,
    fingerprint,
    diagnostics,
    normalizedLesson,
  };
}

/**
 * The lesson/v1 contract. It is the one definition of the document's structure: the lesson types
 * in src/shared/lessons/types.d.ts are derived from it, so it keeps its literal types.
 */
export const lessonSchema = /** @type {const} */ ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://learn.joshhale.me/api/v1/schemas/lesson/v1",
  title: "learn.joshhale.me lesson/v1",
  description:
    "One lesson document authored by an external agent. This schema is necessary but not sufficient: it fixes shapes, counts and patterns. Rules that span items (option IDs named by MCQ keys and maps, Card membership, word counts, option-length ratio, the lesson-wide key-length rule, numeric answers covered by Cards, three drawable Questions and one reserved Question per Pool) are checked by the resolver at POST /api/v1/lesson-resolutions and by the downloadable validator. Every rule has a diagnostic code listed at /api/v1/diagnostics.",
  type: "object",
  additionalProperties: false,
  required: [
    "schema",
    "title",
    "assumedKnowledge",
    "concepts",
    "questions",
    "sources",
    "provenance",
  ],
  properties: {
    schema: {
      const: "lesson/v1",
      description: "The lesson schema version. Independent of the API version.",
    },
    schemaVersion: {
      const: 1,
      description:
        "Optional numeric alias of schema; the resolver accepts either.",
    },
    title: {
      type: "string",
      minLength: 1,
      description: "The lesson title shown on the shelf.",
    },
    assumedKnowledge: {
      type: "string",
      minLength: 1,
      description: "One sentence naming what the learner already knows.",
    },
    concepts: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/concept" },
      description:
        "Concepts in teaching order. Each owns its Cards, shared option set, misconceptions and one Pool ID.",
    },
    questions: {
      type: "array",
      minItems: 4,
      items: { $ref: "#/$defs/question" },
      description:
        "All Questions, top level, each naming its Concept and that Concept's Pool. Every Pool needs at least three drawable Questions and one reserved Question.",
    },
    sources: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/source" },
      description: "Structured sources the lesson was authored from.",
    },
    provenance: { $ref: "#/$defs/provenance" },
  },
  $defs: {
    uuid: {
      type: "string",
      pattern:
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
      description:
        "A UUIDv4. Concept, Pool, Card and Question IDs are UUIDv4 and unique across the lesson.",
    },
    localId: {
      type: "string",
      pattern: "^[A-Za-z0-9_-]{1,64}$",
      not: { enum: ["__proto__", "constructor", "prototype"] },
      description:
        "A short stable identifier, unique within its Concept. Used for option and misconception IDs.",
    },
    text: { type: "string", minLength: 1, pattern: "\\S" },
    stem: {
      type: "string",
      minLength: 1,
      pattern: "\\S",
      not: {
        pattern:
          "\\b([Tt]he ([Ss]econd|[Tt]hird|[Oo]ther|[Aa]bove|[Ff]ormer|[Ll]atter)|[Bb]esides the|[Oo]ther than the|[Tt]his approach|[Aa]s mentioned|[Tt]hat same|[Tt]he previous)\\b",
      },
      description:
        'The Question text. It must stand alone with the Cards removed, so it may not contain an unbound reference such as "the above" or "this approach".',
    },
    concept: {
      type: "object",
      additionalProperties: false,
      required: ["id", "title", "poolId", "options", "cards"],
      properties: {
        id: { $ref: "#/$defs/uuid" },
        title: {
          $ref: "#/$defs/text",
          description: "The Concept title shown on the rail.",
        },
        statement: {
          $ref: "#/$defs/text",
          description:
            "Optional. What the learner can do after the Concept, as one sentence.",
        },
        poolId: {
          $ref: "#/$defs/uuid",
          description:
            "The ID of this Concept's Pool. Questions reference it as poolId.",
        },
        options: {
          type: "array",
          minItems: OPTION_COUNT,
          maxItems: OPTION_COUNT,
          items: { $ref: "#/$defs/option" },
          description:
            "Exactly three options shared by every MCQ in the Concept. Option IDs are unique in the Concept. The longest text may be at most 1.35 times the shortest.",
        },
        misconceptions: {
          type: "array",
          items: { $ref: "#/$defs/misconception" },
          default: [],
          description:
            "The beliefs a wrong option reveals. Optional only for a Concept without MCQs; every misconception must be named by the map of some MCQ in this Concept.",
        },
        cards: {
          type: "array",
          minItems: 2,
          items: { $ref: "#/$defs/card" },
          description: "At least two Cards. A Card teaches one idea.",
        },
      },
    },
    option: {
      type: "object",
      additionalProperties: false,
      required: ["id", "text"],
      properties: {
        id: { $ref: "#/$defs/localId" },
        text: {
          $ref: "#/$defs/text",
          description: "The option as the learner reads it.",
        },
      },
    },
    misconception: {
      type: "object",
      additionalProperties: false,
      required: ["id", "statement", "correctingCardId"],
      properties: {
        id: { $ref: "#/$defs/localId" },
        statement: {
          $ref: "#/$defs/text",
          description:
            "The belief itself, written as the learner would hold it.",
        },
        correctingCardId: {
          $ref: "#/$defs/uuid",
          description: "A Card in the same Concept that corrects the belief.",
        },
      },
    },
    card: {
      type: "object",
      additionalProperties: false,
      required: ["id", "heading", "body"],
      properties: {
        id: { $ref: "#/$defs/uuid" },
        heading: { $ref: "#/$defs/text" },
        body: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/text" },
          description:
            "Paragraphs. Inline HTML such as <code> and <em> is allowed. 80 to 200 words across the Card after tags are stripped. Write at least two paragraphs; the corrective view shows only the first.",
        },
      },
    },
    questionBase: {
      type: "object",
      required: [
        "id",
        "conceptId",
        "poolId",
        "type",
        "stem",
        "correctingCardId",
      ],
      properties: {
        id: { $ref: "#/$defs/uuid" },
        conceptId: {
          $ref: "#/$defs/uuid",
          description: "The Concept this Question checks.",
        },
        poolId: {
          $ref: "#/$defs/uuid",
          description: "The poolId of that Concept.",
        },
        type: { enum: ["mcq", "numeric", "short"] },
        reserved: {
          type: "boolean",
          default: false,
          description:
            "A reserved Question is never drawn by a Concept Check; the Wrap-up draws reserved Questions first. Each Pool needs at least one.",
        },
        stem: { $ref: "#/$defs/stem" },
        correctingCardId: {
          $ref: "#/$defs/uuid",
          description:
            "The Card in the Question's Concept shown after I don't know, or after a wrong numeric or short answer.",
        },
      },
    },
    question: {
      type: "object",
      description: "One Question. The type selects the variant.",
      allOf: [{ $ref: "#/$defs/questionBase" }],
      oneOf: [{ $ref: "#/$defs/mcq" }, { $ref: "#/$defs/numeric" }, {
        $ref: "#/$defs/short",
      }],
      unevaluatedProperties: false,
    },
    mcq: {
      type: "object",
      required: ["type", "key", "map", "feedback"],
      properties: {
        type: { const: "mcq" },
        key: {
          $ref: "#/$defs/localId",
          description:
            "The option ID of the correct option in the Concept's shared set.",
        },
        map: {
          type: "object",
          minProperties: OPTION_COUNT - 1,
          maxProperties: OPTION_COUNT - 1,
          propertyNames: { $ref: "#/$defs/localId" },
          additionalProperties: { $ref: "#/$defs/localId" },
          description:
            "One entry per distractor: the option ID maps to the ID of the misconception choosing it reveals. The key is not in the map.",
        },
        feedback: {
          type: "object",
          minProperties: OPTION_COUNT,
          maxProperties: OPTION_COUNT,
          propertyNames: { $ref: "#/$defs/localId" },
          additionalProperties: { $ref: "#/$defs/text" },
          description:
            "One sentence or two per option, including the key, keyed by option ID.",
        },
      },
    },
    numeric: {
      type: "object",
      required: ["type", "answer", "tolerance", "feedback"],
      properties: {
        type: { const: "numeric" },
        reserved: {
          const: false,
          description: "A numeric Question is never reserved.",
        },
        answer: {
          type: "number",
          description:
            "The number, which must appear in a Card of the Question's Concept.",
        },
        tolerance: {
          type: "number",
          exclusiveMinimum: 0,
          description:
            "Accepted distance from the answer. Set it from the claim, not the decimal. Zero is not allowed.",
        },
        unit: {
          type: "string",
          description: "Optional unit shown beside the input.",
        },
        feedback: {
          $ref: "#/$defs/text",
          description: "Shown after any answer.",
        },
      },
    },
    short: {
      type: "object",
      required: ["type", "answer", "feedback"],
      properties: {
        type: { const: "short" },
        answer: {
          $ref: "#/$defs/text",
          description:
            "The canonical answer. Matching ignores case and surrounding whitespace.",
        },
        aliases: {
          type: "array",
          items: { $ref: "#/$defs/text" },
          description: "Optional other accepted spellings.",
        },
        feedback: {
          $ref: "#/$defs/text",
          description: "Shown after any answer.",
        },
      },
    },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["type", "title", "locator"],
      properties: {
        type: {
          $ref: "#/$defs/text",
          description:
            "The kind of source, such as specification, documentation, repository, commit or conversation.",
        },
        title: { $ref: "#/$defs/text" },
        locator: {
          $ref: "#/$defs/text",
          description:
            "A URL, path, commit SHA or other way to find the source again.",
        },
        capturedText: {
          type: ["string", "null"],
          description: "Optional excerpt captured at authoring time.",
        },
      },
    },
    provenance: {
      description:
        "Which agent authored the lesson. Provide every field or decline explicitly. Omission is invalid.",
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: [
            "status",
            "client",
            "harness",
            "model",
            "client_version",
            "session_reference",
          ],
          properties: {
            status: { const: "provided" },
            client: {
              $ref: "#/$defs/text",
              description: "The agent product, or unknown.",
            },
            harness: {
              $ref: "#/$defs/text",
              description: "The runtime the agent ran in, or unknown.",
            },
            model: {
              $ref: "#/$defs/text",
              description: "The model identifier, or unknown.",
            },
            client_version: {
              $ref: "#/$defs/text",
              description: "The client version, or unknown.",
            },
            session_reference: {
              $ref: "#/$defs/text",
              description:
                "An opaque reference to the authoring session, or unknown.",
            },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["status"],
          properties: { status: { const: "declined" } },
        },
      ],
    },
  },
});
