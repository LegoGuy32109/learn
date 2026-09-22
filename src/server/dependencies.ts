import type { Authenticator } from "./auth.ts";
import type { PasskeyService } from "./identity/passkeys.ts";
import type { RelyingParty } from "./identity/relying-party.ts";
import type { SessionCookies } from "./identity/sessions.ts";
import type { LessonRepository } from "./repositories/lessons.ts";

/** Everything a route group needs from the outside world. Bootstrap decides the concrete adapters. */
export interface Dependencies {
  lessons: LessonRepository;
  auth: Authenticator;
  sessions: SessionCookies;
  passkeys: PasskeyService;
  /** Pinned WebAuthn relying party, or null to accept plain localhost only. */
  relyingParty: RelyingParty | null;
}
