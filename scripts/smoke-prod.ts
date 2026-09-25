// Production smoke for the deployed application. It runs after every deploy.
//
// It fetches the shell, the rendered service worker, the capability document,
// the lesson schema and the downloadable validator, resolves the demo fixture
// without persistence, and lists lessons with the production owner token. The
// shell and the capability document must also carry Strict-Transport-Security. It prints one line per check
// and never prints a token. On a failure it prints the status, the serving
// revision from the `x-learn-revision` header and the response body.
//
// The owner token comes from the `.env.prod` file itself, never from the
// process environment. `--env-file` does not override a variable the parent
// process already set, so a caller that loaded `.env` (for example
// `deno task deploy`) would otherwise hand this script the local owner token,
// which production rejects with 401. Ticket 16 has the evidence.
//
// Ticket 51: it also compares the repository's migration history with what learn-prod reports as
// applied, and fails when they differ, so a deploy that somehow bypassed scripts/deploy.ts's own
// pre-flight guard (or a migration merged after the deploy that ran) is still caught here.
//
// Usage: deno task smoke:prod
// Environment: LEARN_BASE_URL (optional). File: .env.prod (LEARN_OWNER_TOKEN)

import { parse } from "jsr:@std/dotenv@0.225.8/parse";
import { redactBearerTokens } from "../src/server/identity/redaction.ts";
import { pendingProductionMigrations } from "./production-migrations.ts";

const REVISION_HEADER = "x-learn-revision";
const BODY_LIMIT = 2000;

const base = (Deno.env.get("LEARN_BASE_URL") ??
  "https://learn-joshhale.legoguy32109.deno.net").replace(/\/$/, "");
if (!base.startsWith("https://")) {
  throw new Error(`LEARN_BASE_URL must use https, got ${base}`);
}

const envPath = new URL("../.env.prod", import.meta.url);
const ownerToken = parse(await Deno.readTextFile(envPath)).LEARN_OWNER_TOKEN;
if (!ownerToken) {
  throw new Error(
    "LEARN_OWNER_TOKEN is missing from .env.prod; run deno task db:owner:prod",
  );
}
if (
  Deno.env.get("LEARN_OWNER_TOKEN") &&
  Deno.env.get("LEARN_OWNER_TOKEN") !== ownerToken
) {
  console.log(
    "NOTE the environment carries a different LEARN_OWNER_TOKEN; the smoke uses the one in .env.prod",
  );
}

const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../fixtures/lessons/browser-http-cache.json", import.meta.url),
  ),
);
const failures: string[] = [];
const revisions = new Set<string>();

function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  if (!ok) failures.push(name);
}

/** Everything the next person needs to see about a failed response, with any token removed. */
function describe(response: Response, text: string): string {
  const revision = response.headers.get(REVISION_HEADER) ??
    "(no revision header)";
  const body = text.length > BODY_LIMIT
    ? `${text.slice(0, BODY_LIMIT)}… (${text.length} bytes)`
    : text;
  return redactBearerTokens(
    `\n  status ${response.status}\n  revision ${revision}\n  body ${body}`,
  );
}

