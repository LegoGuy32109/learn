// The OpenAPI 3.1 document for every route the server serves to agents. Request and
// response examples are produced by running the real resolver over the demo lesson, so
// the document cannot show a shape the server does not return.
import {
  lessonSchema,
  resolveLesson,
} from "../../shared/authoring/resolver.js";
import {
  DIAGNOSTIC_CODES,
  diagnosticsReference,
} from "../../shared/authoring/diagnostics.js";
import { MAX_LESSON_BYTES } from "../http.ts";
import { MAX_BATCH_EVENTS } from "../progress/validation.ts";
import { DEFAULT_PULL_LIMIT, MAX_PULL_LIMIT } from "../routes/progress.ts";
import { capabilitiesFor } from "./capabilities.ts";

/** The canonical origin. Per-request documents substitute the request origin in `servers`. */
import { PUBLIC_ORIGIN } from "../plugin/links.ts";

/** The origin documents default to when no request origin is known. One value, set in src/server/plugin/links.ts. */
export const CANONICAL_ORIGIN = PUBLIC_ORIGIN;

export const exampleLesson: Record<string, unknown> = JSON.parse(
  await Deno.readTextFile(
    new URL(
      "../../../fixtures/authoring/valid/demo-without-ids.json",
      import.meta.url,
    ),
  ),
);

const resolved = await resolveLesson(exampleLesson);
if (!resolved.valid) {
  throw new Error("The OpenAPI example lesson must resolve valid");
}

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
  content: {
    ...resolved.normalizedLesson,
    lessonId: exampleLessonId,
    revisionId: exampleRevisionId,
  },
  createdAt: 1758412800000,
};

function problem(status: number, title: string, detail: string) {
  return { type: "about:blank", title, status, detail };
}

const exampleConcept =
  (exampleRevision.content as Record<string, any>).concepts[0];
const exampleStream = {
  lessonId: exampleLessonId,
  lessonRevisionId: exampleRevisionId,
  epoch: 0,
};
const exampleCardSeen = {
  id: "3f7a9d2e-5c41-4b8f-9e2a-7d6c1b0f4a55",
  type: "card_seen",
  lessonRevisionId: exampleRevisionId,
  epoch: 0,
  occurredAt: "2026-09-22T08:15:30.000Z",
  cardId: exampleConcept.cards[0].id,
  conceptId: exampleConcept.id,
};
const exampleStarted = {
  id: "9b1e6c3a-2d4f-4a7b-8c5e-0f1a2b3c4d5e",
  type: "lesson_started",
  lessonRevisionId: exampleRevisionId,
  epoch: 0,
  occurredAt: "2026-09-22T08:15:00.000Z",
};
const exampleCheckpointEvent = {
  id: "c2d4e6f8-1a3b-4c5d-9e7f-2b4d6f8a0c1e",
  type: "navigation_checkpointed",
  lessonRevisionId: exampleRevisionId,
  epoch: 0,
  occurredAt: "2026-09-22T08:15:31.000Z",
  checkpoint: {
    screen: "card",
    conceptIndex: 0,
    cardIndex: 1,
    flowKind: "cards",
    seed: 0,
    attemptId: "",
    queue: [],
    feedback: null,
    detour: null,
    learningEventFrontier: [exampleStarted.id, exampleCardSeen.id],
  },
};
const exampleCursor = "c2VxOjI";

/** A media object whose example lives once under components.examples. */
function media(ref: string, exampleName: string) {
  return {
    schema: { $ref: ref },
    examples: { default: { $ref: `#/components/examples/${exampleName}` } },
  };
}

function problemResponse(
  description: string,
  example: Record<string, unknown>,
) {
  return {
    description,
    content: {
      "application/problem+json": {
        schema: { $ref: "#/components/schemas/Problem" },
        example,
      },
    },
  };
}

const problems = {
  400: problemResponse(
    "The body is not JSON.",
    problem(
      400,
      "Invalid JSON",
      "The request body must contain one JSON lesson document.",
    ),
  ),
  401: problemResponse(
    "The bearer token is missing, malformed, unknown, expired or revoked.",
    problem(
      401,
      "Authentication required",
      "Use a valid, unexpired, unrevoked bearer token.",
    ),
  ),
  403: problemResponse(
    "The token is valid but lacks the scope the route needs.",
    problem(
      403,
      "Insufficient scope",
      "This token does not have the lessons:write scope.",
    ),
  ),
  404: problemResponse(
    "No route matches, or the account does not own the resource.",
    problem(404, "Not found", "Lesson Revision was not found."),
  ),
  413: problemResponse(
    `The body is over ${MAX_LESSON_BYTES} bytes.`,
    problem(
      413,
      "Request too large",
      `Lesson source is limited to ${MAX_LESSON_BYTES} bytes.`,
    ),
  ),
  409: {
    description:
      "The progress epoch was discarded: the stream is at a higher epoch. `code` is `epoch.stale` and `stream` names the current revision and epoch. Discard on this device too, then sync again.",
    content: {
      "application/problem+json": {
        schema: { $ref: "#/components/schemas/ProgressProblem" },
        example: {
          ...problem(
            409,
            "Stale progress epoch",
            "This progress epoch was discarded. Discard it on this device too before syncing again.",
          ),
          code: "epoch.stale",
          stream: { ...exampleStream, epoch: 1 },
        },
      },
    },
  },
  422: {
    description:
      "One or more events do not belong to this Lesson Revision, or the body is malformed. `code` is `events.rejected` with one entry per rejection, or names the malformed field. Nothing was stored.",
    content: {
      "application/problem+json": {
        schema: { $ref: "#/components/schemas/ProgressProblem" },
        example: {
          ...problem(
            422,
            "Events rejected",
            "One or more events do not belong to this Lesson Revision. Nothing was stored.",
          ),
          code: "events.rejected",
          rejections: [{
            index: 1,
            id: "5e2b8d7c-0a9f-4e6d-b3c1-8f7a6e5d4c3b",
            code: "question.unknown",
            path: "/events/1/questionId",
            message: "questionId is not a Question of this Lesson Revision.",
          }],
        },
      },
    },
  },
  progressNotFound: problemResponse(
    "The Lesson Revision is unknown to this account: it is neither owned nor published. `code` is `revision.unknown`.",
    {
      ...problem(
        404,
        "Unknown Lesson Revision",
        "No Lesson Revision with this id is available to this account.",
      ),
      code: "revision.unknown",
      lessonRevisionId: exampleRevisionId,
    },
  ),
  501: problemResponse(
    "Passkeys are not configured for this origin: WEBAUTHN_RP_ID and WEBAUTHN_ORIGINS are unset and the origin is not plain localhost.",
    problem(
      501,
      "Passkeys not configured",
      "This deployment has no relying party for this origin.",
    ),
  ),
};

