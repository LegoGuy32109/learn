// Production smoke for the deployed application. It runs after every deploy.
//
// It fetches the shell, the capability document, the lesson schema and the
// downloadable validator, resolves the demo fixture without persistence, and
// lists lessons with the production owner token. It prints one line per check
// and never prints a token.
//
// Usage: deno task smoke:prod
// Environment: LEARN_OWNER_TOKEN (required), LEARN_BASE_URL (optional)

const base = (Deno.env.get("LEARN_BASE_URL") ?? "https://learn-joshhale.legoguy32109.deno.net").replace(/\/$/, "");
const ownerToken = Deno.env.get("LEARN_OWNER_TOKEN");
if (!ownerToken) throw new Error("LEARN_OWNER_TOKEN must be set; load .env.prod");
if (!base.startsWith("https://")) throw new Error(`LEARN_BASE_URL must use https, got ${base}`);

const fixture = JSON.parse(await Deno.readTextFile(new URL("../fixtures/lessons/browser-http-cache.json", import.meta.url)));
const failures: string[] = [];

function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  if (!ok) failures.push(name);
}

// The first request after a deploy can reach a cold isolate. One retry after a
// short pause keeps a single transient failure from failing the whole smoke,
// and the output says when the retry happened.
async function check(name: string, path: string, init: RequestInit, expect: (response: Response, text: string) => string | null): Promise<void> {
  let problem: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(`${base}${path}`, init);
      const text = await response.text();
      problem = expect(response, text);
      if (problem === null) {
        report(name, true, `${response.status} ${path}${attempt > 1 ? " (after one retry)" : ""}`);
        return;
      }
    } catch (error) {
      problem = `${path} threw ${error instanceof Error ? error.message : String(error)}`;
    }
    if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  report(name, false, problem ?? `${path} failed`);
}

function status(expected: number, response: Response): string | null {
  return response.status === expected ? null : `expected ${expected}, got ${response.status}`;
}

await check("shell", "/", {}, (response, text) => {
  if (status(200, response)) return status(200, response);
  if (!response.headers.get("content-type")?.startsWith("text/html")) return "shell is not text/html";
  return text.includes(fixture.title) ? null : "shell does not name the demo lesson";
});

await check("capabilities", "/api/v1/capabilities", {}, (response, text) => {
  if (status(200, response)) return status(200, response);
  const body = JSON.parse(text);
  return body.apiVersion === "v1" && body.links?.validator ? null : "capability document is incomplete";
});

await check("schema", "/api/v1/schemas/lesson/v1", {}, (response, text) => {
  if (status(200, response)) return status(200, response);
  return JSON.parse(text).$schema ? null : "schema document has no $schema";
});

await check("validator", "/tools/lesson-validator.js", {}, (response, text) => {
  if (status(200, response)) return status(200, response);
  if (!response.headers.get("content-type")?.startsWith("text/javascript")) return "validator is not text/javascript";
  return text.length > 1000 ? null : "validator body is too short";
});

await check("resolve", "/api/v1/lesson-resolutions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(fixture),
}, (response, text) => {
  if (status(200, response)) return status(200, response);
  const body = JSON.parse(text);
  return body.valid === true && typeof body.fingerprint === "string" ? null : "demo fixture did not resolve as valid";
});

await check("list lessons", "/api/v1/lessons", {
  headers: { authorization: `Bearer ${ownerToken}` },
}, (response, text) => {
  if (status(200, response)) return status(200, response);
  const body = JSON.parse(text);
  if (!Array.isArray(body.revisions)) return "list has no revisions array";
  return body.revisions.some((revision: any) => revision.status === "published") ? null : "no published demo revision is listed";
});

if (failures.length) {
  console.error(`Smoke failed: ${failures.join(", ")}`);
  Deno.exit(1);
}
console.log(`Smoke passed against ${base}`);
