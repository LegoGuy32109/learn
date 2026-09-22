import type { Authenticator } from "./auth.ts";
import type { BuildProvider } from "./build.ts";
import type { PasskeyService } from "./identity/passkeys.ts";
import type { RelyingParty } from "./identity/relying-party.ts";
import type { SessionCookies } from "./identity/sessions.ts";
import type { LessonRepository } from "./repositories/lessons.ts";
import type { ProgressRepository } from "./repositories/progress.ts";

/** Everything a route group needs from the outside world. Bootstrap decides the concrete adapters. */
export interface Dependencies {
  lessons: LessonRepository;
  /** Synchronized learning and navigation events, one stream per account and Lesson. */
  progress: ProgressRepository;
  auth: Authenticator;
  /** Names the shell version for the service worker. Omitted, the shell on disk is hashed once per process. */
  build?: BuildProvider;
  sessions: SessionCookies;
  passkeys: PasskeyService;
  /** Pinned WebAuthn relying party, or null to accept plain localhost only. */
  relyingParty: RelyingParty | null;
  /** Names the serving revision in the `x-learn-revision` response header. Omitted, the header says `local`. */
  revision?: string;
}
