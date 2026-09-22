// API discovery documents for external agents: capabilities, OpenAPI, lesson schema and the
// diagnostics reference. Links are absolute, built from the request origin.
import { lessonSchema } from "../../shared/authoring/resolver.js";
import { diagnosticsReference } from "../../shared/authoring/diagnostics.js";
import { capabilitiesFor } from "../api-docs/capabilities.ts";
import { openapiDocument } from "../api-docs/openapi.ts";
import { json } from "../http.ts";
import { type Route, route } from "./route.ts";

function origin(request: Request): string {
  return new URL(request.url).origin;
}

export function discoveryRoutes(): Route[] {
  const capabilities = async (request: Request) => json(capabilitiesFor(origin(request)));
  return [
    route("GET", "/.well-known/learn-joshhale.json", capabilities),
    route("GET", "/api/v1/capabilities", capabilities),
    route("GET", "/openapi.json", async (request) => json(openapiDocument(origin(request)))),
    route("GET", "/api/v1/schemas/lesson/v1", async () => json(lessonSchema)),
    route("GET", "/api/v1/diagnostics", async () => json(diagnosticsReference)),
  ];
}