// The first request after a deploy can reach a cold isolate. One retry after a
// short pause keeps a single transient failure from failing the whole smoke,
// and the output says when the retry happened.
async function check(
  name: string,
  path: string,
  init: RequestInit,
  expect: (response: Response, text: string) => string | null,
): Promise<void> {
  let problem: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(`${base}${path}`, init);
      const text = await response.text();
      const revision = response.headers.get(REVISION_HEADER);
      if (revision) revisions.add(revision);
      problem = expect(response, text);
      if (problem === null) {
        report(
          name,
          true,
          `${response.status} ${path}${
            attempt > 1 ? " (after one retry)" : ""
          }`,
        );
        return;
      }
      problem = `${path} ${problem}${describe(response, text)}`;
    } catch (error) {
      problem = `${path} threw ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
    if (attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  report(name, false, problem ?? `${path} failed`);
}

function status(expected: number, response: Response): string | null {
  return response.status === expected
    ? null
    : `expected ${expected}, got ${response.status}`;
}

/** Ticket 26: every HTTPS response carries HSTS with a max-age of at least 180 days. */
function hsts(response: Response): string | null {
  const value = response.headers.get("strict-transport-security");
  if (!value) return "no strict-transport-security header";
  const maxAge = Number(value.match(/max-age=(\d+)/)?.[1] ?? 0);
  return maxAge >= 15552000
    ? null
    : `strict-transport-security max-age is ${maxAge}, below 15552000`;
}

try {
  const pending = await pendingProductionMigrations();
  report(
    "migrations",
    pending.length === 0,
    pending.length
      ? `learn-prod has not applied: ${pending.join(", ")}`
      : "learn-prod matches this checkout's migration history",
  );
} catch (error) {
  report(
    "migrations",
    false,
    error instanceof Error ? error.message : String(error),
  );
}

await check("shell", "/", {}, (response, text) => {
  if (status(200, response)) return status(200, response);
  if (!response.headers.get("content-type")?.startsWith("text/html")) {
    return "shell is not text/html";
  }
  if (hsts(response)) return hsts(response);
  return text.includes(fixture.title)
    ? null
    : "shell does not name the demo lesson";
});

// Ticket 25: a deploy that drops the worker source from the upload answered 404 here, and
// nothing installed or worked offline. The rendered worker must arrive as JavaScript with both
// placeholders substituted.
await check("service worker", "/sw.js", {}, (response, text) => {
  if (status(200, response)) return status(200, response);
  if (!response.headers.get("content-type")?.startsWith("text/javascript")) {
    return "worker is not text/javascript";
  }
  if (text.includes("__BUILD_HASH__")) {
    return "worker still carries the __BUILD_HASH__ placeholder";
  }
  if (text.includes("__PRECACHE__")) {
    return "worker still carries the __PRECACHE__ placeholder";
  }
  return text.includes("addEventListener")
    ? null
    : "worker body does not register a listener";
});

await check("capabilities", "/api/v1/capabilities", {}, (response, text) => {
  if (status(200, response)) return status(200, response);
  if (hsts(response)) return hsts(response);
  const body = JSON.parse(text);
  return body.apiVersion === "v1" && body.links?.validator
    ? null
    : "capability document is incomplete";
});

await check("schema", "/api/v1/schemas/lesson/v1", {}, (response, text) => {
  if (status(200, response)) return status(200, response);
  return JSON.parse(text).$schema ? null : "schema document has no $schema";
});

await check("validator", "/tools/lesson-validator.js", {}, (response, text) => {
  if (status(200, response)) return status(200, response);
  if (!response.headers.get("content-type")?.startsWith("text/javascript")) {
    return "validator is not text/javascript";
  }
  return text.length > 1000 ? null : "validator body is too short";
});

await check("resolve", "/api/v1/lesson-resolutions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(fixture),
}, (response, text) => {
  if (status(200, response)) return status(200, response);
  const body = JSON.parse(text);
  return body.valid === true && typeof body.fingerprint === "string"
    ? null
    : "demo fixture did not resolve as valid";
});

await check("list lessons", "/api/v1/lessons", {
  headers: { authorization: `Bearer ${ownerToken}` },
}, (response, text) => {
  if (status(200, response)) return status(200, response);
  const body = JSON.parse(text);
  if (!Array.isArray(body.revisions)) return "list has no revisions array";
  return body.revisions.some((revision: any) => revision.status === "published")
    ? null
    : "no published demo revision is listed";
});

const served = revisions.size
  ? [...revisions].join(", ")
  : "(no revision header seen)";
if (failures.length) {
  console.error(
    `Smoke failed: ${failures.join(", ")} (served by revision ${served})`,
  );
  Deno.exit(1);
}
console.log(`Smoke passed against ${base} (served by revision ${served})`);
