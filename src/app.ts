// Composition point: wires the domain route groups into one request handler.
// Bootstrap (main.ts) chooses the adapters; this file only composes.
import type { Dependencies } from "./server/dependencies.ts";
import { RejectingAuthenticator } from "./server/auth.ts";
import { FixtureLessonRepository } from "./server/repositories/lessons.ts";
import { MemoryIdentityRepository } from "./server/repositories/identity.ts";
import { PasskeyService } from "./server/identity/passkeys.ts";
import { HmacSessionCookies, randomSessionKey } from "./server/identity/sessions.ts";
import { redactedErrorText } from "./server/identity/redaction.ts";
import { problem } from "./server/http.ts";
import { dispatch } from "./server/routes/route.ts";
import { pageRoutes } from "./server/routes/pages.ts";
import { discoveryRoutes } from "./server/routes/discovery.ts";
import { lessonRoutes } from "./server/routes/lessons.ts";
import { identityRoutes } from "./server/routes/identity.ts";
import { assetRoutes } from "./server/routes/assets.ts";
import { pwaRoutes } from "./server/routes/pwa.ts";

export type { Dependencies };

export function createApp(dependencies: Dependencies) {
  const routes = [
    ...pageRoutes(dependencies),
    ...discoveryRoutes(),
    ...lessonRoutes(dependencies),
    ...pwaRoutes(dependencies),
    ...identityRoutes(dependencies),
    ...assetRoutes(),
  ];
  return async function handler(request: Request): Promise<Response> {
    try {
      const response = await dispatch(routes, request);
      return response ?? problem(404, "Not found", "No route matches this request.");
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return problem(404, "Not found", error.message);
      console.error(redactedErrorText(error));
      return problem(500, "Internal server error", "The request could not be completed.");
    }
  };
}

/** The account the database-free application knows about. Tests sign it in with a passkey. */
export const FIXTURE_ACCOUNT = { id: "fixture-owner", displayName: "Josh" };

/**
 * Database-free dependencies backed by the bundled demo fixture and in-memory identity
 * storage. Tests override members, for example `auth`, to exercise one route group.
 */
export async function fixtureDependencies(): Promise<Dependencies> {
  const fixture = JSON.parse(await Deno.readTextFile(new URL("../fixtures/lessons/browser-http-cache.json", import.meta.url)));
  return {
    lessons: new FixtureLessonRepository(fixture),
    auth: new RejectingAuthenticator(),
    sessions: new HmacSessionCookies(randomSessionKey()),
    passkeys: new PasskeyService(new MemoryIdentityRepository([FIXTURE_ACCOUNT])),
    relyingParty: null,
  };
}

/** Database-free application, used by browser and server tests. */
export const app = createApp(await fixtureDependencies());
