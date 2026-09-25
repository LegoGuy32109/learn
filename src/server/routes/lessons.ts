// Lesson API: public resolution, authenticated immutable drafts, and the reads the phone shelf
// needs. The resolver always reruns here. Writes take a bearer token; reads take the browser
// session cookie or a bearer token, through the one current-account resolver.
import type { LessonsReply, ShelfReply } from "../../shared/api/v1.d.ts";
import { resolveLesson } from "../../shared/authoring/resolver.js";
import type { Principal } from "../auth.ts";
import type { Dependencies } from "../dependencies.ts";
import { json, jsonBody, problem } from "../http.ts";
import { currentAccount } from "../identity/current-account.ts";
import type {
  ResolvedLesson,
  StoredRevision,
} from "../repositories/lessons.ts";
import { type Route, route } from "./route.ts";

export const READ_SCOPE = "lessons:read";

async function principal(
  request: Request,
  dependencies: Dependencies,
  scope: string,
): Promise<Principal | Response> {
  const result = await dependencies.auth.authenticate(request, scope);
  if (result.ok) return result.principal;
  if (result.reason === "forbidden") {
    return problem(
      403,
      "Insufficient scope",
      `This token does not have the ${scope} scope.`,
    );
  }
  return problem(
    401,
    "Authentication required",
    "Use a valid, unexpired, unrevoked bearer token.",
  );
}

/** The account reading, from the session cookie or a `lessons:read` bearer token; otherwise the problem to send. */
async function reader(
  request: Request,
  dependencies: Dependencies,
): Promise<string | Response> {
  const account = await currentAccount(request, dependencies, READ_SCOPE);
  if (account && "forbidden" in account) {
    return problem(
      403,
      "Insufficient scope",
      `This token does not have the ${READ_SCOPE} scope.`,
    );
  }
  if (!account) {
    return problem(
      401,
      "Authentication required",
      "Sign in, or use a valid, unexpired, unrevoked bearer token.",
    );
  }
  return account.accountId;
}

/** Reads for one account are never shared through a cache. */
function privateJson(value: unknown): Response {
  return json(value, 200, { "cache-control": "private, no-store" });
}

/** Read and resolve the request body. Returns the response to send when it is not a valid lesson. */
async function resolvedBody(
  request: Request,
): Promise<ResolvedLesson | Response> {
  const parsed = await jsonBody(request);
  if (parsed instanceof Response) return parsed;
  const resolved = await resolveLesson(parsed);
  if (!resolved.valid || !resolved.normalizedLesson || !resolved.fingerprint) {
    return json(resolved, 422);
  }
  return resolved as ResolvedLesson;
}

function created(stored: StoredRevision): Response {
  const location =
    `/api/v1/lessons/${stored.lessonId}/revisions/${stored.revisionId}`;
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
      const accountId = await reader(request, dependencies);
      if (accountId instanceof Response) return accountId;
      return privateJson(
        {
          revisions: await dependencies.lessons.listMine(accountId),
        } satisfies LessonsReply,
      );
    }),

    route("GET", "/api/v1/shelf", async (request) => {
      const accountId = await reader(request, dependencies);
      if (accountId instanceof Response) return accountId;
      return privateJson(
        {
          lessons: await dependencies.lessons.shelf(accountId),
        } satisfies ShelfReply,
      );
    }),

    route("POST", "/api/v1/lessons", async (request) => {
      const authenticated = await principal(
        request,
        dependencies,
        "lessons:write",
      );
      if (authenticated instanceof Response) return authenticated;
      const resolved = await resolvedBody(request);
      if (resolved instanceof Response) return resolved;
      return created(
        await dependencies.lessons.createLesson(
          authenticated.accountId,
          resolved,
        ),
      );
    }),

    route(
      "POST",
      "/api/v1/lessons/:lessonId/revisions",
      async (request, params) => {
        const authenticated = await principal(
          request,
          dependencies,
          "lessons:write",
        );
        if (authenticated instanceof Response) return authenticated;
        const resolved = await resolvedBody(request);
        if (resolved instanceof Response) return resolved;
        return created(
          await dependencies.lessons.createRevision(
            authenticated.accountId,
            params.lessonId,
            resolved,
          ),
        );
      },
    ),

    route("GET", "/api/v1/lessons/:lessonId", async (request, params) => {
      const accountId = await reader(request, dependencies);
      if (accountId instanceof Response) return accountId;
      const stored = await dependencies.lessons.latestRevision(
        accountId,
        params.lessonId,
      );
      if (!stored) return problem(404, "Not found", "Lesson was not found.");
      return privateJson(stored);
    }),

    route(
      "GET",
      "/api/v1/lessons/:lessonId/revisions/:revisionId",
      async (request, params) => {
        const accountId = await reader(request, dependencies);
        if (accountId instanceof Response) return accountId;
        const stored = await dependencies.lessons.getRevision(
          accountId,
          params.lessonId,
          params.revisionId,
        );
        if (!stored) {
          return problem(
            404,
            "Not found",
            "Lesson Revision was not found.",
          );
        }
        return privateJson(stored);
      },
    ),
  ];
}
