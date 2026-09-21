import { page } from "./server/views/page.ts";
import { resolveLesson, lessonSchema } from "./shared/authoring/resolver.js";
import type { Authenticator } from "./server/auth.ts";
import { RejectingAuthenticator } from "./server/auth.ts";
import type { LessonRepository } from "./server/repositories/lessons.ts";
import { FixtureLessonRepository } from "./server/repositories/lessons.ts";

const fixture = JSON.parse(await Deno.readTextFile(new URL("../fixtures/lessons/browser-http-cache.json", import.meta.url)));
const mime: Record<string, string> = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
const MAX_LESSON_BYTES = 1_000_000;

interface Dependencies {
  lessons: LessonRepository;
  auth: Authenticator;
}

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

function problem(status: number, title: string, detail: string): Response {
  return new Response(JSON.stringify({ type: "about:blank", title, status, detail }), {
    status,
    headers: { "content-type": "application/problem+json; charset=utf-8" },
  });
}

async function body(request: Request): Promise<unknown | Response> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_LESSON_BYTES) return problem(413, "Request too large", `Lesson source is limited to ${MAX_LESSON_BYTES} bytes.`);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_LESSON_BYTES) return problem(413, "Request too large", `Lesson source is limited to ${MAX_LESSON_BYTES} bytes.`);
  try {
    return JSON.parse(text);
  } catch {
    return problem(400, "Invalid JSON", "The request body must contain one JSON lesson document.");
  }
}

async function principal(request: Request, dependencies: Dependencies, scope: string) {
  const authenticated = await dependencies.auth.authenticate(request, scope);
  return authenticated ?? problem(401, "Authentication required", `Use a bearer token with the ${scope} scope.`);
}

const capabilities = {
  name: "learn.joshhale.me",
  apiVersion: "v1",
  invokesModels: false,
  authoringFormats: ["application/json"],
  links: {
    openapi: "/openapi.json",
    schema: "/api/v1/schemas/lesson/v1",
    resolver: "/api/v1/lesson-resolutions",
    validator: "/tools/lesson-validator.js",
  },
};

const openapi = {
  openapi: "3.1.0",
  info: { title: "learn.joshhale.me API", version: "1.0.0-alpha.1" },
  paths: {
    "/api/v1/lesson-resolutions": { post: { summary: "Validate and normalize a lesson without storing it" } },
    "/api/v1/lessons": { get: { summary: "List the authenticated author's revisions" }, post: { summary: "Create a Lesson and its first draft revision" } },
    "/api/v1/lessons/{lessonId}/revisions": { post: { summary: "Create an immutable draft revision" } },
    "/api/v1/lessons/{lessonId}/revisions/{revisionId}": { get: { summary: "Read one owned Lesson Revision" } },
  },
};

export function createApp(dependencies: Dependencies) {
  return async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/learn/"))) {
        return new Response(page(await dependencies.lessons.featured()), { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (request.method === "GET" && ["/.well-known/learn-joshhale.json", "/api/v1/capabilities"].includes(url.pathname)) return json(capabilities);
      if (request.method === "GET" && url.pathname === "/openapi.json") return json(openapi);
      if (request.method === "GET" && url.pathname === "/api/v1/schemas/lesson/v1") return json(lessonSchema);

      if (request.method === "POST" && url.pathname === "/api/v1/lesson-resolutions") {
        const parsed = await body(request);
        if (parsed instanceof Response) return parsed;
        const resolved = await resolveLesson(parsed);
        return json(resolved, resolved.valid ? 200 : 422);
      }

      if (url.pathname === "/api/v1/lessons" && request.method === "GET") {
        const authenticated = await principal(request, dependencies, "lessons:read");
        if (authenticated instanceof Response) return authenticated;
        return json({ revisions: await dependencies.lessons.listMine(authenticated.accountId) });
      }

      if (url.pathname === "/api/v1/lessons" && request.method === "POST") {
        const authenticated = await principal(request, dependencies, "lessons:write");
        if (authenticated instanceof Response) return authenticated;
        const parsed = await body(request);
        if (parsed instanceof Response) return parsed;
        const resolved = await resolveLesson(parsed);
        if (!resolved.valid || !resolved.normalizedLesson || !resolved.fingerprint) return json(resolved, 422);
        const stored = await dependencies.lessons.createLesson(authenticated.accountId, resolved as any);
        return json(stored, 201, { location: `/api/v1/lessons/${stored.lessonId}/revisions/${stored.revisionId}` });
      }

      const revisions = url.pathname.match(/^\/api\/v1\/lessons\/([^/]+)\/revisions$/);
      if (request.method === "POST" && revisions) {
        const authenticated = await principal(request, dependencies, "lessons:write");
        if (authenticated instanceof Response) return authenticated;
        const parsed = await body(request);
        if (parsed instanceof Response) return parsed;
        const resolved = await resolveLesson(parsed);
        if (!resolved.valid || !resolved.normalizedLesson || !resolved.fingerprint) return json(resolved, 422);
        const stored = await dependencies.lessons.createRevision(authenticated.accountId, revisions[1], resolved as any);
        return json(stored, 201, { location: `/api/v1/lessons/${stored.lessonId}/revisions/${stored.revisionId}` });
      }

      const revision = url.pathname.match(/^\/api\/v1\/lessons\/([^/]+)\/revisions\/([^/]+)$/);
      if (request.method === "GET" && revision) {
        const authenticated = await principal(request, dependencies, "lessons:read");
        if (authenticated instanceof Response) return authenticated;
        const stored = await dependencies.lessons.getRevision(authenticated.accountId, revision[1], revision[2]);
        return stored ? json(stored) : problem(404, "Not found", "Lesson Revision was not found.");
      }

      if (request.method === "GET" && (url.pathname.startsWith("/css/") || url.pathname.startsWith("/js/") || url.pathname.startsWith("/tools/"))) {
        const file = new URL(`../public${url.pathname}`, import.meta.url);
        try {
          const bytes = await Deno.readFile(file);
          const extension = url.pathname.slice(url.pathname.lastIndexOf("."));
          return new Response(bytes, { headers: { "content-type": mime[extension] ?? "application/octet-stream" } });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      }
      return problem(404, "Not found", "No route matches this request.");
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return problem(404, "Not found", error.message);
      console.error(error);
      return problem(500, "Internal server error", "The request could not be completed.");
    }
  };
}

export const app = createApp({ lessons: new FixtureLessonRepository(fixture), auth: new RejectingAuthenticator() });
