// Ticket 26: every HTTPS response carries Strict-Transport-Security; a plain
// http://localhost request never does, so a browser does not remember HSTS for
// the port-less development host.
import { assert, assertEquals } from "jsr:@std/assert";
import { createApp, fixtureDependencies, HSTS_VALUE, isSecureRequest } from "../../src/app.ts";

const app = createApp(await fixtureDependencies());
const HSTS = "strict-transport-security";

/** A page, an API document and a problem response: the three response shapes the wrapper sees. */
const PATHS = ["/", "/api/v1/capabilities", "/no/such/route"];

Deno.test("every HTTPS response carries HSTS with a max-age of at least 180 days", async () => {
  for (const path of PATHS) {
    const response = await app(new Request(`https://learn.example${path}`));
    const value = response.headers.get(HSTS);
    assertEquals(value, HSTS_VALUE, path);
    const maxAge = Number(value?.match(/max-age=(\d+)/)?.[1] ?? 0);
    assert(maxAge >= 15552000, `${path}: max-age ${maxAge} is under 180 days`);
    await response.body?.cancel();
  }
});

Deno.test("the problem response for a missing route is still a problem document with HSTS", async () => {
  const response = await app(new Request("https://learn.example/no/such/route"));
  assertEquals(response.status, 404);
  assert(response.headers.get("content-type")?.startsWith("application/problem+json"));
  assertEquals(response.headers.get(HSTS), HSTS_VALUE);
  await response.body?.cancel();
});

Deno.test("a plain http://localhost request carries no HSTS", async () => {
  for (const path of PATHS) {
    const response = await app(new Request(`http://localhost:8000${path}`));
    assertEquals(response.headers.get(HSTS), null, path);
    await response.body?.cancel();
  }
});

Deno.test("a request the edge forwarded from HTTPS counts as secure", () => {
  assert(isSecureRequest(new Request("https://learn.example/")));
  assert(isSecureRequest(new Request("http://app.internal/", { headers: { "x-forwarded-proto": "https" } })));
  assert(isSecureRequest(new Request("http://app.internal/", { headers: { "x-forwarded-proto": "https, http" } })));
  assert(!isSecureRequest(new Request("http://localhost:8000/")));
  assert(!isSecureRequest(new Request("http://localhost:8000/", { headers: { "x-forwarded-proto": "http" } })));
});

Deno.test("every response says nosniff and same-origin referrers", async () => {
  for (const url of ["https://learn.example/", "http://localhost:8000/api/v1/capabilities"]) {
    const response = await app(new Request(url));
    assertEquals(response.headers.get("x-content-type-options"), "nosniff", url);
    assertEquals(response.headers.get("referrer-policy"), "same-origin", url);
    await response.body?.cancel();
  }
});
