// Token lifecycle against an ephemeral learn-test-<uuid> database, plus a
// real-process smoke through main.ts and scripts/tokens.ts.
// Every assertion message and log line goes through redaction.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { createApp } from "../../src/app.ts";
import { TokenAuthenticator } from "../../src/server/auth.ts";
import { TursoLessonRepository } from "../../src/server/repositories/lessons.ts";
import { TokenAdmin, TokenAdminError } from "../../src/server/identity/token-admin.ts";
import { redactBearerTokens } from "../../src/server/identity/redaction.ts";
import { createAccount, createEphemeralDatabase } from "./support/ephemeral.ts";

const METADATA_KEYS = ["name", "prefix", "scopes", "createdAt", "lastUsedAt", "expiresAt", "revokedAt"].sort();

function bearer(token: string): HeadersInit {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function status(response: Response): Promise<number> {
  await response.body?.cancel();
  return response.status;
}

async function rows(db: { execute: (query: any) => Promise<any> }, prefix: string): Promise<Record<string, unknown>> {
  const result = await db.execute({ sql: "SELECT * FROM api_tokens WHERE token_prefix = ?", args: [prefix] });
  return result.rows[0] as Record<string, unknown>;
}

Deno.test("token lifecycle in an ephemeral database", async (t) => {
  const ephemeral = await createEphemeralDatabase();
  const { db } = ephemeral;
  try {
    const accountId = await createAccount(db);
    let now = Date.now();
    const clock = () => now;
    const admin = new TokenAdmin(db, clock);
    const app = createApp({ lessons: new TursoLessonRepository(db), auth: new TokenAuthenticator(db, clock) });
    const listLessons = (token: string) => app(new Request("http://local/api/v1/lessons", { headers: bearer(token) }));
    const createLesson = (token: string) => app(new Request("http://local/api/v1/lessons", { method: "POST", headers: bearer(token), body: JSON.stringify(lesson) }));

    const reader = await admin.mint({ accountId, name: "reader", scopes: ["lessons:read"] });

    await t.step("only a prefix and a SHA-256 hash are stored; the secret is not recoverable", async () => {
      const row = await rows(db, reader.metadata.prefix);
      assertEquals(String(row.token_prefix), reader.metadata.prefix);
      assertEquals(String(row.token_hash).length, 64);
      assert(!Object.values(row).some((value) => String(value).includes(reader.token)), "a stored column contains the raw token");
      assertEquals(reader.token.length, "learn_pat_".length + 10 + 1 + 43);
    });

    await t.step("a read-only token can list lessons and gets 403 on create", async () => {
      assertEquals(await status(await listLessons(reader.token)), 200);
      const forbidden = await createLesson(reader.token);
      assertEquals(forbidden.status, 403);
      const body = await forbidden.text();
      assertStringIncludes(body, "lessons:write");
      assert(!body.includes(reader.token));
    });

    await t.step("successful and forbidden authentication both update last_used_at", async () => {
      now += 1000;
      await status(await listLessons(reader.token));
      assertEquals(Number((await rows(db, reader.metadata.prefix)).last_used_at), now);
      now += 1000;
      await status(await createLesson(reader.token));
      assertEquals(Number((await rows(db, reader.metadata.prefix)).last_used_at), now);
    });

    await t.step("listing shows exactly name, prefix, scopes, created, last used, expiry and revoked", async () => {
      const listed = await admin.list(accountId);
      assertEquals(listed.length, 1);
      assertEquals(Object.keys(listed[0]).sort(), METADATA_KEYS);
      assertEquals(listed[0].name, "reader");
      assertEquals(listed[0].scopes, ["lessons:read"]);
      assertEquals(listed[0].lastUsedAt, now);
      assertEquals(listed[0].expiresAt, null);
      assertEquals(listed[0].revokedAt, null);
      const serialized = JSON.stringify(listed);
      assert(!serialized.includes(reader.token));
      assert(!serialized.includes(String((await rows(db, reader.metadata.prefix)).token_hash)));
    });

    await t.step("an active name cannot be minted twice, and unknown scopes are rejected", async () => {
      await assertRejectsAdmin(() => admin.mint({ accountId, name: "reader", scopes: ["lessons:read"] }));
      await assertRejectsAdmin(() => admin.mint({ accountId, name: "publisher", scopes: ["lessons:publish"] }));
      await assertRejectsAdmin(() => admin.mint({ accountId, name: "past", scopes: ["lessons:read"], expiresAt: now - 1 }));
    });

    await t.step("an expired token gets 401 the moment its expiry passes", async () => {
      const shortLived = await admin.mint({ accountId, name: "short-lived", scopes: ["lessons:read", "lessons:write"], expiresAt: now + 60_000 });
      assertEquals(await status(await listLessons(shortLived.token)), 200);
      now += 60_000;
      assertEquals(await status(await listLessons(shortLived.token)), 401);
      await assertRejectsAdmin(() => admin.rotate(accountId, shortLived.metadata.prefix));
    });

    await t.step("malformed, unknown and foreign tokens get 401", async () => {
      assertEquals(await status(await app(new Request("http://local/api/v1/lessons"))), 401);
      assertEquals(await status(await listLessons("not-a-token")), 401);
      const forged = reader.token.slice(0, -1) + (reader.token.endsWith("A") ? "B" : "A");
      assertEquals(await status(await listLessons(forged)), 401);
    });

    await t.step("rotation confirms the new token before revoking the old one", async () => {
      now += 1000;
      const rotated = await admin.rotate(accountId, reader.metadata.prefix);
      assertEquals(rotated.replacedPrefix, reader.metadata.prefix);
      assertEquals(rotated.metadata.name, "reader");
      assertEquals(rotated.metadata.scopes, ["lessons:read"]);
      assert(rotated.token !== reader.token);
      assertEquals(await status(await listLessons(reader.token)), 401);
      assertEquals(await status(await listLessons(rotated.token)), 200);
      const old = await admin.find(accountId, { prefix: reader.metadata.prefix });
      assertEquals(old?.revokedAt, now);
      const byName = await admin.find(accountId, { name: "reader" });
      assertEquals(byName?.prefix, rotated.metadata.prefix);
      await assertRejectsAdmin(() => admin.rotate(accountId, reader.metadata.prefix));
      reader.token = rotated.token;
      reader.metadata = rotated.metadata;
    });

    await t.step("revocation is immediate and cannot be repeated", async () => {
      now += 1000;
      const revoked = await admin.revoke(accountId, reader.metadata.prefix);
      assertEquals(revoked.revokedAt, now);
      assertEquals(await status(await listLessons(reader.token)), 401);
      await assertRejectsAdmin(() => admin.revoke(accountId, reader.metadata.prefix));
      const active = (await admin.list(accountId)).filter((token) => token.revokedAt == null);
      assertEquals(active.map((token) => token.name), ["short-lived"]);
    });

    await t.step("real-process smoke: mint with the script, use it, revoke it, and the next request fails", async () => {
      await realProcessSmoke(ephemeral.url, ephemeral.authToken);
    });
  } finally {
    await ephemeral.destroy();
  }
});

async function assertRejectsAdmin(work: () => Promise<unknown>): Promise<void> {
  let failure: unknown = null;
  try { await work(); } catch (error) { failure = error; }
  assert(failure instanceof TokenAdminError, `expected TokenAdminError, got ${redactBearerTokens(String(failure))}`);
}

async function runScript(env: Record<string, string>, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-env=TURSO_DB_URL,TURSO_DB_TOKEN", "--allow-net", "--allow-read", "scripts/tokens.ts", ...args],
    env,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  return { code: output.code, stdout: new TextDecoder().decode(output.stdout), stderr: new TextDecoder().decode(output.stderr) };
}

async function waitForServer(base: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/v1/capabilities`);
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("server process did not start");
}

async function realProcessSmoke(url: string, authToken: string): Promise<void> {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}`;
  const env = { TURSO_DB_URL: url, TURSO_DB_TOKEN: authToken, PORT: String(port) };
  const server = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-env=TURSO_DB_URL,TURSO_DB_TOKEN,PORT", "--allow-net", "--allow-read", "main.ts"],
    env,
    stdout: "null",
    stderr: "piped",
  }).spawn();
  const stderr = server.stderr.getReader();
  const captured: string[] = [];
  const drain = (async () => {
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await stderr.read();
      if (done) break;
      captured.push(redactBearerTokens(decoder.decode(value)));
    }
  })();
  try {
    await waitForServer(base);

    const minted = await runScript(env, ["mint", "--name", "smoke", "--scopes", "lessons:read", "--expires-in", "1h", "--json"]);
    assertEquals(minted.code, 0, redactBearerTokens(minted.stderr));
    const { token, metadata } = JSON.parse(minted.stdout);
    assert(typeof token === "string" && token.startsWith(`learn_pat_${metadata.prefix}_`));

    const listed = await runScript(env, ["list"]);
    assertEquals(listed.code, 0, listed.stderr);
    assertStringIncludes(listed.stdout, metadata.prefix);
    assert(!listed.stdout.includes(token), "list printed the full token");

    const read = await fetch(`${base}/api/v1/lessons`, { headers: bearer(token) });
    assertEquals(await status(read), 200);
    const write = await fetch(`${base}/api/v1/lessons`, { method: "POST", headers: bearer(token), body: JSON.stringify(lesson) });
    assertEquals(await status(write), 403);

    const revoked = await runScript(env, ["revoke", "--prefix", metadata.prefix]);
    assertEquals(revoked.code, 0, revoked.stderr);
    assertStringIncludes(revoked.stdout, metadata.prefix);
    assert(!revoked.stdout.includes(token));

    const afterRevoke = await fetch(`${base}/api/v1/lessons`, { headers: bearer(token) });
    assertEquals(await status(afterRevoke), 401);

    const again = await runScript(env, ["revoke", "--prefix", metadata.prefix]);
    assertEquals(again.code, 1);
    assertStringIncludes(again.stderr, "already revoked");

    assert(!captured.join("").includes(token), "server log leaked the token");
  } finally {
    server.kill("SIGTERM");
    await server.status;
    await drain;
  }
}
