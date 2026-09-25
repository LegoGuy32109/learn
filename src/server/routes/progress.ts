// Progress sync: versioned push and pull for the learning and navigation event streams, and the
// canonical checkpoint rebuilt from the navigation stream by the shared selection rule. Every route
// resolves the account through the one current-account resolver, so the browser session cookie and
// a bearer token both work. Pushes are idempotent: an event is stored once however often it arrives.
import { frontierCount, selectCheckpoint } from "../../shared/learning/sync.js";
import type { Dependencies } from "../dependencies.ts";
import { json, jsonBody, problem } from "../http.ts";
import { base64Url, fromBase64Url } from "../identity/encoding.ts";
import { currentAccount } from "../identity/current-account.ts";
import {
  LEARNING_STREAM,
  NAVIGATION_STREAM,
  type StreamName,
  validateBatch,
} from "../progress/validation.ts";
import type {
  ProgressStream,
  StoredSyncEvent,
} from "../repositories/progress.ts";
import type { StoredRevision } from "../repositories/lessons.ts";
import { type Route, route } from "./route.ts";

export const PROGRESS_READ_SCOPE = "lessons:read";
export const PROGRESS_WRITE_SCOPE = "lessons:write";

/** Events per pull page when the client names no limit, and the most it may ask for. */
export const DEFAULT_PULL_LIMIT = 100;
export const MAX_PULL_LIMIT = 500;

const STREAM_PATHS: Record<StreamName, string> = {
  learning: "learning-events",
  navigation: "navigation-events",
};

/** RFC 9457 problem details with extension members, for structured rejections a client acts on. */
function structuredProblem(
  status: number,
  title: string,
  detail: string,
  extra: Record<string, unknown>,
): Response {
  const body = JSON.stringify({
    type: "about:blank",
    title,
    status,
    detail,
    ...extra,
  });
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/problem+json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}

function privateJson(value: unknown): Response {
  return json(value, 200, { "cache-control": "private, no-store" });
}

/** The account behind the request, or the problem to send. */
async function account(
  request: Request,
  dependencies: Dependencies,
  scope: string,
): Promise<string | Response> {
  const resolved = await currentAccount(request, dependencies, scope);
  if (resolved && "forbidden" in resolved) {
    return problem(
      403,
      "Insufficient scope",
      `This token does not have the ${scope} scope.`,
    );
  }
  if (!resolved) {
    return problem(
      401,
      "Authentication required",
      "Sign in, or use a valid, unexpired, unrevoked bearer token.",
    );
  }
  return resolved.accountId;
}

/** A state-changing request from another site is refused before the cookie is consulted. */
function crossSite(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return problem(
      403,
      "Cross-site request",
      "This request must come from the site itself.",
    );
  }
  return null;
}

/** The revision named by a push or pull, or the structured problem when the account may not learn it. */
async function revisionFor(
  dependencies: Dependencies,
  accountId: string,
  revisionId: unknown,
): Promise<StoredRevision | Response> {
  if (typeof revisionId !== "string" || !revisionId) {
    return structuredProblem(
      422,
      "Unknown Lesson Revision",
      "lessonRevisionId must name a Lesson Revision.",
      { code: "revision.unknown" },
    );
  }
  const revision = await dependencies.lessons.learnableRevision(
    accountId,
    revisionId,
  );
  if (!revision) {
    return structuredProblem(
      404,
      "Unknown Lesson Revision",
      "No Lesson Revision with this id is available to this account.",
      { code: "revision.unknown", lessonRevisionId: revisionId },
    );
  }
  return revision;
}

function epochOf(value: unknown): number | null {
  const epoch = typeof value === "string" ? Number(value) : value;
  return Number.isInteger(epoch) && Number(epoch) >= 0 ? Number(epoch) : null;
}

function staleEpoch(stream: ProgressStream): Response {
  return structuredProblem(
    409,
    "Stale progress epoch",
    "This progress epoch was discarded. Discard it on this device too before syncing again.",
    {
      code: "epoch.stale",
      stream: publicStream(stream),
    },
  );
}

function publicStream(
  stream: ProgressStream | null,
): { lessonId: string; lessonRevisionId: string; epoch: number } | null {
  return stream
    ? {
      lessonId: stream.lessonId,
      lessonRevisionId: stream.lessonRevisionId,
      epoch: stream.epoch,
    }
    : null;
}

/** Opaque cursors: the arrival sequence number, encoded so clients never parse or compare it. */
export function encodeCursor(seq: number): string {
  return base64Url(new TextEncoder().encode(`seq:${seq}`));
}

function decodeCursor(value: string | null): number | null {
  if (value === null || value === "") return 0;
  const bytes = fromBase64Url(value);
  if (!bytes) return null;
  const match = new TextDecoder().decode(bytes).match(/^seq:(\d{1,15})$/);
  return match ? Number(match[1]) : null;
}

function pullPage(
  events: StoredSyncEvent[],
  hasMore: boolean,
  cursorIn: number,
  stream: ProgressStream | null,
) {
  const last = events.at(-1)?.seq ?? cursorIn;
  return {
    events: events.map((stored) => stored.event),
    cursor: encodeCursor(last),
    hasMore,
    stream: publicStream(stream),
  };
}

