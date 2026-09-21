import { createDb } from "../src/server/db.ts";
import { migrateDatabase } from "../src/server/migrations.ts";
import { newPersonalToken, tokenHash } from "../src/server/tokens.ts";

async function setEnv(path: string, key: string, value: string): Promise<void> {
  const current = await Deno.readTextFile(path);
  const lines = current.split(/\r?\n/).filter((line) => line && !line.startsWith(`${key}=`));
  lines.push(`${key}=${value}`);
  await Deno.writeTextFile(path, `${lines.join("\n")}\n`, { mode: 0o600 });
  await Deno.chmod(path, 0o600);
}

const db = createDb();
const envPath = Deno.args.find((argument) => argument.startsWith("--env-path="))?.slice("--env-path=".length) ?? ".env";
await migrateDatabase(db);
const existing = await db.execute({ sql: "SELECT id FROM accounts WHERE display_name = ? LIMIT 1", args: ["Josh Hale"] });
const accountId = existing.rows.length ? String(existing.rows[0].id) : crypto.randomUUID();
if (!existing.rows.length) {
  await db.execute({ sql: "INSERT INTO accounts(id, display_name, created_at) VALUES (?, ?, ?)", args: [accountId, "Josh Hale", Date.now()] });
}

const prior = await db.execute({ sql: "SELECT token_prefix FROM api_tokens WHERE account_id = ? AND name = ? AND revoked_at IS NULL", args: [accountId, "owner-cli"] });
if (prior.rows.length) {
  console.log(`Owner account is ready; existing token prefix ${String(prior.rows[0].token_prefix)} was not rotated.`);
} else {
  const created = newPersonalToken();
  await db.execute({
    sql: "INSERT INTO api_tokens(id, account_id, name, token_prefix, token_hash, scopes_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), accountId, "owner-cli", created.prefix, await tokenHash(created.token), JSON.stringify(["lessons:read", "lessons:write"]), Date.now()],
  });
  await setEnv(envPath, "LEARN_OWNER_TOKEN", created.token);
  console.log(`Owner account and token ${created.prefix}… are ready; the full token was written to ${envPath}.`);
}
