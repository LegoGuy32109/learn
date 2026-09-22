// A database or network failure during authentication is a server error, not
// an authentication error. Ticket 16 ruled this path out as the cause of the
// post-deploy 401 and pinned the behavior here.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { createApp, fixtureDependencies, REVISION_HEADER } from "../../src/app.ts";
import { TokenAuthenticator } from "../../src/server/auth.ts";
import type { Client } from "../../src/server/db.ts";
import { newPersonalToken, tokenHash } from "../../src/server/tokens.ts";

const { token } = newPersonalToken();
const bearer = { authorization: `Bearer ${token}` };

/** A database whose every query fails the way a lost connection or a timeout does. */
function failingDb(message: string): Client {
  return { execute() { return Promise.reject(new Error(message)); } } as unknown as Client;
}

/** A database that finds the token but fails on the `last_used_at` update. */
function failingOnUpdateDb(): Client {
  return {
    async execute(statement: { sql: string }) {
      if (statement.sql.startsWith("UPDATE")) throw new Error("connection reset during UPDATE");
      return { rows: [{ id: "t1", account_id: "a1", token_prefix: "prefix", scopes_json: JSON.stringify(["lessons:read"]), expires_at: null }] };
    },
  } as unknown as Client;
}

async function appWith(db: Client) {
  const previous = console.error;
  console.error = () => {};
  try {
    return createApp({ ...await fixtureDependencies(), auth: new TokenAuthenticator(db), revision: "rev-test" });
  } finally {
    console.error = previous;
  }
}

Deno.test("the authenticator rethrows a database failure instead of reporting unauthenticated", async () => {
  const authenticator = new TokenAuthenticator(failingDb("fetch failed: connect timeout"));
  const request = new Request("http://local/api/v1/lessons", { headers: bearer });
  await assertRejects(() => authenticator.authenticate(request, "lessons:read"), Error, "connect timeout");
});

Deno.test("a database failure on the token lookup answers 500 with a problem document", async () => {
  const app = await appWith(failingDb("fetch failed: connect timeout"));
  const previous = console.error;
  console.error = () => {};
  try {
    const response = await app(new Request("http://local/api/v1/lessons", { headers: bearer }));
    assertEquals(response.status, 500);
    assertEquals(response.headers.get("content-type"), "application/problem+json; charset=utf-8");
    assertEquals((await response.json()).title, "Internal server error");
  } finally {
    console.error = previous;
  }
});

Deno.test("a database failure on the last_used_at update answers 500, not 401", async () => {
  const app = await appWith(failingOnUpdateDb());
  const previous = console.error;
  console.error = () => {};
  try {
    const response = await app(new Request("http://local/api/v1/lessons", { headers: bearer }));
    assertEquals(response.status, 500);
    assertEquals((await response.json()).status, 500);
  } finally {
    console.error = previous;
  }
});

Deno.test("the error log never carries the bearer token", async () => {
  const logged: string[] = [];
  const previous = console.error;
  console.error = (line: unknown) => logged.push(String(line));
  try {
    const app = createApp({ ...await fixtureDependencies(), auth: new TokenAuthenticator(failingDb(`query with ${token} failed`)) });
    await app(new Request("http://local/api/v1/lessons", { headers: bearer }));
  } finally {
    console.error = previous;
  }
  const hash = await tokenHash(token);
  assert(logged.length > 0);
  assert(logged.every((line) => !line.includes(token)));
  assert(logged.every((line) => !line.includes(hash)));
});

Deno.test("every response names the serving revision", async () => {
  const app = createApp({ ...await fixtureDependencies(), revision: "rev-abc" });
  for (const path of ["/", "/api/v1/capabilities", "/no/such/route", "/api/v1/lessons"]) {
    const response = await app(new Request(`http://local${path}`));
    assertEquals(response.headers.get(REVISION_HEADER), "rev-abc", path);
    await response.body?.cancel();
  }
  const local = createApp(await fixtureDependencies());
  const response = await local(new Request("http://local/api/v1/capabilities"));
  assertEquals(response.headers.get(REVISION_HEADER), "local");
  await response.body?.cancel();
});
