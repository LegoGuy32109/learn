// Create and destroy an isolated `learn-test-<uuid>` Turso database for one test run.
// Requires TURSO_API_KEY and TURSO_ORG_SLUG. Never logs the database token.

import { createClient, type Client } from "@tursodatabase/serverless/compat";
import { migrateDatabase } from "../../../src/server/migrations.ts";

export interface EphemeralDatabase {
  name: string;
  url: string;
  authToken: string;
  db: Client;
  destroy(): Promise<void>;
}

function platform(): { api: string; headers: HeadersInit } {
  const apiKey = Deno.env.get("TURSO_API_KEY");
  const org = Deno.env.get("TURSO_ORG_SLUG");
  if (!apiKey || !org) throw new Error("TURSO_API_KEY and TURSO_ORG_SLUG must be set to create an ephemeral database");
  return {
    api: `https://api.turso.tech/v1/organizations/${encodeURIComponent(org)}`,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  };
}

async function json(response: Response): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Turso API ${response.status}: ${body.error ?? body.message ?? "request failed"}`);
  return body;
}

async function waitUntilReady(db: Client): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await db.execute("SELECT 1");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw new Error(`ephemeral database did not become reachable: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/** Create `learn-test-<uuid>`, apply every migration, and return a client plus a destroy function. */
export async function createEphemeralDatabase(): Promise<EphemeralDatabase> {
  const { api, headers } = platform();
  const name = `learn-test-${crypto.randomUUID()}`;
  const created = await json(await fetch(`${api}/databases`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, group: "default", use_tursodb: true }),
  }));
  const database = created.database ?? created;
  const hostname = database.Hostname ?? database.hostname;
  const destroy = async () => {
    const response = await fetch(`${api}/databases/${encodeURIComponent(name)}`, { method: "DELETE", headers });
    if (!response.ok && response.status !== 404) throw new Error(`Turso API ${response.status}: could not delete ${name}`);
    await response.body?.cancel();
  };
  try {
    if (!hostname) throw new Error(`Turso did not return a hostname for ${name}`);
    const minted = await json(await fetch(
      `${api}/databases/${encodeURIComponent(name)}/auth/tokens?expiration=2h&authorization=full-access`,
      { method: "POST", headers },
    ));
    if (!minted.jwt) throw new Error(`Turso did not return a token for ${name}`);
    const url = `libsql://${hostname}`;
    const db = createClient({ url, authToken: minted.jwt });
    await waitUntilReady(db);
    await migrateDatabase(db);
    return { name, url, authToken: minted.jwt, db, destroy };
  } catch (error) {
    await destroy().catch(() => {});
    throw error;
  }
}

/** Insert one account and return its id. */
export async function createAccount(db: Client, displayName = "Ephemeral Owner"): Promise<string> {
  const id = crypto.randomUUID();
  await db.execute({ sql: "INSERT INTO accounts(id, display_name, created_at) VALUES (?, ?, ?)", args: [id, displayName, Date.now()] });
  return id;
}
