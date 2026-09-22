// The capability document: the one URL an agent needs. Every link is absolute so the
// document can be handed to another process and followed without knowing the host.
import { MAX_LESSON_BYTES } from "../http.ts";
import { CARD_WORDS_MAX, CARD_WORDS_MIN, DRAWABLE_MIN, MAX_DOCUMENT_DEPTH, OPTION_COUNT, OPTION_RATIO_MAX } from "../../shared/authoring/resolver.js";

/** Relative paths of every artifact the capability document links. Keys are stable. */
export const discoveryLinks = {
  self: "/api/v1/capabilities",
  openapi: "/openapi.json",
  schema: "/api/v1/schemas/lesson/v1",
  diagnostics: "/api/v1/diagnostics",
  docs: "/docs/api-v1.md",
  diagnosticsDocs: "/docs/diagnostics.md",
  validator: "/tools/lesson-validator.js",
  validatorTypes: "/tools/lesson-validator.d.ts",
  resolver: "/api/v1/lesson-resolutions",
  lessons: "/api/v1/lessons",
} as const;

export type DiscoveryLink = keyof typeof discoveryLinks;

/** Build the capability document for one origin, such as `https://learn.joshhale.me`. */
export function capabilitiesFor(origin: string) {
  const links = Object.fromEntries(Object.entries(discoveryLinks).map(([key, path]) => [key, new URL(path, origin).href])) as Record<DiscoveryLink, string>;
  return {
    name: "learn.joshhale.me",
    apiVersion: "v1",
    lessonSchema: "lesson/v1",
    invokesModels: false,
    authoringFormats: ["application/json"],
    links,
    authentication: {
      scheme: "bearer",
      tokenFormat: "learn_pat_<prefix>_<secret>",
      environmentVariable: "LEARN_TOKEN",
      scopes: { "lessons:read": "GET routes under /api/v1/lessons", "lessons:write": "POST routes under /api/v1/lessons" },
      publicRoutes: [links.resolver, links.self, links.openapi, links.schema, links.diagnostics, links.docs, links.diagnosticsDocs, links.validator, links.validatorTypes],
    },
    limits: {
      maxDocumentBytes: MAX_LESSON_BYTES,
      maxDocumentDepth: MAX_DOCUMENT_DEPTH,
      optionsPerConcept: OPTION_COUNT,
      optionLengthRatioMax: OPTION_RATIO_MAX,
      cardWordsMin: CARD_WORDS_MIN,
      cardWordsMax: CARD_WORDS_MAX,
      drawableQuestionsPerPoolMin: DRAWABLE_MIN,
      reservedQuestionsPerPoolMin: 1,
    },
    howToAuthor: [
      `Fetch ${links.schema} and ${links.docs}. Read the rules, then write one lesson/v1 JSON document.`,
      `Download ${links.validator} and run resolveLesson locally until it returns valid: true, or POST the document to ${links.resolver}.`,
      `Look up every diagnostic code at ${links.diagnostics} or ${links.diagnosticsDocs}; each entry says what to change.`,
      `POST the valid document to ${links.lessons} with a bearer token to create a private draft. The same document twice returns the same revision.`,
    ],
  };
}
