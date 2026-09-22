// Composition point: wires the domain route groups into one request handler.
// Bootstrap (main.ts) chooses the adapters; this file only composes.
import type { Dependencies } from "./server/dependencies.ts";
import { RejectingAuthenticator } from "./server/auth.ts";
import { FIXTURE_OWNER_ID, FixtureLessonRepository } from "./server/repositories/lessons.ts";
import { MemoryIdentityRepository } from "./server/repositories/identity.ts";
import { MemoryProgressRepository } from "./server/repositories/progress.ts";
import { PasskeyService } from "./server/identity/passkeys.ts";
import { HmacSessionCookies, randomSessionKey } from "./server/identity/sessions.ts";
import { redactedErrorText } from "./server/identity/redaction.ts";
import { problem } from "./server/http.ts";
import { dispatch } from "./server/routes/route.ts";
import { pageRoutes } from "./server/routes/pages.ts";
import { discoveryRoutes } from "./server/routes/discovery.ts";
import { lessonRoutes } from "./server/routes/lessons.ts";
import { identityRoutes } from "./server/routes/identity.ts";
import { progressRoutes } from "./server/routes/progress.ts";
import { assetRoutes } from "./server/routes/assets.ts";
import { pwaRoutes } from "./server/routes/pwa.ts";
import { pluginRoutes } from "./server/routes/plugin.ts";

export type { Dependencies };

/** Every route the server serves, in dispatch order. Exported so tests can compare it with the OpenAPI document. */
export function composeRoutes(dependencies: Dependencies) {
  return [
    ...pageRoutes(dependencies),
    ...discoveryRoutes(),
    ...pluginRoutes(),
    ...lessonRoutes(dependencies),
    ...pwaRoutes(dependencies),
    ...identityRoutes(dependencies),
    ...progressRoutes(dependencies),
    ...assetRoutes(),
  ];
}

/** The response header that names the revision which served a request. */
export const REVISION_HEADER = "x-learn-revision";

/** Set the revision header, copying the response when its headers are immutable. */
function withRevision(response: Response, revision: string): Response {
  try {
    response.headers.set(REVISION_HEADER, revision);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.set(REVISION_HEADER, revision);
    return copy;
  }
}

export function createApp(dependencies: Dependencies) {
  const revision = dependencies.revision ?? "local";
  const routes = composeRoutes(dependencies);
  async function respond(request: Request): Promise<Response> {
    try {
      const response = await dispatch(routes, request);
      return response ?? problem(404, "Not found", "No route matches this request.");
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return problem(404, "Not found", error.message);
      // A database or network failure anywhere in a handler, including inside
      // authentication, ends here as a 500 problem document. It is never a 401.
      console.error(redactedErrorText(error));
      return problem(500, "Internal server error", "The request could not be completed.");
    }
  }
  return async function handler(request: Request): Promise<Response> {
    return withRevision(await respond(request), revision);
  };
}

/** The account the database-free application knows about. Tests sign it in with a passkey. */
export const FIXTURE_ACCOUNT = { id: FIXTURE_OWNER_ID, displayName: "Josh" };

/**
 * Database-free dependencies backed by the bundled demo fixture and in-memory identity
 * storage. Tests override members, for example `auth`, to exercise one route group.
 */
export async function fixtureDependencies(): Promise<Dependencies> {
  const fixture = JSON.parse(await Deno.readTextFile(new URL("../fixtures/lessons/browser-http-cache.json", import.meta.url)));
  return {
    lessons: new FixtureLessonRepository(fixture),
    progress: new MemoryProgressRepository(),
    auth: new RejectingAuthenticator(),
    sessions: new HmacSessionCookies(randomSessionKey()),
    passkeys: new PasskeyService(new MemoryIdentityRepository([FIXTURE_ACCOUNT])),
    relyingParty: null,
  };
}

/** Database-free application, used by browser and server tests. */
export const app = createApp(await fixtureDependencies());
