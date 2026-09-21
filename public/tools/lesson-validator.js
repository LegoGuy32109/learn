// Generated from src/shared/authoring/resolver.js by deno task tools:generate.
// Inspectable, dependency-free lesson/v1 resolver for agents and local scripts.
// @ts-check

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUESTION_TYPES = new Set(["mcq", "numeric", "short"]);
const PROVENANCE_FIELDS = ["client", "harness", "model", "client_version", "session_reference"];

/** @param {unknown} value */
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : null;
}

/** @param {Array<any>} diagnostics @param {string} code @param {string} path @param {string} message */
function error(diagnostics, code, path, message) {
  diagnostics.push({ severity: "error", code, path, message });
}

/** @param {unknown} value @returns {unknown} */
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  const record = object(value);
  if (!record) return value;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortValue(record[key])]));
}

/** @param {string} text */
async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Resolve one JSON lesson document without persistence or outside services.
 * @param {unknown} input
 */
export async function resolveLesson(input) {
  /** @type {Array<{severity:string,code:string,path:string,message:string}>} */
  const diagnostics = [];
  const source = object(input);
  if (!source) {
    error(diagnostics, "document.object", "", "The lesson document must be a JSON object.");
    return { valid: false, schemaVersion: 1, fingerprint: null, diagnostics, normalizedLesson: null };
  }

  if (source.schema !== "lesson/v1" && source.schemaVersion !== 1) {
    error(diagnostics, "schema.unsupported", "/schema", "Use schema lesson/v1.");
  }
  if (typeof source.title !== "string" || !source.title.trim()) error(diagnostics, "title.required", "/title", "Title is required.");
  if (typeof source.assumedKnowledge !== "string" || !source.assumedKnowledge.trim()) error(diagnostics, "assumedKnowledge.required", "/assumedKnowledge", "Assumed knowledge is required.");

  const concepts = Array.isArray(source.concepts) ? source.concepts : [];
  const questions = Array.isArray(source.questions) ? source.questions : [];
  const sources = Array.isArray(source.sources) ? source.sources : [];
  if (!concepts.length) error(diagnostics, "concepts.required", "/concepts", "At least one Concept is required.");
  if (!sources.length) error(diagnostics, "sources.required", "/sources", "At least one structured source is required.");

  const conceptIds = new Set();
  const cardIds = new Set();
  const poolIds = new Set();
  const questionIds = new Set();

  concepts.forEach((raw, conceptIndex) => {
    const concept = object(raw) ?? {};
    const path = `/concepts/${conceptIndex}`;
    if (!UUID_V4.test(concept.id ?? "") || conceptIds.has(concept.id)) error(diagnostics, "concept.id", `${path}/id`, "Concept ID must be a unique UUIDv4.");
    else conceptIds.add(concept.id);
    if (typeof concept.title !== "string" || !concept.title.trim()) error(diagnostics, "concept.title", `${path}/title`, "Concept title is required.");
    if (!UUID_V4.test(concept.poolId ?? "") || poolIds.has(concept.poolId)) error(diagnostics, "pool.id", `${path}/poolId`, "Pool ID must be a unique UUIDv4.");
    else poolIds.add(concept.poolId);
    const cards = Array.isArray(concept.cards) ? concept.cards : [];
    if (cards.length < 2) error(diagnostics, "concept.cards.minimum", `${path}/cards`, "Each Concept needs at least two Cards.");
    cards.forEach((rawCard, cardIndex) => {
      const card = object(rawCard) ?? {};
      const cardPath = `${path}/cards/${cardIndex}`;
      if (!UUID_V4.test(card.id ?? "") || cardIds.has(card.id)) error(diagnostics, "card.id", `${cardPath}/id`, "Card ID must be a unique UUIDv4.");
      else cardIds.add(card.id);
      if (typeof card.heading !== "string" || !card.heading.trim()) error(diagnostics, "card.heading", `${cardPath}/heading`, "Card heading is required.");
      if (typeof card.body !== "string" || !card.body.trim()) error(diagnostics, "card.body", `${cardPath}/body`, "Card body is required.");
    });
  });

  questions.forEach((raw, index) => {
    const question = object(raw) ?? {};
    const path = `/questions/${index}`;
    if (!UUID_V4.test(question.id ?? "") || questionIds.has(question.id)) error(diagnostics, "question.id", `${path}/id`, "Question ID must be a unique UUIDv4.");
    else questionIds.add(question.id);
    if (!conceptIds.has(question.conceptId)) error(diagnostics, "question.concept", `${path}/conceptId`, "Question must reference a Concept in this lesson.");
    if (!poolIds.has(question.poolId)) error(diagnostics, "question.pool", `${path}/poolId`, "Question must reference a Pool in this lesson.");
    if (!QUESTION_TYPES.has(question.type)) error(diagnostics, "question.type", `${path}/type`, "Question type must be mcq, numeric, or short.");
    if (typeof question.stem !== "string" || !question.stem.trim()) error(diagnostics, "question.stem", `${path}/stem`, "Question stem is required.");
    if (!cardIds.has(question.correctingCardId)) error(diagnostics, "question.correctingCard", `${path}/correctingCardId`, "Question must reference its correcting Card.");
    if (question.type === "mcq") {
      const options = Array.isArray(question.options) ? question.options : [];
      if (options.length < 2) error(diagnostics, "mcq.options", `${path}/options`, "MCQ needs at least two options.");
      if (options.filter((option) => object(option)?.correct === true).length !== 1) error(diagnostics, "mcq.correct", `${path}/options`, "MCQ needs exactly one correct option.");
    } else if (question.type === "numeric") {
      if (typeof question.answer !== "number" || !Number.isFinite(question.answer)) error(diagnostics, "numeric.answer", `${path}/answer`, "Numeric answer must be a finite number.");
      if (question.tolerance !== undefined && (typeof question.tolerance !== "number" || question.tolerance < 0)) error(diagnostics, "numeric.tolerance", `${path}/tolerance`, "Tolerance must be a non-negative number.");
    } else if (question.type === "short" && (typeof question.answer !== "string" || !question.answer.trim())) {
      error(diagnostics, "short.answer", `${path}/answer`, "Short answer requires a canonical answer.");
    }
  });

  for (const [conceptIndex, raw] of concepts.entries()) {
    const concept = object(raw) ?? {};
    const count = questions.filter((question) => object(question)?.conceptId === concept.id && object(question)?.poolId === concept.poolId).length;
    if (count < 3) error(diagnostics, "pool.questions.minimum", `/concepts/${conceptIndex}/poolId`, "Each Concept Pool needs at least three Questions.");
  }

  sources.forEach((raw, index) => {
    const sourceRecord = object(raw) ?? {};
    const path = `/sources/${index}`;
    for (const field of ["type", "title", "locator"]) {
      if (typeof sourceRecord[field] !== "string" || !sourceRecord[field].trim()) error(diagnostics, `source.${field}`, `${path}/${field}`, `Source ${field} is required.`);
    }
  });

  const provenance = object(source.provenance);
  if (!provenance || !["provided", "declined"].includes(provenance.status)) {
    error(diagnostics, "provenance.required", "/provenance", "Provide provenance metadata or set status to declined.");
  } else if (provenance.status === "provided") {
    for (const field of PROVENANCE_FIELDS) {
      if (typeof provenance[field] !== "string" || !provenance[field].trim()) error(diagnostics, `provenance.${field}`, `/provenance/${field}`, `${field} is required; use unknown when unavailable.`);
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { valid: false, schemaVersion: 1, fingerprint: null, diagnostics, normalizedLesson: null };
  }

  const normalizedLesson = {
    schemaVersion: 1,
    title: source.title.trim(),
    assumedKnowledge: source.assumedKnowledge.trim(),
    concepts: structuredClone(concepts),
    questions: structuredClone(questions),
    sources: structuredClone(sources),
    provenance: structuredClone(provenance),
  };
  const fingerprintInput = { ...normalizedLesson, provenance: undefined };
  const fingerprint = `sha256:${await sha256(JSON.stringify(sortValue(fingerprintInput)))}`;
  return { valid: true, schemaVersion: 1, fingerprint, diagnostics, normalizedLesson };
}

export const lessonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://learn.joshhale.me/api/v1/schemas/lesson/v1",
  title: "learn.joshhale.me lesson/v1",
  type: "object",
  required: ["schema", "title", "assumedKnowledge", "concepts", "questions", "sources", "provenance"],
  properties: {
    schema: { const: "lesson/v1" },
    title: { type: "string", minLength: 1 },
    assumedKnowledge: { type: "string", minLength: 1 },
    concepts: { type: "array", minItems: 1 },
    questions: { type: "array", minItems: 3 },
    sources: { type: "array", minItems: 1 },
    provenance: { type: "object", required: ["status"] },
  },
};
