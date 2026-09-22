// Generated from src/shared/authoring/diagnostics.js by deno task tools:generate.
/** Every diagnostic code the resolver can emit. Documented at /api/v1/diagnostics and /docs/diagnostics.md. */
export type DiagnosticCode =
  | "document.object"
  | "document.nesting"
  | "document.size"
  | "schema.unsupported"
  | "title.required"
  | "assumedKnowledge.required"
  | "concepts.required"
  | "sources.required"
  | "concept.id"
  | "concept.title"
  | "concept.statement"
  | "pool.id"
  | "concept.options.count"
  | "concept.option.id"
  | "concept.option.id.invalid"
  | "concept.option.text"
  | "concept.options.ratio"
  | "concept.cards.minimum"
  | "card.id"
  | "card.heading"
  | "card.body.paragraphs"
  | "card.words"
  | "card.paragraphs.single"
  | "misconception.id"
  | "misconception.id.invalid"
  | "misconception.statement"
  | "misconception.card"
  | "misconception.unused"
  | "question.id"
  | "question.concept"
  | "question.pool"
  | "question.type"
  | "question.stem"
  | "question.stem.unbound"
  | "question.reserved"
  | "question.correctingCard"
  | "question.feedback"
  | "mcq.key"
  | "mcq.feedback.missing"
  | "mcq.feedback.extra"
  | "mcq.map.missing"
  | "mcq.map.unknown"
  | "mcq.map.extra"
  | "numeric.reserved"
  | "numeric.answer"
  | "numeric.answer.uncovered"
  | "numeric.tolerance.missing"
  | "numeric.tolerance"
  | "numeric.unit"
  | "short.answer"
  | "short.aliases"
  | "lesson.key.longest"
  | "pool.reserved.missing"
  | "pool.drawable.minimum"
  | "source.type"
  | "source.title"
  | "source.locator"
  | "source.capturedText"
  | "provenance.required"
  | "provenance.client"
  | "provenance.harness"
  | "provenance.model"
  | "provenance.client_version"
  | "provenance.session_reference";
export interface Diagnostic { severity: "error" | "warning"; code: DiagnosticCode; path: string; message: string; }
export interface Resolution { valid: boolean; schemaVersion: 1; fingerprint: string | null; diagnostics: Diagnostic[]; normalizedLesson: Record<string, unknown> | null; }
export declare function resolveLesson(input: unknown): Promise<Resolution>;
export declare const lessonSchema: Record<string, unknown>;
export declare const MAX_DOCUMENT_BYTES: number;
export declare const MAX_DOCUMENT_DEPTH: number;
export declare const OPTION_COUNT: number;
export declare const CARD_WORDS_MIN: number;
export declare const CARD_WORDS_MAX: number;
export declare const OPTION_RATIO_MAX: number;
export declare const KEY_LONGEST_MAX: number;
export declare const DRAWABLE_MIN: number;
