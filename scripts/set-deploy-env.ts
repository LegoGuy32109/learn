// Sets Deno Deploy environment variables scoped to one context (Production,
// Preview, Local or Build) so the same key can hold a different value per
// context. `deno deploy env add` always writes an all-contexts entry and the
// backend then refuses a second entry for the key, so it cannot do this.
// The CLI's own tRPC mutation (envVarsContexts.updateEnvVars) accepts
// context_ids, and this script calls it with the CLI's own auth helpers.
//
// Usage:
//   deno run --env-file=.env -A --no-lock scripts/set-deploy-env.ts <Context> --from=<env file>
//   deno run --env-file=.env -A --no-lock scripts/set-deploy-env.ts <Context> <KEY> <value> [secret]
//
// The --from form reads TURSO_DB_URL and TURSO_DB_TOKEN from an ignored env
// file and never places a secret on the command line. `deno task deploy:env`
// runs it for Production (.env.prod), Preview (.env.dev) and Local (.env).
//
// Requires DENO_DEPLOY_TOKEN in the environment. Never print it. The CLI auth
// module pulls in npm packages that probe the OS, so the task runs with -A.

const authModuleUrl = "https://jsr.io/@deno/deploy/0.0.9904/auth.ts";
const { createTrpcClient, tokenStorage } = await import(authModuleUrl);

const ORG = "legoguy32109";
const APP = "learn-joshhale";
const FILE_KEYS: Array<{ key: string; secret: boolean }> = [
  { key: "TURSO_DB_URL", secret: false },
  { key: "TURSO_DB_TOKEN", secret: true },
];

interface Assignment {
  key: string;
  value: string;
  secret: boolean;
}

function usage(): never {
  console.error("Usage: scripts/set-deploy-env.ts <Context> --from=<env file>");
  console.error("       scripts/set-deploy-env.ts <Context> <KEY> <value> [secret]");
  Deno.exit(2);
}

async function assignmentsFromFile(path: string): Promise<Assignment[]> {
  const text = await Deno.readTextFile(path);
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values.set(match[1], match[2]);
  }
  return FILE_KEYS.map(({ key, secret }) => {
    const value = values.get(key);
    if (!value) throw new Error(`${path} has no ${key}`);
    return { key, value, secret };
  });
}

const [contextName, second, third, fourth] = Deno.args;
if (!contextName || !second) usage();
const fromPath = second.startsWith("--from=") ? second.slice("--from=".length) : undefined;
const assignments: Assignment[] = fromPath
  ? await assignmentsFromFile(fromPath)
  : third === undefined ? usage() : [{ key: second, value: third, secret: fourth === "secret" }];

const token = Deno.env.get("DENO_DEPLOY_TOKEN");
if (!token) throw new Error("DENO_DEPLOY_TOKEN must be set");
tokenStorage.set(token, true);

const trpcClient = createTrpcClient({
  debug: false,
  endpoint: "https://console.deno.com",
  json: true as const,
  nonInteractive: true as const,
});

const app = await trpcClient.query("apps.get", { org: ORG, app: APP }) as { id: string };
const contexts = await trpcClient.query("envVarsContexts.listContexts", { org: ORG }) as { id: string; name: string }[];
const target = contexts.find((context) => context.name === contextName);
if (!target) {
  throw new Error(`Context "${contextName}" not found. Known contexts: ${contexts.map((context) => context.name).join(", ")}`);
}

for (const assignment of assignments) {
  const existing = await trpcClient.query("envVarsContexts.list", { org: ORG, app: APP }) as
    { id: string; key: string; context_ids: string[] | null }[];
  const current = existing.find((variable) =>
    variable.key === assignment.key &&
    (variable.context_ids === null || variable.context_ids.includes(target.id))
  );
  const variable = {
    key: assignment.key,
    value: assignment.value,
    is_secret: assignment.secret,
    context_ids: current?.context_ids ?? [target.id],
  };
  await trpcClient.mutation("envVarsContexts.updateEnvVars", {
    org: ORG,
    add: current ? [] : [{ app_id: app.id, ...variable }],
    update: current ? [{ id: current.id, ...variable }] : [],
    remove: [],
  });
  console.log(`${current ? "Updated" : "Set"} ${assignment.key} in ${contextName}${assignment.secret ? " (secret)" : ""}.`);
}
