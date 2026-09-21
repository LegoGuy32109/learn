// Composition point: wires the domain route groups into one request handler.
// Bootstrap (main.ts) chooses the adapters; this file only composes.
import type { Dependencies } from "./server/dependencies.ts";
import { RejectingAuthenticator } from "./server/auth.ts";
import { FixtureLessonRepository } from "./server/repositories/lessons.ts";
import { redactedErrorText } from "./server/identity/redaction.ts";
import { problem } from "./server/http.ts";
import { dispatch } from "./server/routes/route.ts";
import { pageRoutes } from "./server/routes/pages.ts";
import { discoveryRoutes } from "./server/routes/discovery.ts";
import { lessonRoutes } from "./server/routes/lessons.ts";
import { assetRoutes } from "./server/routes/assets.ts";

export type { Dependencies };

export function createApp(dependencies: Dependencies) {
  const routes = [
    ...pageRoutes(dependencies),
    ...discoveryRoutes(),
    ...lessonRoutes(dependencies),
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

/** Database-free application backed by the bundled demo fixture, used by browser and server tests. */
const fixture = JSON.parse(await Deno.readTextFile(new URL("../fixtures/lessons/browser-http-cache.json", import.meta.url)));
export const app = createApp({ lessons: new FixtureLessonRepository(fixture), auth: new RejectingAuthenticator() });
