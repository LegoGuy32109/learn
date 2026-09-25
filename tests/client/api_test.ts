// apiFetch names this copy's API revision on every call, and resets the device only when the
// server refuses the copy as outdated.
import { assertEquals } from "@std/assert";
import { readJson } from "../support/json.ts";
import { apiFetch } from "../../src/client/api.js";
import {
  API_REVISION,
  API_REVISION_HEADER,
} from "../../src/shared/api/revision.js";

function problem(status: number, code: string): Response {
  return new Response(JSON.stringify({ status, code }), {
    status,
    headers: { "content-type": "application/problem+json" },
  });
}

Deno.test("every call carries this copy's API revision, alongside its own headers", async () => {
  let sent: Headers | null = null;
  const fetch = (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = new Headers(init?.headers);
    return Promise.resolve(new Response("{}"));
  };
  await apiFetch("/api/v1/shelf", { headers: { accept: "application/json" } }, {
    fetch,
  });
  assertEquals(sent!.get(API_REVISION_HEADER), String(API_REVISION));
  assertEquals(sent!.get("accept"), "application/json");
});

Deno.test("client.outdated resets the device and the call never settles", async () => {
  let resets = 0;
  let settled = false;
  apiFetch("/api/v1/shelf", {}, {
    fetch: () => Promise.resolve(problem(409, "client.outdated")),
    reset: () => {
      resets += 1;
      return Promise.resolve();
    },
  }).then(() => settled = true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assertEquals(resets, 1);
  assertEquals(settled, false);
});

Deno.test("any other 409 is the caller's to handle", async () => {
  let resets = 0;
  const response = await apiFetch("/api/v1/progress/learning-events", {}, {
    fetch: () => Promise.resolve(problem(409, "epoch.stale")),
    reset: () => {
      resets += 1;
      return Promise.resolve();
    },
  });
  assertEquals(resets, 0);
  assertEquals(response.status, 409);
  // apiFetch read a clone, so the caller still gets the whole body.
  assertEquals(
    (await readJson<{ code: string }>(response)).code,
    "epoch.stale",
  );
});
