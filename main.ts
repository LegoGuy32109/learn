import { createApp } from "./src/app.ts";
import { TokenAuthenticator } from "./src/server/auth.ts";
import { createDb } from "./src/server/db.ts";
import { PasskeyService } from "./src/server/identity/passkeys.ts";
import { configuredRelyingParty } from "./src/server/identity/relying-party.ts";
import { HmacSessionCookies, randomSessionKey, sessionKeyFromEnv } from "./src/server/identity/sessions.ts";
import { TursoIdentityRepository } from "./src/server/repositories/identity.ts";
import { TursoLessonRepository } from "./src/server/repositories/lessons.ts";

/**
 * Deno Deploy sets DENO_DEPLOY_BUILD_ID to the id of the running revision. A
 * local run whose --allow-env list omits it is still a valid way to start, so a
 * denied read counts as "local".
 */
function servingRevision(): string {
  try {
    return Deno.env.get("DENO_DEPLOY_BUILD_ID") ?? "local";
  } catch (error) {
    if (error instanceof Deno.errors.NotCapable) return "local";
    throw error;
  }
}

const db = createDb();
let sessionKey = sessionKeyFromEnv(Deno.env.get("LEARN_SESSION_KEY"));
if (!sessionKey) {
  console.warn("LEARN_SESSION_KEY is not set; browser sessions will not survive a restart. Run deno task db:owner to add one to .env.");
  sessionKey = randomSessionKey();
}
const app = createApp({
  lessons: new TursoLessonRepository(db),
  auth: new TokenAuthenticator(db),
  sessions: new HmacSessionCookies(sessionKey),
  passkeys: new PasskeyService(new TursoIdentityRepository(db)),
  relyingParty: configuredRelyingParty({ rpId: Deno.env.get("WEBAUTHN_RP_ID"), origins: Deno.env.get("WEBAUTHN_ORIGINS") }),
  revision: servingRevision(),
});
const port = Number(Deno.env.get("PORT") ?? 8000);
Deno.serve({ port }, app);
