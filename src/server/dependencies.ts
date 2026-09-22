import type { Authenticator } from "./auth.ts";
import type { BuildProvider } from "./build.ts";
import type { LessonRepository } from "./repositories/lessons.ts";

/** Everything a route group needs from the outside world. Bootstrap decides the concrete adapters. */
export interface Dependencies {
  lessons: LessonRepository;
  auth: Authenticator;
  /** Names the shell version for the service worker. Omitted, the shell on disk is hashed once per process. */
  build?: BuildProvider;
}
