// The OpenAPI 3.1 document for every route the server serves to agents. Request and
// response examples are produced by running the real resolver over the demo lesson, so
// the document cannot show a shape the server does not return.
import { lessonSchema, resolveLesson } from "../../shared/authoring/resolver.js";
import { DIAGNOSTIC_CODES, diagnosticsReference } from "../../shared/authoring/diagnostics.js";
import { MAX_LESSON_BYTES } from "../http.ts";
import { capabilitiesFor } from "./capabilities.ts";

/** The canonical origin. Per-request documents substitute the request origin in `servers`. */
export const CANONICAL_ORIGIN = "https://learn.joshhale.me";

export const exampleLesson: Record<string, unknown> = JSON.parse(
  await Deno.readTextFile(new URL("../../../fixtures/authoring/valid/demo-without-ids.json", import.meta.url)),
);

const resolved = await resolveLesson(exampleLesson);
if (!resolved.valid) throw new Error("The OpenAPI example lesson must resolve valid");

const invalidLesson = structuredClone(exampleLesson) as Record<string, any>;
invalidLesson.concepts[0].cards[0].body = ["A Card that is far too short."];
const rejected = await resolveLesson(invalidLesson);

const exampleLessonId = "6f1c1c2a-3b1e-4b6f-9a1c-2f6d8e4b7a10";
const exampleRevisionId = "0b7e5b4e-8c2d-4f1a-b3e6-1d9a7c5e2f33";
const exampleRevision = {
  lessonId: exampleLessonId,
  revisionId: exampleRevisionId,
  revisionNumber: 1,
  status: "draft",
  fingerprint: resolved.fingerprint,
  content: { ...resolved.normalizedLesson, lessonId: exampleLessonId, revisionId: exampleRevisionId },
  createdAt: 1758412800000,
};

function problem(status: number, title: string, detail: string) {
  return { type: "about:blank", title, status, detail };
}

/** A media object whose example lives once under components.examples. */
function media(ref: string, exampleName: string) {
  return { schema: { $ref: ref }, examples: { default: { $ref: `#/components/examples/${exampleName}` } } };
}

function problemResponse(description: string, example: Record<string, unknown>) {
  return {
    description,
    content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" }, example } },
  };
}

const problems = {
  400: problemResponse("The body is not JSON.", problem(400, "Invalid JSON", "The request body must contain one JSON lesson document.")),
  401: problemResponse("The bearer token is missing, malformed, unknown, expired or revoked.", problem(401, "Authentication required", "Use a valid, unexpired, unrevoked bearer token.")),
  403: problemResponse("The token is valid but lacks the scope the route needs.", problem(403, "Insufficient scope", "This token does not have the lessons:write scope.")),
  404: problemResponse("No route matches, or the account does not own the resource.", problem(404, "Not found", "Lesson Revision was not found.")),
  413: problemResponse(`The body is over ${MAX_LESSON_BYTES} bytes.`, problem(413, "Request too large", `Lesson source is limited to ${MAX_LESSON_BYTES} bytes.`)),
  501: problemResponse("Passkeys are not configured for this origin: WEBAUTHN_RP_ID and WEBAUTHN_ORIGINS are unset and the origin is not plain localhost.", problem(501, "Passkeys not configured", "This deployment has no relying party for this origin.")),
};

const lessonBody = {
  required: true,
  description: "One lesson/v1 document. The schema is served at /api/v1/schemas/lesson/v1 and inlined as the Lesson component.",
  content: { "application/json": media("#/components/schemas/Lesson", "lesson") },
};

const resolutionFailed = {
  description: "The document failed resolution. The body is a Resolution with valid false, a null fingerprint and at least one error diagnostic. Every code is listed at /api/v1/diagnostics.",
  content: { "application/json": media("#/components/schemas/Resolution", "resolutionFailed") },
};

const createdRevision = {
  description: "The draft revision, created now or returned again for the same fingerprint and account.",
  headers: { Location: { description: "The URL of the revision.", schema: { type: "string" }, example: `/api/v1/lessons/${exampleLessonId}/revisions/${exampleRevisionId}` } },
  content: { "application/json": media("#/components/schemas/StoredRevision", "storedRevision") },
};

const lessonIdParameter = {
  name: "lessonId",
  in: "path",
  required: true,
  description: "The stable Lesson ID returned by POST /api/v1/lessons.",
  schema: { type: "string", format: "uuid" },
  example: exampleLessonId,
};

const revisionIdParameter = {
  name: "revisionId",
  in: "path",
  required: true,
  description: "The Lesson Revision ID returned when the draft was created.",
  schema: { type: "string", format: "uuid" },
  example: exampleRevisionId,
};

