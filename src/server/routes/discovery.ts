// API discovery documents for external agents: capabilities, OpenAPI skeleton and lesson schema.
import { lessonSchema } from "../../shared/authoring/resolver.js";
import { json } from "../http.ts";
import { type Route, route } from "./route.ts";

export const capabilities = {
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

export const openapi = {
  openapi: "3.1.0",
  info: { title: "learn.joshhale.me API", version: "1.0.0-alpha.1" },
  paths: {
    "/api/v1/lesson-resolutions": {
      post: { summary: "Validate and normalize a lesson without storing it" },
    },
    "/api/v1/lessons": {
      get: { summary: "List the authenticated author's revisions" },
      post: { summary: "Create a Lesson and its first draft revision" },
    },
    "/api/v1/lessons/{lessonId}/revisions": {
      post: { summary: "Create an immutable draft revision" },
    },
    "/api/v1/lessons/{lessonId}/revisions/{revisionId}": {
      get: { summary: "Read one owned Lesson Revision" },
    },
  },
};

export function discoveryRoutes(): Route[] {
  return [
    route("GET", "/.well-known/learn-joshhale.json", async () => json(capabilities)),
    route("GET", "/api/v1/capabilities", async () => json(capabilities)),
    route("GET", "/openapi.json", async () => json(openapi)),
    route("GET", "/api/v1/schemas/lesson/v1", async () => json(lessonSchema)),
  ];
}
