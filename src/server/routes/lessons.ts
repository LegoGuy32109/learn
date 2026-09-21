// Lesson API: public resolution and authenticated immutable drafts. The resolver always reruns here.
import { resolveLesson } from "../../shared/authoring/resolver.js";
import type { Principal } from "../auth.ts";
import type { Dependencies } from "../dependencies.ts";
import { json, jsonBody, problem } from "../http.ts";
import type { ResolvedLesson, StoredRevision } from "../repositories/lessons.ts";
import { type Route, route } from "./route.ts";

async function principal(request: Request, dependencies: Dependencies, scope: string): Promise<Principal | Response> {
  const result = await dependencies.auth.authenticate(request, scope);
  if (result.ok) return result.principal;
  if (result.reason === "forbidden") return problem(403, "Insufficient scope", `This token does not have the ${scope} scope.`);
  return problem(401, "Authentication required", "Use a valid, unexpired, unrevoked bearer token.");
}

/** Read and resolve the request body. Returns the response to send when it is not a valid lesson. */
async function resolvedBody(request: Request): Promise<ResolvedLesson | Response> {
  const parsed = await jsonBody(request);
  if (parsed instanceof Response) return parsed;
  const resolved = await resolveLesson(parsed);
  if (!resolved.valid || !resolved.normalizedLesson || !resolved.fingerprint) return json(resolved, 422);
  return resolved as ResolvedLesson;
}

function created(stored: StoredRevision): Response {
  const location = `/api/v1/lessons/${stored.lessonId}/revisions/${stored.revisionId}`;
  return json(stored, 201, { location });
}

export function lessonRoutes(dependencies: Dependencies): Route[] {
  return [
    route("POST", "/api/v1/lesson-resolutions", async (request) => {
      const parsed = await jsonBody(request);
      if (parsed instanceof Response) return parsed;
      const resolved = await resolveLesson(parsed);
      return json(resolved, resolved.valid ? 200 : 422);
    }),

    route("GET", "/api/v1/lessons", async (request) => {
      const authenticated = await principal(request, dependencies, "lessons:read");
      if (authenticated instanceof Response) return authenticated;
      return json({ revisions: await dependencies.lessons.listMine(authenticated.accountId) });
    }),

    route("POST", "/api/v1/lessons", async (request) => {
      const authenticated = await principal(request, dependencies, "lessons:write");
      if (authenticated instanceof Response) return authenticated;
      const resolved = await resolvedBody(request);
      if (resolved instanceof Response) return resolved;
      return created(await dependencies.lessons.createLesson(authenticated.accountId, resolved));
    }),

    route("POST", "/api/v1/lessons/:lessonId/revisions", async (request, params) => {
      const authenticated = await principal(request, dependencies, "lessons:write");
      if (authenticated instanceof Response) return authenticated;
      const resolved = await resolvedBody(request);
      if (resolved instanceof Response) return resolved;
      return created(await dependencies.lessons.createRevision(authenticated.accountId, params.lessonId, resolved));
    }),

    route("GET", "/api/v1/lessons/:lessonId/revisions/:revisionId", async (request, params) => {
      const authenticated = await principal(request, dependencies, "lessons:read");
      if (authenticated instanceof Response) return authenticated;
      const stored = await dependencies.lessons.getRevision(authenticated.accountId, params.lessonId, params.revisionId);
      if (!stored) return problem(404, "Not found", "Lesson Revision was not found.");
      return json(stored);
    }),
  ];
}
