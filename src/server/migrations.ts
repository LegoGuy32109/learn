import type { Client } from "./db.ts";

const directory = new URL("../../migrations/", import.meta.url);

interface Migration {
  version: string;
  sql: string;
  checksum: string;
}

function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function migrations(): Promise<Migration[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    if (entry.isFile && /^\d{3}_[a-z0-9_]+\.sql$/.test(entry.name)) names.push(entry.name);
  }
  return await Promise.all(names.sort().map(async (version) => {
    const sql = await Deno.readTextFile(new URL(version, directory));
    return { version, sql, checksum: await sha256(sql) };
  }));
}

export async function migrateDatabase(db: Client): Promise<string[]> {
  await db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)");
  const appliedRows = await db.execute("SELECT version, checksum FROM schema_migrations");
  const applied = new Map(appliedRows.rows.map((row) => [String(row.version), String(row.checksum)]));
  const pending: Migration[] = [];
  for (const migration of await migrations()) {
    const checksum = applied.get(migration.version);
    if (checksum && checksum !== migration.checksum) throw new Error(`migration ${migration.version} changed after application`);
    if (!checksum) pending.push(migration);
  }
  for (const migration of pending) {
    await db.batch([
      ...splitStatements(migration.sql),
      { sql: "INSERT INTO schema_migrations(version, checksum, applied_at) VALUES (?, ?, ?)", args: [migration.version, migration.checksum, Date.now()] },
    ], "immediate");
  }
  return pending.map((migration) => migration.version);
}

