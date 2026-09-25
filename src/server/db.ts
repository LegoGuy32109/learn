import { type Client, createClient } from "@tursodatabase/serverless/compat";

export type { Client };

/** One result row, indexed by column name. */
export type Row = Awaited<ReturnType<Client["execute"]>>["rows"][number];

export function createDb(): Client {
  const url = Deno.env.get("TURSO_DB_URL");
  const authToken = Deno.env.get("TURSO_DB_TOKEN");
  if (!url || !authToken) {
    throw new Error("TURSO_DB_URL and TURSO_DB_TOKEN must be set");
  }
  return createClient({ url, authToken });
}

export function integer(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("database integer is outside the safe range");
  }
  return parsed;
}
