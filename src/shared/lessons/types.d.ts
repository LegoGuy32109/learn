// The lesson/v1 types, derived from the published JSON Schema (`lessonSchema` in
// src/shared/authoring/resolver.js). The schema is the one definition of the document's structure;
// nothing here restates it. What this file adds is only what normalization guarantees on top of it.

import type { FromSchema } from "json-schema-to-ts";
import type { lessonSchema } from "../authoring/resolver.js";

type Contract = typeof lessonSchema;

// ------------------------------------------------------------------------------------------------
// The authored document, as an agent writes it and as the resolver reads it once validation has
// passed. Properties the schema gives a `default` stay optional here.

export type LessonInput = FromSchema<
  Contract,
  { keepDefaultedPropertiesOptional: true }
>;
export type ConceptInput = LessonInput["concepts"][number];
export type QuestionInput = LessonInput["questions"][number];
export type SourceInput = LessonInput["sources"][number];

// ------------------------------------------------------------------------------------------------
// The normalized lesson the resolver emits (`normalizedLesson`), and as the server stores and serves
// it (plus `lessonId` and `revisionId`). Defaulted properties are always present.

type Defaulted = FromSchema<Contract>;
type DefaultedQuestion = Defaulted["questions"][number];

export type Concept = Defaulted["concepts"][number];
export type Option = Concept["options"][number];
export type Misconception = Concept["misconceptions"][number];
export type Card = Concept["cards"][number];

export type McqQuestion = Extract<DefaultedQuestion, { type: "mcq" }>;
export type NumericQuestion = Extract<DefaultedQuestion, { type: "numeric" }>;
/** Normalization always writes `aliases`, `[]` when none were authored. */
export type ShortQuestion =
  & Extract<DefaultedQuestion, { type: "short" }>
  & { aliases: string[] };
export type Question = McqQuestion | NumericQuestion | ShortQuestion;

/** Normalization always writes `capturedText`, `null` when none was authored. */
export type Source =
  & Omit<Defaulted["sources"][number], "capturedText">
  & { capturedText: string | null };

export type Provenance = Defaulted["provenance"];

/** The document names its schema with `schema`; the normalized lesson carries `schemaVersion: 1`. */
export type NormalizedLesson =
  & Omit<Defaulted, "schema" | "schemaVersion" | "questions" | "sources">
  & { schemaVersion: 1; questions: Question[]; sources: Source[] };

/** A stored Lesson Revision's content, as the API and the browser receive it. */
export type Lesson = NormalizedLesson & {
  lessonId: string;
  revisionId: string;
};