const lessonBody = {
  required: true,
  description:
    "One lesson/v1 document. The schema is served at /api/v1/schemas/lesson/v1 and inlined as the Lesson component.",
  content: {
    "application/json": media("#/components/schemas/Lesson", "lesson"),
  },
};

const resolutionFailed = {
  description:
    "The document failed resolution. The body is a Resolution with valid false, a null fingerprint and at least one error diagnostic. Every code is listed at /api/v1/diagnostics.",
  content: {
    "application/json": media(
      "#/components/schemas/Resolution",
      "resolutionFailed",
    ),
  },
};

const createdRevision = {
  description:
    "The draft revision, created now or returned again for the same fingerprint and account.",
  headers: {
    Location: {
      description: "The URL of the revision.",
      schema: { type: "string" },
      example:
        `/api/v1/lessons/${exampleLessonId}/revisions/${exampleRevisionId}`,
    },
  },
  content: {
    "application/json": media(
      "#/components/schemas/StoredRevision",
      "storedRevision",
    ),
  },
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
  const body = exampleName
    ? media(ref, exampleName)
    : { schema: { $ref: ref } };
  return { description, content: { "application/json": body } };
}

function textResponse(description: string, mediaType: string) {
  return {
    description,
    content: { [mediaType]: { schema: { type: "string" } } },
  };
}

const progressPushBody = {
  required: true,
  description:
    "The events to store, all for one Lesson Revision and progress epoch. Sending the same events again is safe: each UUIDv4 is stored once. An empty events array announces a new epoch after a discard.",
  content: {
    "application/json": media(
      "#/components/schemas/ProgressPush",
      "progressPush",
    ),
  },
};

const progressPushResponses = {
  200: jsonResponse(
    "How many events were stored now and how many were already stored, plus the stream after the push.",
    "#/components/schemas/ProgressPushResult",
    "progressPushResult",
  ),
  400: problems[400],
  401: problems[401],
  403: problems[403],
  404: problems.progressNotFound,
  409: problems[409],
  413: problems[413],
  422: problems[422],
};

const progressQuery = [
  {
    name: "revision",
    in: "query",
    required: true,
    description: "The Lesson Revision the progress belongs to.",
    schema: { type: "string", format: "uuid" },
    example: exampleRevisionId,
  },
  {
    name: "epoch",
    in: "query",
    required: false,
    description:
      "The progress epoch. Defaults to 0. A pull at an epoch below the stream's current epoch answers 409.",
    schema: { type: "integer", minimum: 0 },
    example: 0,
  },
];

const pullQuery = [
  ...progressQuery,
  {
    name: "cursor",
    in: "query",
    required: false,
    description:
      "Opaque. Send back the cursor the previous page returned; omit it for the first page. Never construct or compare one.",
    schema: { type: "string" },
    example: exampleCursor,
  },
  {
    name: "limit",
    in: "query",
    required: false,
    description:
      `Events per page, 1 to ${MAX_PULL_LIMIT}. Defaults to ${DEFAULT_PULL_LIMIT}.`,
    schema: { type: "integer", minimum: 1, maximum: MAX_PULL_LIMIT },
    example: DEFAULT_PULL_LIMIT,
  },
];

const progressPullResponses = {
  200: jsonResponse(
    "One page of events in the server's arrival order, the cursor for the next page, and the stream. The browser unions them by id and replays the shared reducers; it never orders events by id.",
    "#/components/schemas/ProgressPage",
    "progressPage",
  ),
  400: problemResponse(
    "The cursor is not one this server issued. `code` is `cursor.invalid`.",
    {
      ...problem(
        400,
        "Invalid cursor",
        "The cursor is opaque; send back the one the last page returned.",
      ),
      code: "cursor.invalid",
    },
  ),
  401: problems[401],
  403: problems[403],
  404: problems.progressNotFound,
  409: problems[409],
  422: problems[422],
};

