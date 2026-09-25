import { assert, assertEquals } from "@std/assert";
import { parseJson } from "../support/json.ts";

/** The parts of deno.json these tests hold to account. */
interface DenoConfig {
  deploy: {
    org: string;
    app: string;
    runtime: { type: string; entrypoint: string };
    exclude: string[];
  };
  tasks: Record<string, string>;
  /** Must stay absent: a top-level exclude would drop files from every tool, not only the upload. */
  exclude?: unknown;
}

const config = parseJson<DenoConfig>(
  await Deno.readTextFile(new URL("../../deno.json", import.meta.url)),
);

Deno.test("deploy configuration excludes every env file from the upload", () => {
  const exclude: string[] = config.deploy.exclude;
  assert(exclude.includes(".env"));
  assert(exclude.includes(".env.*"));
});

Deno.test("deploy configuration targets the production app and entrypoint", () => {
  assertEquals(config.deploy.org, "legoguy32109");
  assertEquals(config.deploy.app, "learn-joshhale");
  assertEquals(config.deploy.runtime, {
    type: "dynamic",
    entrypoint: "./main.ts",
  });
});

Deno.test("production tasks load only the production env file", () => {
  const tasks: Record<string, string> = config.tasks;
  for (
    const name of [
      "db:migrate:prod",
      "db:owner:prod",
      "db:seed:prod",
      "smoke:prod",
    ]
  ) {
    assert(
      tasks[name].includes("--env-file=.env.prod"),
      `${name} must load .env.prod`,
    );
    assert(
      !tasks[name].includes("--env-file=.env "),
      `${name} must not load .env`,
    );
  }
  assert(tasks.deploy.includes("scripts/deploy.ts"));
});

// Ticket 25: a top-level `exclude` in deno.json also removes the named files from the
// deploy upload, which is how production lost /sw.js. The worker stays out of the
// dom-lib check by not being listed in it, and is checked on its own under deno.worker.json.
Deno.test("deno.json has no top-level exclude, so the upload carries every source file", () => {
  assertEquals(config.exclude, undefined);
});

Deno.test("the check task type-checks the worker only under the webworker config", () => {
  const [domPass, workerPass] = (config.tasks.check as string).split(" && ");
  assert(
    !domPass.includes("src/client/pwa/sw.js"),
    "the dom-lib pass must not name the worker",
  );
  assert(
    !domPass.includes("src/client/**"),
    "a client-wide glob would pull the worker into the dom-lib pass",
  );
  assertEquals(
    workerPass,
    "deno check --config deno.worker.json src/client/pwa/sw.js",
  );
  for (const file of ["register.js", "sw-routing.js", "update-policy.js"]) {
    assert(
      domPass.includes(`src/client/pwa/${file}`),
      `${file} must stay in the dom-lib pass`,
    );
  }
});