export function progressRoutes(dependencies: Dependencies): Route[] {
  const push = (stream: StreamName) =>
    route(
      "POST",
      `/api/v1/progress/${STREAM_PATHS[stream]}`,
      async (request) => {
        const refused = crossSite(request);
        if (refused) return refused;
        const accountId = await account(
          request,
          dependencies,
          PROGRESS_WRITE_SCOPE,
        );
        if (accountId instanceof Response) return accountId;
        const parsed = await jsonBody(request);
        if (parsed instanceof Response) return parsed;
        const body =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
        if (!body) {
          return problem(
            400,
            "Invalid push",
            "The body must be an object with lessonRevisionId, epoch and events.",
          );
        }
        const revision = await revisionFor(
          dependencies,
          accountId,
          body.lessonRevisionId,
        );
        if (revision instanceof Response) return revision;
        const epoch = epochOf(body.epoch);
        if (epoch === null) {
          return structuredProblem(
            422,
            "Invalid push",
            "epoch must be a non-negative integer.",
            { code: "epoch.shape" },
          );
        }
        const validated = validateBatch(
          stream,
          body.events ?? [],
          revision.revisionId,
          epoch,
          revision.content,
        );
        if (validated.rejections.length) {
          return structuredProblem(
            422,
            "Events rejected",
            "One or more events do not belong to this Lesson Revision. Nothing was stored.",
            { code: "events.rejected", rejections: validated.rejections },
          );
        }
        const scope = {
          lessonId: revision.lessonId,
          lessonRevisionId: revision.revisionId,
          epoch,
        };
        const outcome = await dependencies.progress.push(
          accountId,
          stream,
          scope,
          validated.accepted,
          Date.now(),
        );
        if (!outcome.ok) return staleEpoch(outcome.stream);
        return privateJson({
          accepted: outcome.accepted,
          duplicates: outcome.duplicates,
          stream: publicStream(outcome.stream),
        });
      },
    );

  /** The scope of a pull or checkpoint read, or the problem to send. */
  const readScope = async (request: Request, accountId: string) => {
    const url = new URL(request.url);
    const revision = await revisionFor(
      dependencies,
      accountId,
      url.searchParams.get("revision") ?? "",
    );
    if (revision instanceof Response) return revision;
    const epoch = epochOf(url.searchParams.get("epoch") ?? "0");
    if (epoch === null) {
      return structuredProblem(
        422,
        "Invalid pull",
        "epoch must be a non-negative integer.",
        { code: "epoch.shape" },
      );
    }
    const stream = await dependencies.progress.stream(
      accountId,
      revision.lessonId,
    );
    if (stream && epoch < stream.epoch) return staleEpoch(stream);
    return {
      url,
      revision,
      epoch,
      stream,
      scope: { lessonRevisionId: revision.revisionId, epoch },
    };
  };

  const pull = (stream: StreamName) =>
    route(
      "GET",
      `/api/v1/progress/${STREAM_PATHS[stream]}`,
      async (request) => {
        const accountId = await account(
          request,
          dependencies,
          PROGRESS_READ_SCOPE,
        );
        if (accountId instanceof Response) return accountId;
        const read = await readScope(request, accountId);
        if (read instanceof Response) return read;
        const after = decodeCursor(read.url.searchParams.get("cursor"));
        if (after === null) {
          return structuredProblem(
            400,
            "Invalid cursor",
            "The cursor is opaque; send back the one the last page returned.",
            { code: "cursor.invalid" },
          );
        }
        const requested = Number(
          read.url.searchParams.get("limit") ?? DEFAULT_PULL_LIMIT,
        );
        const limit = Number.isInteger(requested) && requested > 0
          ? Math.min(requested, MAX_PULL_LIMIT)
          : DEFAULT_PULL_LIMIT;
        const page = await dependencies.progress.pull(
          accountId,
          stream,
          read.scope,
          after,
          limit,
        );
        return privateJson(
          pullPage(page.events, page.hasMore, after, read.stream),
        );
      },
    );

  return [
    push(LEARNING_STREAM),
    push(NAVIGATION_STREAM),
    pull(LEARNING_STREAM),
    pull(NAVIGATION_STREAM),
    route("GET", "/api/v1/progress/checkpoint", async (request) => {
      const accountId = await account(
        request,
        dependencies,
        PROGRESS_READ_SCOPE,
      );
      if (accountId instanceof Response) return accountId;
      const read = await readScope(request, accountId);
      if (read instanceof Response) return read;
      const [navigation, learning] = await Promise.all([
        dependencies.progress.all(accountId, NAVIGATION_STREAM, read.scope),
        dependencies.progress.all(accountId, LEARNING_STREAM, read.scope),
      ]);
      const learningEvents = learning.map((stored) => stored.event);
      const checkpoint = selectCheckpoint(
        navigation.map((stored) => stored.event),
        learningEvents,
      );
      const frontier = frontierCount(
        { checkpoint },
        new Set(learningEvents.map((event) => event.id)),
      );
      return privateJson({
        checkpoint,
        frontier,
        learningEvents: learningEvents.length,
        stream: publicStream(read.stream),
      });
    }),
  ];
}
