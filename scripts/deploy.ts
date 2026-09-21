// Deploys the working tree to the Deno Deploy application `learn` in the
// organization `legoguy32109` as a production revision, then runs the
// production smoke. The upload honors .gitignore and the deploy.exclude list
// in deno.json, so no env file leaves this machine.
//
// Usage: deno task deploy [--no-smoke]
// Requires DENO_DEPLOY_TOKEN in the environment. Never print it.

const ORG = "legoguy32109";
const APP = "learn-joshhale";

if (!Deno.env.get("DENO_DEPLOY_TOKEN")) throw new Error("DENO_DEPLOY_TOKEN must be set; load .env");

const deploy = new Deno.Command("deno", {
  args: ["run", "-A", "--no-lock", "jsr:@deno/deploy@0.0.9904", "--json", "--non-interactive", "--org", ORG, "--app", APP, "--prod", "."],
  stdout: "piped",
  stderr: "inherit",
});
const result = await deploy.output();
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
const url = typeof summary.productionUrl === "string" ? summary.productionUrl : undefined;
console.log(`Deployed revision ${summary.revisionId ?? "(unknown)"}${url ? ` to ${url}` : ""}.`);

if (Deno.args.includes("--no-smoke")) Deno.exit(0);
const smoke = new Deno.Command("deno", { args: ["task", "smoke:prod"], stdout: "inherit", stderr: "inherit" });
const smoked = await smoke.output();
if (!smoked.success) throw new Error("production smoke failed after deploy");
