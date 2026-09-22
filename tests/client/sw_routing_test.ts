import { assert, assertEquals } from "jsr:@std/assert";
import { cacheName, classifyRequest, staleCaches } from "../../src/client/pwa/sw-routing.js";
import { canInterrupt } from "../../src/client/pwa/update-policy.js";
import { initialFlow } from "../../src/client/learning/flow.js";

const precache = new Set(["/shell", "/css/app.css", "/js/app.js", "/src/client/learning/flow.js", "/icons/icon-192.png", "/manifest.webmanifest"]);

/** @param {string} pathname */
function get(pathname: string, mode = "no-cors") {
  return classifyRequest({ pathname, method: "GET", mode }, precache);
}

Deno.test("every /api/ path bypasses the cache, even when it is a GET", () => {
  assertEquals(get("/api/v1/lessons"), "network-only");
  assertEquals(get("/api/v1/lessons/abc/revisions/def"), "network-only");
  assertEquals(get("/api/v1/schemas/lesson/v1"), "network-only");
  assertEquals(get("/api/v1/lesson-resolutions"), "network-only");
});

Deno.test("every mutation bypasses the cache regardless of path", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assertEquals(classifyRequest({ pathname: "/css/app.css", method, mode: "cors" }, precache), "network-only");
    assertEquals(classifyRequest({ pathname: "/api/v1/lessons", method, mode: "cors" }, precache), "network-only");
  }
});

Deno.test("page loads are navigations, whatever the path", () => {
  assertEquals(get("/", "navigate"), "navigate");
  assertEquals(get("/learn/7a1f7700-0000-4000-8000-000000000001", "navigate"), "navigate");
  assertEquals(get("/shell", "navigate"), "navigate");
});

Deno.test("precached shell assets are served from the versioned cache", () => {
  assertEquals(get("/css/app.css"), "shell");
  assertEquals(get("/js/app.js"), "shell");
  assertEquals(get("/src/client/learning/flow.js"), "shell");
  assertEquals(get("/icons/icon-192.png"), "shell");
  assertEquals(get("/manifest.webmanifest"), "shell");
  assertEquals(get("/shell"), "shell");
});

Deno.test("the worker scripts, discovery documents and unknown paths pass through untouched", () => {
  assertEquals(get("/sw.js"), "pass-through");
  assertEquals(get("/sw-routing.js"), "pass-through");
  assertEquals(get("/openapi.json"), "pass-through");
  assertEquals(get("/.well-known/learn-joshhale.json"), "pass-through");
  assertEquals(get("/tools/lesson-validator.js"), "pass-through");
  assertEquals(get("/css/missing.css"), "pass-through");
});

Deno.test("the cache is named by the build hash and only stale shell caches are swept", () => {
  assertEquals(cacheName("abc123"), "learn-shell-abc123");
  assert(cacheName("abc123") !== cacheName("abc124"));
  const names = ["learn-shell-old1", "learn-shell-abc123", "learn-shell-old2", "other-app-cache"];
  assertEquals(staleCaches(names, "learn-shell-abc123"), ["learn-shell-old1", "learn-shell-old2"]);
  assertEquals(staleCaches(["learn-shell-abc123"], "learn-shell-abc123"), []);
});

Deno.test("an update may not interrupt an unanswered Question", () => {
  const flow = initialFlow();
  assert(canInterrupt("shelf", null));
  assert(canInterrupt("overview", null));
  assert(canInterrupt("learn", flow));
  const question = { ...flow, screen: "question", feedback: null };
  assertEquals(canInterrupt("learn", question), false);
  assert(canInterrupt("learn", { ...question, feedback: { correct: true, text: "" } }));
  assert(canInterrupt("learn", { ...flow, screen: "corrective" }));
  assert(canInterrupt("learn", { ...flow, screen: "summary" }));
});
