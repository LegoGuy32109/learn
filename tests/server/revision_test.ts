// A copy of the browser application older than the server's API revision is refused with
// client.outdated, so it resets itself. Nothing else is: not a request without the header (an
// agent, a script, curl), not the current revision, not sign-out, not a page or an asset.
import { assertEquals } from "@std/assert";
import { app } from "../../src/app.ts";
import {
  API_REVISION,
  API_REVISION_HEADER,
} from "../../src/shared/api/revision.js";
import type { OutdatedClientReply } from "../../src/shared/api/v1.d.ts";
import { readJson } from "../support/json.ts";

const call = (path: string, revision?: string, method = "GET") =>
  app(
    new Request(`http://local${path}`, {
      method,
      headers: revision === undefined
        ? {}
        : { [API_REVISION_HEADER]: revision },
    }),
  );

Deno.test("an older API revision, or one that is not a number, is refused as outdated", async () => {
  for (const sent of [String(API_REVISION - 1), "0", "soon", ""]) {
    const response = await call("/api/v1/session", sent);
    assertEquals(response.status, 409, `revision ${JSON.stringify(sent)}`);
    const body = await readJson<OutdatedClientReply>(response);
    assertEquals(body.code, "client.outdated");
    assertEquals(body.revision, API_REVISION);
  }
});

Deno.test("the current revision, no header, sign-out and non-API paths are never refused", async () => {
  const current = await call("/api/v1/session", String(API_REVISION));
  assertEquals(current.status, 200);
  await current.body?.cancel();
  const newer = await call("/api/v1/session", String(API_REVISION + 1));
  assertEquals(newer.status, 200);
  await newer.body?.cancel();
  const agent = await call("/api/v1/capabilities");
  assertEquals(agent.status, 200);
  await agent.body?.cancel();
  const signOut = await call("/api/v1/session", "0", "DELETE");
  assertEquals(signOut.status, 200);
  await signOut.body?.cancel();
  const page = await call("/", "0");
  assertEquals(page.status, 200);
  await page.body?.cancel();
});