function jsonResponse(description: string, ref: string, exampleName?: string) {
  const body = exampleName ? media(ref, exampleName) : { schema: { $ref: ref } };
  return { description, content: { "application/json": body } };
}

function textResponse(description: string, mediaType: string) {
  return { description, content: { [mediaType]: { schema: { type: "string" } } } };
}

/** Build the OpenAPI document for one origin. Documents served by the app use the request origin. */
export function openapiDocument(origin: string = CANONICAL_ORIGIN) {
  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "learn.joshhale.me API",
      version: "1.0.0-alpha.2",
      summary: "Validate and store lesson/v1 documents written by external agents.",
      description: [
        "The API accepts lesson content authored by external agents and never invokes an AI model. JSON is the only authoring format.",
        "Public routes: discovery documents, the downloadable validator and the write-free resolver. Authenticated routes create and read immutable private draft revisions.",
        "The server always reruns the resolver on a draft; it never trusts a normalized object asserted by a client. There is no publish API and no validation bypass.",
        `Start at ${origin}/api/v1/capabilities. Human documentation: ${origin}/docs/api-v1.md. Diagnostic codes: ${origin}/docs/diagnostics.md.`,
      ].join("\n\n"),
    },
    servers: [{ url: origin }],
    tags: [
      { name: "discovery", description: "Public documents an agent fetches to learn the contract." },
      { name: "resolution", description: "Validate a lesson without storing it." },
      { name: "drafts", description: "Immutable private Lesson Revisions owned by the token's account." },
      { name: "sign-in", description: "Phone sign-in: one-time invites, passkey ceremonies and the browser session cookie." },
    ],
    paths: {
      "/.well-known/learn-joshhale.json": {
        get: { tags: ["discovery"], operationId: "wellKnownCapabilities", summary: "Capability document (well-known alias)", responses: { 200: jsonResponse("The capability document.", "#/components/schemas/Capabilities", "capabilities") } },
      },
      "/api/v1/capabilities": {
        get: { tags: ["discovery"], operationId: "capabilities", summary: "Capability document with absolute links to every discovery artifact", responses: { 200: jsonResponse("The capability document.", "#/components/schemas/Capabilities", "capabilities") } },
      },
      "/openapi.json": {
        get: { tags: ["discovery"], operationId: "openapi", summary: "This OpenAPI 3.1 document", responses: { 200: { description: "This document, with servers set to the request origin.", content: { "application/json": { schema: { type: "object" } } } } } },
      },
      "/api/v1/schemas/lesson/v1": {
        get: { tags: ["discovery"], operationId: "lessonSchema", summary: "JSON Schema (draft 2020-12) for lesson/v1", description: "Schema validity is necessary, not sufficient. Rules that span items are checked by the resolver; see the Lesson component description.", responses: { 200: { description: "The lesson/v1 JSON Schema.", content: { "application/json": { schema: { type: "object" } } } } } },
      },
      "/api/v1/diagnostics": {
        get: { tags: ["discovery"], operationId: "diagnostics", summary: "Every diagnostic code the resolver can emit", responses: { 200: jsonResponse("The diagnostics reference.", "#/components/schemas/DiagnosticsReference", "diagnosticsReference") } },
      },
      "/tools/lesson-validator.js": {
        get: { tags: ["discovery"], operationId: "validator", summary: "Dependency-free ES module exporting resolveLesson and lessonSchema", description: "Generated from the shared resolver. Runs in Deno, Node 20+ and browsers with no network access. Its result JSON is byte-identical to the resolution route.", responses: { 200: textResponse("The validator module.", "text/javascript") } },
      },
      "/tools/lesson-validator.d.ts": {
        get: { tags: ["discovery"], operationId: "validatorTypes", summary: "TypeScript declarations for the validator, including the DiagnosticCode union", responses: { 200: textResponse("The declaration file.", "application/octet-stream") } },
      },
      "/docs/api-v1.md": {
        get: { tags: ["discovery"], operationId: "humanDocs", summary: "Human-readable API and content-model documentation", responses: { 200: textResponse("Markdown.", "text/markdown") } },
      },
      "/docs/diagnostics.md": {
        get: { tags: ["discovery"], operationId: "humanDiagnostics", summary: "Human-readable diagnostics reference", responses: { 200: textResponse("Markdown generated from the same catalog as /api/v1/diagnostics.", "text/markdown") } },
      },
      "/api/v1/lesson-resolutions": {
        post: {
          tags: ["resolution"],
          operationId: "resolveLesson",
          summary: "Validate and normalize a lesson without storing it",
          description: "Deterministic and write-free. No authentication. Returns 200 with valid true when the document has no error diagnostics (warnings are included), or 422 with valid false.",
          requestBody: lessonBody,
          responses: {
            200: jsonResponse("The document is valid. The fingerprint covers normalized content and sources but not provenance.", "#/components/schemas/Resolution", "resolution"),
            400: problems[400],
            413: problems[413],
            422: resolutionFailed,
          },
        },
      },
      "/api/v1/lessons": {
        get: {
          tags: ["drafts"],
          operationId: "listRevisions",
          summary: "List the account's Lesson Revisions, newest first",
          security: [{ bearer: ["lessons:read"] }],
          responses: {
            200: jsonResponse("The account's revisions.", "#/components/schemas/RevisionList", "revisionList"),
            401: problems[401],
            403: problems[403],
          },
        },
        post: {
          tags: ["drafts"],
          operationId: "createLesson",
          summary: "Create a Lesson and its first private draft revision",
          description: "The server reruns the resolver. Submitting a document with a fingerprint the account already stored returns that existing revision with 201.",
          security: [{ bearer: ["lessons:write"] }],
          requestBody: lessonBody,
          responses: { 201: createdRevision, 400: problems[400], 401: problems[401], 403: problems[403], 413: problems[413], 422: resolutionFailed },
        },
      },
      "/api/v1/lessons/{lessonId}/revisions": {
        parameters: [lessonIdParameter],
        post: {
          tags: ["drafts"],
          operationId: "createRevision",
          summary: "Create another immutable draft revision of an owned Lesson",
          security: [{ bearer: ["lessons:write"] }],
          requestBody: lessonBody,
          responses: { 201: createdRevision, 400: problems[400], 401: problems[401], 403: problems[403], 404: problems[404], 413: problems[413], 422: resolutionFailed },
        },
      },
      "/api/v1/lessons/{lessonId}/revisions/{revisionId}": {
        parameters: [lessonIdParameter, revisionIdParameter],
        get: {
          tags: ["drafts"],
          operationId: "getRevision",
          summary: "Read one owned Lesson Revision",
          security: [{ bearer: ["lessons:read"] }],
          responses: { 200: jsonResponse("The stored revision.", "#/components/schemas/StoredRevision", "storedRevision"), 401: problems[401], 403: problems[403], 404: problems[404] },
        },
      },
      "/api/v1/sign-in-invites": {
        post: {
          tags: ["sign-in"],
          operationId: "mintSignInInvite",
          summary: "Mint a one-time sign-in link for the token's account",
          description: "Needs the account:owner scope. The link expires after ten minutes and is consumed by the registration that succeeds with it. Only a hash of the invite is stored.",
          security: [{ bearer: ["account:owner"] }],
          responses: {
            201: { description: "The invite.", content: { "application/json": { schema: { $ref: "#/components/schemas/SignInInvite" } } } },
            401: problems[401],
            403: problems[403],
            501: problems[501],
          },
        },
      },
      "/sign-in/{token}": {
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" }, description: "The invite token from the minted link." }],
        get: {
          tags: ["sign-in"],
          operationId: "signInInvitePage",
          summary: "The page that registers a passkey from an invite",
          responses: {
            200: { description: "The invite is valid; the page offers one Register button.", content: { "text/html": { schema: { type: "string" } } } },
            404: { description: "Unknown invite, explained as a plain page.", content: { "text/html": { schema: { type: "string" } } } },
            410: { description: "The invite was used or expired, explained as a plain page.", content: { "text/html": { schema: { type: "string" } } } },
          },
        },
      },
      "/api/v1/passkeys/registration-options": {
        post: {
          tags: ["sign-in"],
          operationId: "passkeyRegistrationOptions",
          summary: "WebAuthn creation options for a valid invite",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["invite"], properties: { invite: { type: "string" } } } } } },
          responses: {
            200: { description: "PublicKeyCredentialCreationOptions in JSON form.", content: { "application/json": { schema: { $ref: "#/components/schemas/CeremonyOptions" } } } },
            400: problems[400],
            403: problems[403],
            404: problems[404],
            410: { description: "The invite was used or expired.", content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } },
            501: problems[501],
          },
        },
      },
      "/api/v1/passkeys/registrations": {
        post: {
          tags: ["sign-in"],
          operationId: "passkeyRegistration",
          summary: "Finish registration: verify the attestation, consume the invite, sign the browser in",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["invite", "credential"], properties: { invite: { type: "string" }, credential: { type: "object", description: "The RegistrationResponseJSON from navigator.credentials.create." } } } } } },
          responses: {
            200: { description: "Signed in. Sets the learn_session cookie.", content: { "application/json": { schema: { $ref: "#/components/schemas/Session" } } } },
            400: problems[400],
            401: { description: "The challenge was replayed or the attestation failed.", content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } },
            403: problems[403],
            410: { description: "The invite was used or expired.", content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } },
            501: problems[501],
          },
        },
      },
      "/api/v1/passkeys/authentication-options": {
        post: {
          tags: ["sign-in"],
          operationId: "passkeyAuthenticationOptions",
          summary: "WebAuthn request options for signing in with an existing passkey",
          requestBody: { required: false, content: { "application/json": { schema: { type: "object", additionalProperties: false } } } },
          responses: {
            200: { description: "PublicKeyCredentialRequestOptions in JSON form.", content: { "application/json": { schema: { $ref: "#/components/schemas/CeremonyOptions" } } } },
            403: problems[403],
            501: problems[501],
          },
        },
      },
      "/api/v1/passkeys/authentications": {
        post: {
          tags: ["sign-in"],
          operationId: "passkeyAuthentication",
          summary: "Finish sign-in: verify the assertion and set the session cookie",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["credential"], properties: { credential: { type: "object", description: "The AuthenticationResponseJSON from navigator.credentials.get." } } } } } },
          responses: {
            200: { description: "Signed in. Sets the learn_session cookie.", content: { "application/json": { schema: { $ref: "#/components/schemas/Session" } } } },
            400: problems[400],
            401: { description: "Unknown credential, replayed challenge, stale sign count or failed verification.", content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } } },
            403: problems[403],
            501: problems[501],
          },
        },
      },
      "/api/v1/session": {
        get: {
          tags: ["sign-in"],
          operationId: "session",
          summary: "Who the browser is signed in as, from the session cookie",
          responses: { 200: { description: "The session. A guest gets signedIn false.", content: { "application/json": { schema: { $ref: "#/components/schemas/Session" } } } } },
        },
        delete: {
          tags: ["sign-in"],
          operationId: "signOut",
          summary: "Sign the browser out by clearing the session cookie",
          responses: {
            200: { description: "Signed out.", content: { "application/json": { schema: { $ref: "#/components/schemas/Session" } } } },
            403: problems[403],
          },
        },
      },
    },
    components: {
      examples: {
        lesson: { summary: "The demo lesson, three Concepts with MCQ, numeric and short Questions", value: exampleLesson },
        resolution: { summary: "The demo lesson resolved: valid, fingerprint, no diagnostics, normalized", value: resolved },
        resolutionFailed: { summary: "The demo lesson with a 6-word Card: card.words and a card.paragraphs.single warning", value: rejected },
        storedRevision: { summary: "The first draft revision of a new Lesson", value: exampleRevision },
        revisionList: {
          summary: "One account with one revision",
          value: { revisions: [{ lessonId: exampleLessonId, revisionId: exampleRevisionId, revisionNumber: 1, status: "draft", title: exampleLesson.title, fingerprint: resolved.fingerprint, createdAt: 1758412800000 }] },
        },
        capabilities: { summary: "The capability document for this origin", value: capabilitiesFor(origin) },
        diagnosticsReference: { summary: "The served diagnostics reference", value: diagnosticsReference },
      },
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "learn_pat_<prefix>_<secret>",
          description: "A personal access token minted by the site owner. Scopes: lessons:read for GET routes, lessons:write for POST routes, account:owner to mint sign-in invites. Agents read it from the LEARN_TOKEN environment variable and never print it.",
        },
      },
      schemas: {
        Lesson: lessonSchemaComponent(),
        Diagnostic: {
          type: "object",
          required: ["severity", "code", "path", "message"],
          additionalProperties: false,
          properties: {
            severity: { type: "string", enum: ["error", "warning"], description: "error makes the document invalid; warning does not." },
            code: { type: "string", enum: DIAGNOSTIC_CODES, description: "Stable code. Documented at /api/v1/diagnostics." },
            path: { type: "string", description: "JSON Pointer (RFC 6901) into the submitted document. Empty for document-level guards." },
            message: { type: "string", description: "Human-readable explanation. Not stable; key on code." },
          },
        },
        Resolution: {
          type: "object",
          required: ["valid", "schemaVersion", "fingerprint", "diagnostics", "normalizedLesson"],
          additionalProperties: false,
          properties: {
            valid: { type: "boolean", description: "True when no diagnostic has severity error." },
            schemaVersion: { type: "integer", const: 1 },
            fingerprint: { type: ["string", "null"], pattern: "^sha256:[0-9a-f]{64}$", description: "SHA-256 of the normalized lesson with object keys sorted and provenance removed. Null when invalid." },
            diagnostics: { type: "array", items: { $ref: "#/components/schemas/Diagnostic" }, description: "Sorted by path, then code." },
            normalizedLesson: { type: ["object", "null"], description: "The lesson rebuilt from contract fields only, text trimmed, reserved defaulted, map and feedback keys sorted. Null when invalid." },
          },
        },
        StoredRevision: {
          type: "object",
          required: ["lessonId", "revisionId", "revisionNumber", "status", "fingerprint", "content", "createdAt"],
          properties: {
            lessonId: { type: "string", format: "uuid" },
            revisionId: { type: "string", format: "uuid" },
            revisionNumber: { type: "integer", minimum: 1 },
            status: { type: "string", enum: ["draft", "published", "superseded", "withdrawn"], description: "Drafts created through the API are always draft; there is no publish API." },
            fingerprint: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
            content: { type: "object", description: "The normalized lesson plus lessonId and revisionId." },
            createdAt: { type: "integer", description: "Unix time in milliseconds." },
          },
        },
        RevisionList: {
          type: "object",
          required: ["revisions"],
          properties: {
            revisions: {
              type: "array",
              items: {
                type: "object",
                required: ["lessonId", "revisionId", "revisionNumber", "status", "title", "fingerprint", "createdAt"],
                properties: {
                  lessonId: { type: "string", format: "uuid" },
                  revisionId: { type: "string", format: "uuid" },
                  revisionNumber: { type: "integer", minimum: 1 },
                  status: { type: "string", enum: ["draft", "published", "superseded", "withdrawn"] },
                  title: { type: "string" },
                  fingerprint: { type: "string" },
                  createdAt: { type: "integer" },
                },
              },
            },
          },
        },
        SignInInvite: {
          type: "object",
          required: ["url", "path", "expiresAt"],
          properties: {
            url: { type: "string", format: "uri", description: "Absolute link to open on the phone." },
            path: { type: "string", description: "The same link as a path on this origin." },
            expiresAt: { type: "integer", description: "Unix time in milliseconds, ten minutes after minting." },
          },
        },
        CeremonyOptions: {
          type: "object",
          required: ["options"],
          properties: { options: { type: "object", description: "WebAuthn options in the JSON form the browser's PublicKeyCredential.parse* helpers accept." } },
        },
        Session: {
          type: "object",
          required: ["signedIn", "displayName"],
          properties: {
            signedIn: { type: "boolean" },
            displayName: { type: ["string", "null"], description: "The account's display name, or null for a guest." },
          },
        },
        Problem: {
          type: "object",
          description: "RFC 9457 problem details, used for transport, authentication, authorization and route errors. Resolver failures use Resolution instead.",
          required: ["type", "title", "status", "detail"],
          properties: {
            type: { type: "string", const: "about:blank" },
            title: { type: "string" },
            status: { type: "integer" },
            detail: { type: "string" },
          },
        },
        Capabilities: {
          type: "object",
          required: ["name", "apiVersion", "lessonSchema", "invokesModels", "authoringFormats", "links", "authentication", "limits"],
          properties: {
            name: { type: "string" },
            apiVersion: { type: "string", const: "v1" },
            lessonSchema: { type: "string", const: "lesson/v1" },
            invokesModels: { type: "boolean", const: false },
            authoringFormats: { type: "array", items: { type: "string" } },
            links: { type: "object", additionalProperties: { type: "string", format: "uri" }, description: "Absolute URLs of every discovery artifact and API route." },
            authentication: { type: "object" },
            limits: { type: "object" },
          },
        },
        DiagnosticsReference: {
          type: "object",
          required: ["diagnostics"],
          properties: {
            diagnostics: {
              type: "array",
              items: {
                type: "object",
                required: ["code", "severity", "path", "meaning", "fix", "schema"],
                properties: {
                  code: { type: "string", enum: DIAGNOSTIC_CODES },
                  severity: { type: "string", enum: ["error", "warning"] },
                  path: { type: "string" },
                  meaning: { type: "string" },
                  fix: { type: "string" },
                  schema: { type: "boolean", description: "True when the JSON Schema alone also rejects the common form of this mistake." },
                },
              },
            },
          },
        },
      },
    },
  };
}

/** The lesson schema as an OpenAPI component: the same document without the `$schema` keyword. */
function lessonSchemaComponent() {
  const { $schema: _dialect, ...component } = lessonSchema as Record<string, unknown>;
  return component;
}
