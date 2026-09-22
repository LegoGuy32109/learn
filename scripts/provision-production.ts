// Creates the learn-prod Turso database once and writes its connection to the
// ignored .env.prod file. The database uses the same engine setting as
// learn-local and learn-dev. The token is minted only when .env.prod has none,
// so rerunning the script never rotates production credentials by accident.
// Pass --rotate-token to mint a replacement token on purpose.
//
// Usage: deno task db:provision:prod [--rotate-token]

const apiKey = Deno.env.get("TURSO_API_KEY");
const org = Deno.env.get("TURSO_ORG_SLUG");
if (!apiKey || !org) throw new Error("TURSO_API_KEY and TURSO_ORG_SLUG must be set");

const name = "learn-prod";
const envPath = ".env.prod";
const rotate = Deno.args.includes("--rotate-token");
const api = `https://api.turso.tech/v1/organizations/${encodeURIComponent(org)}`;
const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

interface DatabaseInfo {
  Name?: string;
  name?: string;
  Hostname?: string;
  hostname?: string;
}

async function json(response: Response): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Turso API ${response.status}: ${body.error ?? body.message ?? "request failed"}`);
  return body;
}

async function ensureDatabase(): Promise<{ database: DatabaseInfo; created: boolean }> {
  const listed = (await json(await fetch(`${api}/databases`, { headers }))).databases ?? [];
  const existing = listed.find((database: DatabaseInfo) => (database.Name ?? database.name) === name);
  if (existing) return { database: existing, created: false };
  const created = await json(await fetch(`${api}/databases`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name, group: "default", use_tursodb: true }),
  }));
  return { database: created.database ?? created, created: true };
}

async function mintToken(): Promise<string> {
  const result = await json(await fetch(
    `${api}/databases/${encodeURIComponent(name)}/auth/tokens?expiration=never&authorization=full-access`,
    { method: "POST", headers },
  ));
  if (!result.jwt) throw new Error(`Turso did not return a token for ${name}`);
  return result.jwt;
}

async function readEnv(path: string): Promise<Map<string, string>> {
  const text = await Deno.readTextFile(path).catch(() => "");
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

async function updateEnv(path: string, values: Record<string, string>): Promise<void> {
  const current = await Deno.readTextFile(path).catch(() => "");
  const retained = current.split(/\r?\n/).filter((line) => {
    const key = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1];
    return !key || !(key in values);
  }).filter(Boolean);
  for (const [key, value] of Object.entries(values)) retained.push(`${key}=${value}`);
  await Deno.writeTextFile(path, `${retained.join("\n")}\n`, { mode: 0o600 });
  await Deno.chmod(path, 0o600);
}

const { database, created } = await ensureDatabase();
const hostname = database.Hostname ?? database.hostname;
if (!hostname) throw new Error(`Turso did not return a hostname for ${name}`);
const existing = await readEnv(envPath);
const values: Record<string, string> = { TURSO_DB_URL: `libsql://${hostname}` };
const needsToken = rotate || !existing.get("TURSO_DB_TOKEN");
if (needsToken) values.TURSO_DB_TOKEN = await mintToken();
await updateEnv(envPath, values);
console.log(`${name}: ${created ? "created" : "already existed"}; connection written to ${envPath}.`);
console.log(needsToken ? `${name}: ${rotate ? "rotated" : "minted"} a database token.` : `${name}: kept the existing database token.`);
