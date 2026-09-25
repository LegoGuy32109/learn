import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";
import { DEMO_LESSON as lesson } from "../support/demo-lesson.ts";
import { createApp, fixtureDependencies } from "../../src/app.ts";
import type { Authenticator } from "../../src/server/auth.ts";
import { FixtureLessonRepository } from "../../src/server/repositories/lessons.ts";
import {
  redactBearerTokens,
  redactedErrorText,
} from "../../src/server/identity/redaction.ts";
import { newPersonalToken } from "../../src/server/tokens.ts";
import {
  TokenAdminError,
  validateScopes,
} from "../../src/server/identity/token-admin.ts";
import { formatList, parseDuration } from "../../scripts/tokens.ts";

const { token, prefix } = newPersonalToken();

const fixture = await fixtureDependencies();

function appWith(auth: Authenticator) {
  return createApp({
    ...fixture,
    lessons: new FixtureLessonRepository(lesson),
    auth,
  });
}

async function capturingConsoleError<T>(
  work: () => Promise<T>,
): Promise<{ result: T; logged: string }> {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    return { result: await work(), logged: lines.join("\n") };
  } finally {
    console.error = original;
  }
}

Deno.test("personal tokens carry at least 256 bits of random material behind the prefix", () => {
  const secret = token.slice(`learn_pat_${prefix}_`.length);
  assertMatch(secret, /^[A-Za-z0-9_-]{43}$/);
  assertEquals(token.startsWith(`learn_pat_${prefix}_`), true);
});

Deno.test("redaction keeps the prefix and removes the secret from any text", () => {
  const redacted = redactBearerTokens(
    `request failed with Authorization: Bearer ${token} and again ${token}`,
  );
  assert(!redacted.includes(token));
  assertStringIncludes(redacted, `learn_pat_${prefix}_[redacted]`);
  assertEquals(
    redactBearerTokens("Bearer opaque.credential-value"),
    "Bearer [redacted]",
  );
  assertEquals(
    redactBearerTokens("nothing secret here"),
    "nothing secret here",
  );
  assert(
    !redactedErrorText(new Error(`driver echoed ${token}`)).includes(token),
  );
});

Deno.test("a missing or invalid token gets 401 and a valid token without the scope gets 403", async () => {
  const forbidding = appWith({
    authenticate() {
      return Promise.resolve({ ok: false, reason: "forbidden" });
    },
  });
  const forbidden = await forbidding(
    new Request("http://local/api/v1/lessons", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(lesson),
    }),
  );
  assertEquals(forbidden.status, 403);
  assertEquals(
    forbidden.headers.get("content-type"),
    "application/problem+json; charset=utf-8",
  );
  const forbiddenBody = await forbidden.text();
  assertStringIncludes(forbiddenBody, "lessons:write");
  assert(!forbiddenBody.includes(token));

  const rejecting = appWith({
    authenticate() {
      return Promise.resolve({ ok: false, reason: "unauthenticated" });
    },
  });
  const unauthenticated = await rejecting(
    new Request("http://local/api/v1/lessons", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
  assertEquals(unauthenticated.status, 401);
  assert(!(await unauthenticated.text()).includes(token));
});

Deno.test("a bearer token passed into an error path never reaches the error message or the log", async () => {
  const failing = appWith({
    authenticate(request) {
      return Promise.reject(
        new Error(
          `lookup failed for ${request.headers.get("authorization")}`,
        ),
      );
    },
  });
  const { result, logged } = await capturingConsoleError(() =>
    failing(
      new Request("http://local/api/v1/lessons", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
  );
  assertEquals(result.status, 500);
  const body = await result.text();
  assert(!body.includes(token), "response body leaked the token");
  assert(!body.includes(prefix), "response body leaked the prefix");
  assert(!logged.includes(token), "log output leaked the token");
  assertStringIncludes(logged, "[redacted]");
});

Deno.test("scope validation rejects unknown and empty scope lists", () => {
  assertEquals(
    validateScopes(["lessons:read", " lessons:read", "lessons:write"]),
    ["lessons:read", "lessons:write"],
  );
  let failure: unknown;
  try {
    validateScopes(["lessons:publish"]);
  } catch (error) {
    failure = error;
  }
  assert(failure instanceof TokenAdminError);
  try {
    validateScopes([]);
  } catch (error) {
    failure = error;
  }
  assert(failure instanceof TokenAdminError);
});

Deno.test("token script helpers parse durations and list only metadata columns", () => {
  assertEquals(parseDuration("30m"), 1_800_000);
  assertEquals(parseDuration("12h"), 43_200_000);
  assertEquals(parseDuration("90d"), 7_776_000_000);
  const listing = formatList([{
    name: "codex",
    prefix,
    scopes: ["lessons:read"],
    createdAt: 0,
    lastUsedAt: null,
    expiresAt: 86_400_000,
    revokedAt: null,
  }]);
  assertEquals(listing.split("\n")[0].split(/\s{2,}/), [
    "name",
    "prefix",
    "scopes",
    "created",
    "last used",
    "expires",
    "revoked",
  ]);
  assertStringIncludes(listing, prefix);
  assert(!listing.includes(token));
});
