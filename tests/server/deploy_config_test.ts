import { assert, assertEquals } from "jsr:@std/assert";

const config = JSON.parse(await Deno.readTextFile(new URL("../../deno.json", import.meta.url)));

Deno.test("deploy configuration excludes every env file from the upload", () => {
  const exclude: string[] = config.deploy.exclude;
  assert(exclude.includes(".env"));
  assert(exclude.includes(".env.*"));
});

Deno.test("deploy configuration targets the production app and entrypoint", () => {
  assertEquals(config.deploy.org, "legoguy32109");
  assertEquals(config.deploy.app, "learn-joshhale");
  assertEquals(config.deploy.runtime, { type: "dynamic", entrypoint: "./main.ts" });
});

Deno.test("production tasks load only the production env file", () => {
  const tasks: Record<string, string> = config.tasks;
  for (const name of ["db:migrate:prod", "db:owner:prod", "db:seed:prod", "smoke:prod"]) {
    assert(tasks[name].includes("--env-file=.env.prod"), `${name} must load .env.prod`);
    assert(!tasks[name].includes("--env-file=.env "), `${name} must not load .env`);
  }
  assert(tasks.deploy.includes("scripts/deploy.ts"));
});
