// The bundled demo lesson, typed. A JSON import widens literal fields (a Question's "mcq" becomes
// string), so the fixture is narrowed to Lesson once, here. The resolver tests hold it to that shape:
// it resolves as valid lesson/v1, and "demo fixture satisfies structural invariants" checks the rest.
import raw from "../../fixtures/lessons/browser-http-cache.json" with {
  type: "json",
};
import type { Lesson } from "../../src/shared/lessons/types.d.ts";

export const DEMO_LESSON = raw as Lesson;

/** A lesson document as an agent submits it: no server-assigned IDs. */
export type AuthoredLesson = Omit<Lesson, "lessonId" | "revisionId">;

/** The demo lesson as an agent submits it: another title, and none of the server-assigned IDs. */
export function authoredLesson(title: string): AuthoredLesson {
  const { lessonId: _lessonId, revisionId: _revisionId, ...document } =
    structuredClone(DEMO_LESSON);
  return { ...document, title };
}
