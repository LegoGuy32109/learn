// Read-only migration-parity check against learn-prod, shared by scripts/deploy.ts (pre-flight,
// before any upload) and scripts/smoke-prod.ts (post-deploy, as a rerunnable safety net). Ticket 51:
// migration 003 merged and deployed while learn-prod had never run it, and nothing before this
// caught it — every progress-sync route answered 500 for hours (ticket 50).
//
// TURSO_DB_URL and TURSO_DB_TOKEN are read from the `.env.prod` file itself, the same way
// scripts/smoke-prod.ts reads LEARN_OWNER_TOKEN from it: `--env-file` never overrides a variable
// the parent process already set, so trusting the process environment here could silently check
// whatever database a caller's own `.env` happened to load. This runs no migration; it only asks
// what is pending.
import { parse } from "jsr:@std/dotenv@0.225.8/parse";
import { createClient } from "@tursodatabase/serverless/compat";
import { pendingMigrations } from "../src/server/migrations.ts";

const envPath = new URL("../.env.prod", import.meta.url);

/** The migration versions this checkout has that `learn-prod` has not applied, oldest first. */
export async function pendingProductionMigrations(): Promise<string[]> {
  const parsed = parse(await Deno.readTextFile(envPath));
  const url = parsed.TURSO_DB_URL;
  const authToken = parsed.TURSO_DB_TOKEN;
  if (!url || !authToken) throw new Error("TURSO_DB_URL and TURSO_DB_TOKEN are missing from .env.prod; run deno task db:provision:prod");
  const db = createClient({ url, authToken });
  return await pendingMigrations(db);
}
