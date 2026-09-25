import { createDb } from "../src/server/db.ts";
import { base64Url } from "../src/server/identity/encoding.ts";
import { migrateDatabase } from "../src/server/migrations.ts";
import { newPersonalToken, tokenHash } from "../src/server/tokens.ts";

const OWNER_SCOPES = ["lessons:read", "lessons:write", "account:owner"];

async function setEnv(path: string, key: string, value: string): Promise<void> {
  const current = await Deno.readTextFile(path);
  const lines = current.split(/\r?\n/).filter((line) =>
    line && !line.startsWith(`${key}=`)
  );
  lines.push(`${key}=${value}`);
  await Deno.writeTextFile(path, `${lines.join("\n")}\n`, { mode: 0o600 });
  await Deno.chmod(path, 0o600);
}

async function hasEnv(path: string, key: string): Promise<boolean> {
  const current = await Deno.readTextFile(path).catch(() => "");
  return current.split(/\r?\n/).some((line) =>
    line.startsWith(`${key}=`) && line.length > key.length + 1
  );
}

const db = createDb();
const envPath =
  Deno.args.find((argument) => argument.startsWith("--env-path="))?.slice(
    "--env-path=".length,
  ) ?? ".env";
await migrateDatabase(db);
const existing = await db.execute({
  sql: "SELECT id FROM accounts WHERE display_name = ? LIMIT 1",
  args: ["Josh Hale"],
});
const accountId = existing.rows.length
  ? String(existing.rows[0].id)
  : crypto.randomUUID();
if (!existing.rows.length) {
  await db.execute({
    sql: "INSERT INTO accounts(id, display_name, created_at) VALUES (?, ?, ?)",
    args: [accountId, "Josh Hale", Date.now()],
  });
}

const prior = await db.execute({
  sql:
    "SELECT token_prefix, scopes_json FROM api_tokens WHERE account_id = ? AND name = ? AND revoked_at IS NULL",
  args: [accountId, "owner-cli"],
});
if (prior.rows.length) {
  const prefix = String(prior.rows[0].token_prefix);
  const scopes: string[] = JSON.parse(String(prior.rows[0].scopes_json));
  const missing = OWNER_SCOPES.filter((scope) => !scopes.includes(scope));
  if (missing.length) {
    // The owner CLI token is the one credential that mints phone invites; give an older one the scope it predates.
    await db.execute({
      sql: "UPDATE api_tokens SET scopes_json = ? WHERE token_prefix = ?",
      args: [JSON.stringify([...scopes, ...missing]), prefix],
    });
    console.log(
      `Owner account is ready; token prefix ${prefix} gained the ${
        missing.join(", ")
      } scope and was not rotated.`,
    );
  } else {
    console.log(
      `Owner account is ready; existing token prefix ${prefix} was not rotated.`,
    );
  }
} else {
  const created = newPersonalToken();
  await db.execute({
    sql:
      "INSERT INTO api_tokens(id, account_id, name, token_prefix, token_hash, scopes_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [
      crypto.randomUUID(),
      accountId,
      "owner-cli",
      created.prefix,
      await tokenHash(created.token),
      JSON.stringify(OWNER_SCOPES),
      Date.now(),
    ],
  });
  await setEnv(envPath, "LEARN_OWNER_TOKEN", created.token);
  console.log(
    `Owner account and token ${created.prefix}… are ready; the full token was written to ${envPath}.`,
  );
}

if (await hasEnv(envPath, "LEARN_SESSION_KEY")) {
  console.log("Browser session key is present.");
} else {
  await setEnv(
    envPath,
    "LEARN_SESSION_KEY",
    base64Url(crypto.getRandomValues(new Uint8Array(32))),
  );
  console.log(`A browser session key was written to ${envPath}.`);
}
