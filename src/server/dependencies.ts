import type { Authenticator } from "./auth.ts";
import type { LessonRepository } from "./repositories/lessons.ts";

/** Everything a route group needs from the outside world. Bootstrap decides the concrete adapters. */
export interface Dependencies {
  lessons: LessonRepository;
  auth: Authenticator;
}