/** Build the OpenAPI document for one origin. Documents served by the app use the request origin. */
export function openapiDocument(origin: string = CANONICAL_ORIGIN) {
  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "learn.joshhale.me API",
      version: "1.0.0-alpha.2",
      summary:
        "Validate and store lesson/v1 documents written by external agents.",
      description: [
        "The API accepts lesson content authored by external agents and never invokes an AI model. JSON is the only authoring format.",
        "Public routes: discovery documents, the downloadable validator and the write-free resolver. Authenticated routes create and read immutable private draft revisions.",
        "The server always reruns the resolver on a draft; it never trusts a normalized object asserted by a client. There is no publish API and no validation bypass.",
        `Start at ${origin}/api/v1/capabilities. Human documentation: ${origin}/docs/api-v1.md. Diagnostic codes: ${origin}/docs/diagnostics.md.`,
      ].join("\n\n"),
    },
    servers: [{ url: origin }],
    tags: [
      {
        name: "discovery",
        description: "Public documents an agent fetches to learn the contract.",
      },
      {
        name: "resolution",
        description: "Validate a lesson without storing it.",
      },
      {
        name: "drafts",
        description:
          "Immutable private Lesson Revisions owned by the token's account.",
      },
      {
        name: "sign-in",
        description:
          "Phone sign-in: one-time invites, passkey ceremonies and the browser session cookie.",
      },
      {
        name: "progress",
        description:
          "Cross-device progress sync: the idempotent union of immutable learning and navigation events, and the checkpoint rebuilt from them.",
      },
    ],
    paths: {
      "/.well-known/learn-joshhale.json": {
        get: {
          tags: ["discovery"],
          operationId: "wellKnownCapabilities",
          summary: "Capability document (well-known alias)",
          responses: {
            200: jsonResponse(
              "The capability document.",
              "#/components/schemas/Capabilities",
              "capabilities",
            ),
          },
        },
      },
      "/api/v1/capabilities": {
        get: {
          tags: ["discovery"],
          operationId: "capabilities",
          summary:
            "Capability document with absolute links to every discovery artifact",
          responses: {
            200: jsonResponse(
              "The capability document.",
              "#/components/schemas/Capabilities",
              "capabilities",
            ),
          },
        },
      },
      "/openapi.json": {
        get: {
          tags: ["discovery"],
          operationId: "openapi",
          summary: "This OpenAPI 3.1 document",
          responses: {
            200: {
              description:
                "This document, with servers set to the request origin.",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/v1/schemas/lesson/v1": {
        get: {
          tags: ["discovery"],
          operationId: "lessonSchema",
          summary: "JSON Schema (draft 2020-12) for lesson/v1",
          description:
            "Schema validity is necessary, not sufficient. Rules that span items are checked by the resolver; see the Lesson component description.",
          responses: {
            200: {
              description: "The lesson/v1 JSON Schema.",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/v1/diagnostics": {
        get: {
          tags: ["discovery"],
          operationId: "diagnostics",
          summary: "Every diagnostic code the resolver can emit",
          responses: {
            200: jsonResponse(
              "The diagnostics reference.",
              "#/components/schemas/DiagnosticsReference",
              "diagnosticsReference",
            ),
          },
        },
      },
      "/tools/lesson-validator.js": {
        get: {
          tags: ["discovery"],
          operationId: "validator",
          summary:
            "Dependency-free ES module exporting resolveLesson and lessonSchema",
          description:
            "Generated from the shared resolver. Runs in Deno, Node 20+ and browsers with no network access. Its result JSON is byte-identical to the resolution route.",
          responses: {
            200: textResponse("The validator module.", "text/javascript"),
          },
        },
      },
      "/tools/lesson-validator.d.ts": {
        get: {
          tags: ["discovery"],
          operationId: "validatorTypes",
          summary:
            "TypeScript declarations for the validator, including the DiagnosticCode union",
          responses: {
            200: textResponse(
              "The declaration file.",
              "application/octet-stream",
            ),
          },
        },
      },
      "/docs/api-v1.md": {
        get: {
          tags: ["discovery"],
          operationId: "humanDocs",
          summary: "Human-readable API and content-model documentation",
          responses: { 200: textResponse("Markdown.", "text/markdown") },
        },
      },
      "/docs/diagnostics.md": {
        get: {
          tags: ["discovery"],
          operationId: "humanDiagnostics",
          summary: "Human-readable diagnostics reference",
          responses: {
            200: textResponse(
              "Markdown generated from the same catalog as /api/v1/diagnostics.",
              "text/markdown",
            ),
          },
        },
      },
      "/plugin": {
        get: {
          tags: ["discovery"],
          operationId: "pluginPage",
          summary:
            "Human page: what the agent plugin does and the three ways to install it",
          responses: { 200: textResponse("HTML.", "text/html") },
        },
      },
      "/plugin/marketplace.json": {
        get: {
          tags: ["discovery"],
          operationId: "pluginMarketplace",
          summary:
            "Claude Code marketplace manifest naming the plugin, its archive and the archive's SHA-256",
          description:
            "Add with `claude plugin marketplace add <this URL>`, then `claude plugin install learn-lesson@learn-joshhale`. The plugin is served from this site only.",
          responses: {
            200: {
              description: "The marketplace manifest.",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/plugin/.claude-plugin/plugin.json": {
        get: {
          tags: ["discovery"],
          operationId: "pluginManifest",
          summary: "The plugin manifest",
          description:
            "Every file under /plugin/ is the plugin directory: manifest, README, skills/lesson with its references and scripts. Generated from the resolver, the JSON Schema and the diagnostics catalog by deno task plugin:generate.",
          responses: {
            200: {
              description: "The plugin manifest.",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/plugin/skills/lesson/SKILL.md": {
        get: {
          tags: ["discovery"],
          operationId: "pluginSkill",
          summary:
            "The lesson skill: steps from establishing the source to creating a draft",
          description:
            "The skill directory skills/lesson/ is self-contained: copy it into ~/.claude/skills/lesson to use it without the plugin.",
          responses: {
            200: textResponse(
              "Markdown with YAML front matter.",
              "text/markdown",
            ),
          },
        },
      },
      "/plugin/learn-lesson-plugin.zip": {
        get: {
          tags: ["discovery"],
          operationId: "pluginArchive",
          summary: "The plugin directory as one ZIP archive",
          description:
            "Deterministic: the same sources give the same bytes, and the marketplace manifest pins its SHA-256. `claude --plugin-dir` accepts the unpacked directory.",
          responses: {
            200: {
              description: "The archive.",
              content: {
                "application/zip": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
      },
      "/plugin/learn-lesson-plugin.git/info/refs": {
        get: {
          tags: ["discovery"],
          operationId: "pluginRepositoryRefs",
          summary:
            "The plugin as a bare Git repository served over the dumb HTTP protocol",
          description:
            "`git clone <origin>/plugin/learn-lesson-plugin.git` works against the static files: HEAD, info/refs, objects/info/packs and loose objects. One commit with a fixed date, so the commit hash follows the content alone.",
          responses: {
            200: textResponse(
              "One line per ref: the commit hash, a tab and refs/heads/main.",
              "application/octet-stream",
            ),
          },
        },
      },
      "/api/v1/lesson-resolutions": {
        post: {
          tags: ["resolution"],
          operationId: "resolveLesson",
          summary: "Validate and normalize a lesson without storing it",
          description:
            "Deterministic and write-free. No authentication. Returns 200 with valid true when the document has no error diagnostics (warnings are included), or 422 with valid false.",
          requestBody: lessonBody,
          responses: {
            200: jsonResponse(
              "The document is valid. The fingerprint covers normalized content and sources but not provenance.",
              "#/components/schemas/Resolution",
              "resolution",
            ),
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
          security: [{ session: [] }, { bearer: ["lessons:read"] }],
          responses: {
            200: jsonResponse(
              "The account's revisions.",
              "#/components/schemas/RevisionList",
              "revisionList",
            ),
            401: problems[401],
            403: problems[403],
          },
        },
        post: {
          tags: ["drafts"],
          operationId: "createLesson",
          summary: "Create a Lesson and its first private draft revision",
          description:
            "The server reruns the resolver. Submitting a document with a fingerprint the account already stored returns that existing revision with 201.",
          security: [{ bearer: ["lessons:write"] }],
          requestBody: lessonBody,
          responses: {
            201: createdRevision,
            400: problems[400],
            401: problems[401],
            403: problems[403],
            413: problems[413],
            422: resolutionFailed,
          },
        },
      },
      "/api/v1/shelf": {
        get: {
          tags: ["drafts"],
          operationId: "shelf",
          summary:
            "The account's lessons for the phone shelf, newest first, each with its newest revision and no content",
          description:
            "The browser merges this list with the revisions cached in IndexedDB and marks a lesson Outdated when progress exists on an older revision than latestRevisionId.",
          security: [{ session: [] }, { bearer: ["lessons:read"] }],
          responses: {
            200: jsonResponse(
              "The account's lessons.",
              "#/components/schemas/Shelf",
              "shelf",
            ),
            401: problems[401],
            403: problems[403],
          },
        },
      },
      "/api/v1/lessons/{lessonId}": {
        parameters: [lessonIdParameter],
        get: {
          tags: ["drafts"],
          operationId: "getLatestRevision",
          summary: "Read the newest revision of an owned Lesson",
          security: [{ session: [] }, { bearer: ["lessons:read"] }],
          responses: {
            200: jsonResponse(
              "The newest stored revision.",
              "#/components/schemas/StoredRevision",
              "storedRevision",
            ),
            401: problems[401],
            403: problems[403],
            404: problems[404],
          },
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
          responses: {
            201: createdRevision,
            400: problems[400],
            401: problems[401],
            403: problems[403],
            404: problems[404],
            413: problems[413],
            422: resolutionFailed,
          },
        },
      },
      "/api/v1/lessons/{lessonId}/revisions/{revisionId}": {
        parameters: [lessonIdParameter, revisionIdParameter],
        get: {
          tags: ["drafts"],
          operationId: "getRevision",
          summary:
            "Read one owned Lesson Revision, the content the phone caches on open",
          security: [{ session: [] }, { bearer: ["lessons:read"] }],
          responses: {
            200: jsonResponse(
              "The stored revision.",
              "#/components/schemas/StoredRevision",
              "storedRevision",
            ),
            401: problems[401],
            403: problems[403],
            404: problems[404],
          },
        },
      },
      "/api/v1/progress/learning-events": {
        post: {
          tags: ["progress"],
          operationId: "pushLearningEvents",
          summary:
            "Store learning events (lesson_started, card_seen, question_answered) for one revision and epoch",
          description:
            `Idempotent by event id, scoped to the account, Lesson Revision and epoch. Every event is validated against the revision: Cards and Questions must exist in it, and an answer's correctness is recomputed with the shared evaluator. A batch with any rejected event stores nothing. At most ${MAX_BATCH_EVENTS} events per push. A push at a higher epoch than the stream advances it; a push at a lower epoch answers 409.`,
          security: [{ session: [] }, { bearer: ["lessons:write"] }],
          requestBody: progressPushBody,
          responses: progressPushResponses,
        },
        get: {
          tags: ["progress"],
          operationId: "pullLearningEvents",
          summary:
            "Read learning events for one revision and epoch, one page at a time",
          parameters: pullQuery,
          security: [{ session: [] }, { bearer: ["lessons:read"] }],
          responses: progressPullResponses,
        },
      },
      "/api/v1/progress/navigation-events": {
        post: {
          tags: ["progress"],
          operationId: "pushNavigationEvents",
          summary:
            "Store navigation_checkpointed events for one revision and epoch",
          description:
            "Idempotent by event id. Each checkpoint names the learning events it depends on in learningEventFrontier; the server never trusts a checkpoint as canonical on its own.",
          security: [{ session: [] }, { bearer: ["lessons:write"] }],
          requestBody: progressPushBody,
          responses: progressPushResponses,
        },
        get: {
          tags: ["progress"],
          operationId: "pullNavigationEvents",
          summary:
            "Read navigation events for one revision and epoch, one page at a time",
          parameters: pullQuery,
          security: [{ session: [] }, { bearer: ["lessons:read"] }],
          responses: progressPullResponses,
        },
      },
      "/api/v1/progress/checkpoint": {
        get: {
          tags: ["progress"],
          operationId: "progressCheckpoint",
          summary:
            "The canonical resume position, rebuilt from the navigation stream",
          description:
            "No projection is stored. The server selects, from every navigation_checkpointed event in the scope, the checkpoint that depends on the most accepted learning events; a checkpoint with a smaller frontier never replaces one with a larger frontier, however late it arrives. Equal frontiers are broken by the later client occurredAt, then by the greater event id, so every device and the server agree.",
          parameters: progressQuery,
          security: [{ session: [] }, { bearer: ["lessons:read"] }],
          responses: {
            200: jsonResponse(
              "The selected checkpoint, or null when none exists, with the size of its accepted frontier.",
              "#/components/schemas/ProgressCheckpoint",
              "progressCheckpoint",
            ),
            401: problems[401],
            403: problems[403],
            404: problems.progressNotFound,
            409: problems[409],
            422: problems[422],
          },
        },
      },
      "/api/v1/sign-in-invites": {
        post: {
          tags: ["sign-in"],
          operationId: "mintSignInInvite",
          summary: "Mint a one-time sign-in link for the token's account",
          description:
            "Needs the account:owner scope. The link expires after ten minutes and is consumed by the registration that succeeds with it. Only a hash of the invite is stored.",
          security: [{ bearer: ["account:owner"] }],
          responses: {
            201: {
              description: "The invite.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SignInInvite" },
                },
              },
            },
            401: problems[401],
            403: problems[403],
            501: problems[501],
          },
        },
      },
      "/sign-in/{token}": {
        parameters: [{
          name: "token",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "The invite token from the minted link.",
        }],
        get: {
          tags: ["sign-in"],
          operationId: "signInInvitePage",
          summary: "The page that registers a passkey from an invite",
          responses: {
            200: {
              description:
                "The invite is valid; the page offers one Register button.",
              content: { "text/html": { schema: { type: "string" } } },
            },
            404: {
              description: "Unknown invite, explained as a plain page.",
              content: { "text/html": { schema: { type: "string" } } },
            },
            410: {
              description:
                "The invite was used or expired, explained as a plain page.",
              content: { "text/html": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/api/v1/passkeys/registration-options": {
        post: {
          tags: ["sign-in"],
          operationId: "passkeyRegistrationOptions",
          summary: "WebAuthn creation options for a valid invite",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["invite"],
                  properties: { invite: { type: "string" } },
                },
              },
            },
          },
          responses: {
            200: {
              description: "PublicKeyCredentialCreationOptions in JSON form.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CeremonyOptions" },
                },
              },
            },
            400: problems[400],
            403: problems[403],
            404: problems[404],
            410: {
              description: "The invite was used or expired.",
              content: {
                "application/problem+json": {
                  schema: { $ref: "#/components/schemas/Problem" },
                },
              },
            },
            501: problems[501],
          },
        },
      },
      "/api/v1/passkeys/registrations": {
        post: {
          tags: ["sign-in"],
          operationId: "passkeyRegistration",
          summary:
            "Finish registration: verify the attestation, consume the invite, sign the browser in",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["invite", "credential"],
                  properties: {
                    invite: { type: "string" },
                    credential: {
                      type: "object",
                      description:
                        "The RegistrationResponseJSON from navigator.credentials.create.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Signed in. Sets the learn_session cookie.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Session" },
                },
              },
            },
            400: problems[400],
            401: {
              description:
                "The challenge was replayed or the attestation failed.",
              content: {
                "application/problem+json": {
                  schema: { $ref: "#/components/schemas/Problem" },
                },
              },
            },
            403: problems[403],
            410: {
              description: "The invite was used or expired.",
              content: {
                "application/problem+json": {
                  schema: { $ref: "#/components/schemas/Problem" },
                },
              },
            },
            501: problems[501],
          },
        },
      },
      "/api/v1/passkeys/authentication-options": {
        post: {
          tags: ["sign-in"],
          operationId: "passkeyAuthenticationOptions",
          summary:
            "WebAuthn request options for signing in with an existing passkey",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: false },
              },
            },
          },
          responses: {
            200: {
              description: "PublicKeyCredentialRequestOptions in JSON form.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CeremonyOptions" },
                },
              },
            },
            403: problems[403],
            501: problems[501],
          },
        },
      },
      "/api/v1/passkeys/authentications": {
        post: {
          tags: ["sign-in"],
          operationId: "passkeyAuthentication",
          summary:
            "Finish sign-in: verify the assertion and set the session cookie",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["credential"],
                  properties: {
                    credential: {
                      type: "object",
                      description:
                        "The AuthenticationResponseJSON from navigator.credentials.get.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Signed in. Sets the learn_session cookie.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Session" },
                },
              },
            },
            400: problems[400],
            401: {
              description:
                "Unknown credential, replayed challenge, stale sign count or failed verification.",
              content: {
                "application/problem+json": {
                  schema: { $ref: "#/components/schemas/Problem" },
                },
              },
            },
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
          responses: {
            200: {
              description: "The session. A guest gets signedIn false.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Session" },
                },
              },
            },
          },
        },
        delete: {
          tags: ["sign-in"],
          operationId: "signOut",
          summary: "Sign the browser out by clearing the session cookie",
          responses: {
            200: {
              description: "Signed out.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Session" },
                },
              },
            },
            403: problems[403],
          },
        },
      },
    },
    components: {
      examples: {
        lesson: {
          summary:
            "The demo lesson, three Concepts with MCQ, numeric and short Questions",
          value: exampleLesson,
        },
        resolution: {
          summary:
            "The demo lesson resolved: valid, fingerprint, no diagnostics, normalized",
          value: resolved,
        },
        resolutionFailed: {
          summary:
            "The demo lesson with a 6-word Card: card.words and a card.paragraphs.single warning",
          value: rejected,
        },
        storedRevision: {
          summary: "The first draft revision of a new Lesson",
          value: exampleRevision,
        },
        revisionList: {
          summary: "One account with one revision",
          value: {
            revisions: [{
              lessonId: exampleLessonId,
              revisionId: exampleRevisionId,
              revisionNumber: 1,
              status: "draft",
              title: exampleLesson.title,
              fingerprint: resolved.fingerprint,
              createdAt: 1758412800000,
            }],
          },
        },
        shelf: {
          summary: "One account with one lesson on its shelf",
          value: {
            lessons: [{
              lessonId: exampleLessonId,
              title: exampleLesson.title,
              conceptCount: 3,
              questionCount: 12,
              latestRevisionId: exampleRevisionId,
              latestRevisionNumber: 1,
              status: "draft",
              updatedAt: 1758412800000,
            }],
          },
        },
        progressPush: {
          summary: "Two learning events from one device",
          value: {
            lessonRevisionId: exampleRevisionId,
            epoch: 0,
            events: [exampleStarted, exampleCardSeen],
          },
        },
        progressPushResult: {
          summary: "Both stored now",
          value: { accepted: 2, duplicates: 0, stream: exampleStream },
        },
        progressPage: {
          summary: "One page holding both events, with nothing after it",
          value: {
            events: [exampleStarted, exampleCardSeen],
            cursor: exampleCursor,
            hasMore: false,
            stream: exampleStream,
          },
        },
        progressCheckpoint: {
          summary:
            "Resuming at the second Card, depending on two learning events",
          value: {
            checkpoint: exampleCheckpointEvent.checkpoint,
            frontier: 2,
            learningEvents: 2,
            stream: exampleStream,
          },
        },
        capabilities: {
          summary: "The capability document for this origin",
          value: capabilitiesFor(origin),
        },
        diagnosticsReference: {
          summary: "The served diagnostics reference",
          value: diagnosticsReference,
        },
      },
      securitySchemes: {
        session: {
          type: "apiKey",
          in: "cookie",
          name: "learn_session",
          description:
            "The browser session cookie a passkey sign-in sets. Read routes accept it in place of a bearer token; it resolves to the same account.",
        },
        bearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "learn_pat_<prefix>_<secret>",
          description:
            "A personal access token minted by the site owner. Scopes: lessons:read for GET routes, lessons:write for POST routes, account:owner to mint sign-in invites. Agents read it from the LEARN_TOKEN environment variable and never print it.",
        },
      },
      schemas: {
        Lesson: lessonSchemaComponent(),
        Diagnostic: {
          type: "object",
          required: ["severity", "code", "path", "message"],
          additionalProperties: false,
          properties: {
            severity: {
              type: "string",
              enum: ["error", "warning"],
              description:
                "error makes the document invalid; warning does not.",
            },
            code: {
              type: "string",
              enum: DIAGNOSTIC_CODES,
              description: "Stable code. Documented at /api/v1/diagnostics.",
            },
            path: {
              type: "string",
              description:
                "JSON Pointer (RFC 6901) into the submitted document. Empty for document-level guards.",
            },
            message: {
              type: "string",
              description:
                "Human-readable explanation. Not stable; key on code.",
            },
          },
        },
        Resolution: {
          type: "object",
          required: [
            "valid",
            "schemaVersion",
            "fingerprint",
            "diagnostics",
            "normalizedLesson",
          ],
          additionalProperties: false,
          properties: {
            valid: {
              type: "boolean",
              description: "True when no diagnostic has severity error.",
            },
            schemaVersion: { type: "integer", const: 1 },
            fingerprint: {
              type: ["string", "null"],
              pattern: "^sha256:[0-9a-f]{64}$",
              description:
                "SHA-256 of the normalized lesson with object keys sorted and provenance removed. Null when invalid.",
            },
            diagnostics: {
              type: "array",
              items: { $ref: "#/components/schemas/Diagnostic" },
              description: "Sorted by path, then code.",
            },
            normalizedLesson: {
              type: ["object", "null"],
              description:
                "The lesson rebuilt from contract fields only, text trimmed, reserved defaulted, map and feedback keys sorted. Null when invalid.",
            },
          },
        },
        StoredRevision: {
          type: "object",
          required: [
            "lessonId",
            "revisionId",
            "revisionNumber",
            "status",
            "fingerprint",
            "content",
            "createdAt",
          ],
          properties: {
            lessonId: { type: "string", format: "uuid" },
            revisionId: { type: "string", format: "uuid" },
            revisionNumber: { type: "integer", minimum: 1 },
            status: {
              type: "string",
              enum: ["draft", "published", "superseded", "withdrawn"],
              description:
                "Drafts created through the API are always draft; there is no publish API.",
            },
            fingerprint: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
            content: {
              type: "object",
              description:
                "The normalized lesson plus lessonId and revisionId.",
            },
            createdAt: {
              type: "integer",
              description: "Unix time in milliseconds.",
            },
          },
        },
        Shelf: {
          type: "object",
          required: ["lessons"],
          properties: {
            lessons: {
              type: "array",
              description:
                "Newest first. One entry per Lesson the account owns.",
              items: {
                type: "object",
                required: [
                  "lessonId",
                  "title",
                  "conceptCount",
                  "questionCount",
                  "latestRevisionId",
                  "latestRevisionNumber",
                  "status",
                  "updatedAt",
                ],
                properties: {
                  lessonId: { type: "string", format: "uuid" },
                  title: { type: "string" },
                  conceptCount: { type: "integer", minimum: 0 },
                  questionCount: { type: "integer", minimum: 0 },
                  latestRevisionId: {
                    type: "string",
                    format: "uuid",
                    description:
                      "The newest revision. The browser compares it with the revision its progress is pinned to.",
                  },
                  latestRevisionNumber: { type: "integer", minimum: 1 },
                  status: {
                    type: "string",
                    enum: ["draft", "published", "superseded", "withdrawn"],
                  },
                  updatedAt: {
                    type: "integer",
                    description:
                      "When the newest revision was created, in milliseconds.",
                  },
                },
              },
            },
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
                required: [
                  "lessonId",
                  "revisionId",
                  "revisionNumber",
                  "status",
                  "title",
                  "fingerprint",
                  "createdAt",
                ],
                properties: {
                  lessonId: { type: "string", format: "uuid" },
                  revisionId: { type: "string", format: "uuid" },
                  revisionNumber: { type: "integer", minimum: 1 },
                  status: {
                    type: "string",
                    enum: ["draft", "published", "superseded", "withdrawn"],
                  },
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
            url: {
              type: "string",
              format: "uri",
              description: "Absolute link to open on the phone.",
            },
            path: {
              type: "string",
              description: "The same link as a path on this origin.",
            },
            expiresAt: {
              type: "integer",
              description:
                "Unix time in milliseconds, ten minutes after minting.",
            },
          },
        },
        CeremonyOptions: {
          type: "object",
          required: ["options"],
          properties: {
            options: {
              type: "object",
              description:
                "WebAuthn options in the JSON form the browser's PublicKeyCredential.parse* helpers accept.",
            },
          },
        },
        Session: {
          type: "object",
          required: ["signedIn", "displayName"],
          properties: {
            signedIn: { type: "boolean" },
            displayName: {
              type: ["string", "null"],
              description: "The account's display name, or null for a guest.",
            },
          },
        },
        SyncEvent: {
          type: "object",
          description:
            "One immutable event as the browser stores it. The envelope is fixed; the remaining fields depend on type: card_seen carries cardId and conceptId; question_answered carries flowKind, conceptId, poolId, questionId, attemptId, answer and correct; navigation_checkpointed carries checkpoint (an object with learningEventFrontier, or null).",
          required: ["id", "type", "lessonRevisionId", "epoch", "occurredAt"],
          properties: {
            id: {
              type: "string",
              format: "uuid",
              description:
                "UUIDv4. The idempotency key within the account, revision and epoch. Never an ordering.",
            },
            type: {
              type: "string",
              enum: [
                "lesson_started",
                "card_seen",
                "question_answered",
                "navigation_checkpointed",
              ],
            },
            lessonRevisionId: { type: "string", format: "uuid" },
            epoch: {
              type: "integer",
              minimum: 0,
              description:
                "The progress epoch. A discard advances it; events under an older epoch are never read again.",
            },
            occurredAt: {
              type: "string",
              format: "date-time",
              description:
                "The client's clock when the event happened. The server also records when it received the event.",
            },
          },
        },
        StreamState: {
          type: ["object", "null"],
          description:
            "The account's stream for the Lesson: the revision it is learning and the current epoch. Null before the first push.",
          required: ["lessonId", "lessonRevisionId", "epoch"],
          properties: {
            lessonId: { type: "string", format: "uuid" },
            lessonRevisionId: { type: "string", format: "uuid" },
            epoch: { type: "integer", minimum: 0 },
          },
        },
        ProgressPush: {
          type: "object",
          required: ["lessonRevisionId", "epoch", "events"],
          properties: {
            lessonRevisionId: { type: "string", format: "uuid" },
            epoch: { type: "integer", minimum: 0 },
            events: {
              type: "array",
              maxItems: MAX_BATCH_EVENTS,
              items: { $ref: "#/components/schemas/SyncEvent" },
            },
          },
        },
        ProgressPushResult: {
          type: "object",
          required: ["accepted", "duplicates", "stream"],
          properties: {
            accepted: {
              type: "integer",
              minimum: 0,
              description: "Events stored by this push.",
            },
            duplicates: {
              type: "integer",
              minimum: 0,
              description:
                "Events already stored, skipped. A retry after a lost response reports them here.",
            },
            stream: { $ref: "#/components/schemas/StreamState" },
          },
        },
        ProgressPage: {
          type: "object",
          required: ["events", "cursor", "hasMore", "stream"],
          properties: {
            events: {
              type: "array",
              items: { $ref: "#/components/schemas/SyncEvent" },
              description: "In the server's arrival order.",
            },
            cursor: {
              type: "string",
              description:
                "Opaque. Send it back as the cursor query parameter for the next page; it never skips or repeats an event across pages.",
            },
            hasMore: { type: "boolean" },
            stream: { $ref: "#/components/schemas/StreamState" },
          },
        },
        ProgressCheckpoint: {
          type: "object",
          required: ["checkpoint", "frontier", "learningEvents", "stream"],
          properties: {
            checkpoint: {
              type: ["object", "null"],
              description:
                "The selected checkpoint as the browser stored it, or null.",
            },
            frontier: {
              type: "integer",
              minimum: 0,
              description:
                "How many accepted learning events the selected checkpoint depends on.",
            },
            learningEvents: {
              type: "integer",
              minimum: 0,
              description: "How many learning events the scope holds.",
            },
            stream: { $ref: "#/components/schemas/StreamState" },
          },
        },
        ProgressProblem: {
          type: "object",
          description:
            "RFC 9457 problem details with a stable `code` and, for a stale epoch, the current `stream`; for rejected events, one `rejections` entry per event at fault.",
          required: ["type", "title", "status", "detail", "code"],
          properties: {
            type: { type: "string", const: "about:blank" },
            title: { type: "string" },
            status: { type: "integer" },
            detail: { type: "string" },
            code: {
              type: "string",
              enum: [
                "epoch.stale",
                "epoch.shape",
                "events.rejected",
                "revision.unknown",
                "cursor.invalid",
              ],
            },
            stream: { $ref: "#/components/schemas/StreamState" },
            lessonRevisionId: { type: "string" },
            rejections: {
              type: "array",
              items: {
                type: "object",
                required: ["index", "id", "code", "path", "message"],
                properties: {
                  index: {
                    type: "integer",
                    description:
                      "Position in the submitted events array, or -1 for the array itself.",
                  },
                  id: { type: ["string", "null"] },
                  code: { type: "string" },
                  path: {
                    type: "string",
                    description: "JSON Pointer into the push body.",
                  },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        Problem: {
          type: "object",
          description:
            "RFC 9457 problem details, used for transport, authentication, authorization and route errors. Resolver failures use Resolution instead.",
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
          required: [
            "name",
            "apiVersion",
            "lessonSchema",
            "invokesModels",
            "authoringFormats",
            "links",
            "authentication",
            "limits",
            "plugin",
            "howToAuthor",
          ],
          properties: {
            name: { type: "string" },
            apiVersion: { type: "string", const: "v1" },
            lessonSchema: { type: "string", const: "lesson/v1" },
            invokesModels: { type: "boolean", const: false },
            authoringFormats: { type: "array", items: { type: "string" } },
            links: {
              type: "object",
              additionalProperties: { type: "string", format: "uri" },
              description:
                "Absolute URLs of every discovery artifact and API route.",
            },
            authentication: { type: "object" },
            limits: { type: "object" },
            plugin: {
              type: "object",
              description:
                "The installable agent plugin served by this site: where its page, marketplace manifest, archive and repository live, and the install commands for each route.",
              required: [
                "name",
                "version",
                "skill",
                "page",
                "marketplace",
                "manifest",
                "archive",
                "repository",
                "skillDocument",
                "install",
                "tokenEnvironmentVariable",
              ],
              properties: {
                name: { type: "string" },
                version: { type: "string" },
                skill: { type: "string" },
                page: { type: "string", format: "uri" },
                marketplace: { type: "string", format: "uri" },
                manifest: { type: "string", format: "uri" },
                archive: { type: "string", format: "uri" },
                repository: { type: "string", format: "uri" },
                skillDocument: { type: "string", format: "uri" },
                install: {
                  type: "object",
                  additionalProperties: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                tokenEnvironmentVariable: {
                  type: "string",
                  const: "LEARN_TOKEN",
                },
                generatedFrom: { type: "string" },
              },
            },
            howToAuthor: { type: "array", items: { type: "string" } },
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
                required: [
                  "code",
                  "severity",
                  "path",
                  "meaning",
                  "fix",
                  "schema",
                ],
                properties: {
                  code: { type: "string", enum: DIAGNOSTIC_CODES },
                  severity: { type: "string", enum: ["error", "warning"] },
                  path: { type: "string" },
                  meaning: { type: "string" },
                  fix: { type: "string" },
                  schema: {
                    type: "boolean",
                    description:
                      "True when the JSON Schema alone also rejects the common form of this mistake.",
                  },
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
  const { $schema: _dialect, ...component } = lessonSchema as Record<
    string,
    unknown
  >;
  return component;
}
