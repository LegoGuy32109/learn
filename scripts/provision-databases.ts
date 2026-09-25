const apiKey = Deno.env.get("TURSO_API_KEY");
const org = Deno.env.get("TURSO_ORG_SLUG");
if (!apiKey || !org) {
  throw new Error("TURSO_API_KEY and TURSO_ORG_SLUG must be set");
}

const api = `https://api.turso.tech/v1/organizations/${
  encodeURIComponent(org)
}`;
const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

interface DatabaseInfo {
  Name?: string;
  name?: string;
  Hostname?: string;
  hostname?: string;
}

async function json(response: Response): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Turso API ${response.status}: ${
        body.error ?? body.message ?? "request failed"
      }`,
    );
  }
  return body;
}

async function databases(): Promise<DatabaseInfo[]> {
  return (await json(await fetch(`${api}/databases`, { headers }))).databases ??
    [];
}

async function ensureDatabase(name: string): Promise<DatabaseInfo> {
  const existing = (await databases()).find((database) =>
    (database.Name ?? database.name) === name
  );
  if (existing) return existing;
  const created = await json(
    await fetch(`${api}/databases`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, group: "default", use_tursodb: true }),
    }),
  );
  return created.database ?? created;
}

async function token(name: string): Promise<string> {
  const result = await json(
    await fetch(
      `${api}/databases/${
        encodeURIComponent(name)
      }/auth/tokens?expiration=never&authorization=full-access`,
      { method: "POST", headers },
    ),
  );
  if (!result.jwt) throw new Error(`Turso did not return a token for ${name}`);
  return result.jwt;
}

async function updateEnv(
  path: string,
  values: Record<string, string>,
): Promise<void> {
  const current = await Deno.readTextFile(path).catch(() => "");
  const retained = current.split(/\r?\n/).filter((line) => {
    const key = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1];
    return !key || !(key in values);
  }).filter(Boolean);
  for (const [key, value] of Object.entries(values)) {
    retained.push(`${key}=${value}`);
  }
  await Deno.writeTextFile(path, `${retained.join("\n")}\n`, { mode: 0o600 });
  await Deno.chmod(path, 0o600);
}

for (const environment of ["local", "dev"] as const) {
  const name = `learn-${environment}`;
  const database = await ensureDatabase(name);
  const hostname = database.Hostname ?? database.hostname;
  if (!hostname) throw new Error(`Turso did not return a hostname for ${name}`);
  const values = {
    TURSO_DB_URL: `libsql://${hostname}`,
    TURSO_DB_TOKEN: await token(name),
  };
  await updateEnv(environment === "local" ? ".env" : ".env.dev", values);
  console.log(`${name}: ready`);
}
