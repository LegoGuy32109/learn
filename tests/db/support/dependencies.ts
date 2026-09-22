// The full dependency set over one Turso client, the way main.ts wires it, for database tests.

import type { Dependencies } from "../../../src/app.ts";
import { TokenAuthenticator } from "../../../src/server/auth.ts";
import type { Client } from "../../../src/server/db.ts";
import { PasskeyService } from "../../../src/server/identity/passkeys.ts";
import { HmacSessionCookies, randomSessionKey } from "../../../src/server/identity/sessions.ts";
import { TursoIdentityRepository } from "../../../src/server/repositories/identity.ts";
import { TursoLessonRepository } from "../../../src/server/repositories/lessons.ts";

export function tursoDependencies(db: Client, clock: () => number = Date.now): Dependencies {
  return {
    lessons: new TursoLessonRepository(db),
    auth: new TokenAuthenticator(db, clock),
    sessions: new HmacSessionCookies(randomSessionKey(), clock),
    passkeys: new PasskeyService(new TursoIdentityRepository(db), clock),
    relyingParty: null,
  };
}
