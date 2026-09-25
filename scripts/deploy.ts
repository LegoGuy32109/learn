// Deploys the working tree to the Deno Deploy application `learn-joshhale` in
// the organization `legoguy32109` as a production revision, then runs the
// production smoke. The upload honors .gitignore and the deploy.exclude list
// in deno.json, so no env file leaves this machine.
//
// The deploy CLI rewrites deno.json (it re-serializes the file and drops the
// trailing newline). This script keeps the bytes it found and restores them
// after the CLI exits, so a deploy leaves a clean tree.
//
// Usage: deno task deploy [--no-smoke]
// Requires DENO_DEPLOY_TOKEN in the environment. Never print it.
//
// Ticket 51: before anything is uploaded, this refuses to deploy when learn-prod has a pending
// migration. Migration 003 once merged and deployed while learn-prod had never run it, and the
// serving code threw on every progress-sync route for hours (ticket 50) before anyone noticed.
// The application itself never runs a migration (docs/turso-databases.md); apply one with
// `deno task db:migrate:prod` first.

import { pendingProductionMigrations } from "./production-migrations.ts";

const ORG = "legoguy32109";
const APP = "learn-joshhale";
const CONFIG = new URL("../deno.json", import.meta.url);

if (!Deno.env.get("DENO_DEPLOY_TOKEN")) {
  throw new Error("DENO_DEPLOY_TOKEN must be set; load .env");
}

const pending = await pendingProductionMigrations();
if (pending.length) {
  console.error(
    `Refusing to deploy: learn-prod has not applied ${pending.length} migration(s) this checkout carries: ${
      pending.join(", ")
    }.\n` +
      "Run `deno task db:migrate:prod` first, then deploy again.",
  );
  Deno.exit(1);
}

const configBefore = await Deno.readFile(CONFIG);

const deploy = new Deno.Command("deno", {
  args: [
    "run",
    "-A",
    "--no-lock",
    "jsr:@deno/deploy@0.0.9904",
    "--json",
    "--non-interactive",
    "--org",
    ORG,
    "--app",
    APP,
    "--prod",
    ".",
  ],
  stdout: "piped",
  stderr: "inherit",
});
const result = await deploy.output();

const configAfter = await Deno.readFile(CONFIG);
if (!bytesEqual(configBefore, configAfter)) {
  await Deno.writeFile(CONFIG, configBefore);
  console.log(
    `Restored deno.json after the deploy CLI rewrote it (${configAfter.length} bytes back to ${configBefore.length}).`,
  );
}

const stdout = new TextDecoder().decode(result.stdout).trim();
if (!result.success) {
  console.error(stdout);
  throw new Error(`deno deploy exited with ${result.code}`);
}

let summary: Record<string, unknown> = {};
try {
  summary = JSON.parse(stdout.split("\n").at(-1) ?? "{}");
} catch {
  console.log(stdout);
}
const url = typeof summary.productionUrl === "string"
  ? summary.productionUrl
  : undefined;
console.log(
  `Deployed revision ${summary.revisionId ?? "(unknown)"}${
    url ? ` to ${url}` : ""
  }.`,
);

if (Deno.args.includes("--no-smoke")) Deno.exit(0);
// The smoke reads the production owner token from .env.prod itself, so the
// `.env` variables this process loaded cannot leak into it. See scripts/smoke-prod.ts.
const smoke = new Deno.Command("deno", {
  args: ["task", "smoke:prod"],
  stdout: "inherit",
  stderr: "inherit",
});
const smoked = await smoke.output();
if (!smoked.success) throw new Error("production smoke failed after deploy");

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
