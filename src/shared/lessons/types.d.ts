// The lesson/v1 document as the resolver emits it (`normalizedLesson`), and as the server stores
// and serves it (plus `lessonId` and `revisionId`). The resolver guarantees this shape: every
// optional input it defaults (misconceptions, aliases, map) is always present here.

export interface Option {
  id: string;
  text: string;
}

export interface Misconception {
  id: string;
  statement: string;
  correctingCardId: string;
}

export interface Card {
  id: string;
  heading: string;
  /** Paragraphs, each trusted inline HTML. */
  body: string[];
}

export interface Concept {
  id: string;
  title: string;
  poolId: string;
  statement?: string;
  options: Option[];
  misconceptions: Misconception[];
  cards: Card[];
}

interface QuestionBase {
  id: string;
  conceptId: string;
  poolId: string;
  /** Reserved for the Wrap-up; a Check never draws it. */
  reserved: boolean;
  stem: string;
  correctingCardId: string;
}

export interface McqQuestion extends QuestionBase {
  type: "mcq";
  /** The correct Option id from the Concept's shared set. */
  key: string;
  /** Wrong Option id to the Misconception id it reveals. */
  map: Record<string, string>;
  /** Option id to the feedback shown for it. */
  feedback: Record<string, string>;
}

export interface NumericQuestion extends QuestionBase {
  type: "numeric";
  answer: number;
  tolerance: number;
  unit?: string;
  feedback: string;
}

export interface ShortQuestion extends QuestionBase {
  type: "short";
  answer: string;
  aliases: string[];
  feedback: string;
}

export type Question = McqQuestion | NumericQuestion | ShortQuestion;

export interface Source {
  type: string;
  title: string;
  locator: string;
  capturedText: string | null;
}

export type Provenance =
  | { status: "declined" }
  | {
    status: "provided";
    client: string;
    harness: string;
    model: string;
    client_version: string;
    session_reference: string;
  };

export interface NormalizedLesson {
  schemaVersion: 1;
  title: string;
  assumedKnowledge: string;
  concepts: Concept[];
  questions: Question[];
  sources: Source[];
  provenance: Provenance;
}

/** A stored Lesson Revision's content, as the API and the browser receive it. */
export interface Lesson extends NormalizedLesson {
  lessonId: string;
  revisionId: string;
}

// ------------------------------------------------------------------------------------------------
// The authored document, as the resolver reads it once validation has passed. The optional fields
// are exactly the ones normalization fills in.

export interface ConceptInput extends Omit<Concept, "misconceptions"> {
  misconceptions?: Misconception[];
}

export type QuestionInput =
  | (Omit<McqQuestion, "reserved" | "map"> & {
    reserved?: boolean;
    map?: Record<string, string>;
  })
  | (Omit<NumericQuestion, "reserved"> & { reserved?: boolean })
  | (Omit<ShortQuestion, "reserved" | "aliases"> & {
    reserved?: boolean;
    aliases?: string[];
  });

export interface SourceInput {
  type: string;
  title: string;
  locator: string;
  capturedText?: string | null;
}

export interface LessonInput {
  title: string;
  assumedKnowledge: string;
  concepts: ConceptInput[];
  questions: QuestionInput[];
  sources: SourceInput[];
  provenance:
    | { status: "declined" }
    | ({ status: "provided" } & Record<string, string>);
}
