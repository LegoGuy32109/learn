// The downloadable validator is generated from the shared resolver. This test runs the generated
// file in a real subprocess, from a temporary directory with no network access, and compares its
// result JSON byte for byte with the in-process resolver for every fixture.
import { parseJson } from "../support/json.ts";
import type { Resolution } from "../../src/shared/authoring/resolver.js";
import { assert, assertEquals } from "@std/assert";
import manifest from "../../fixtures/authoring/manifest.json" with {
  type: "json",
};
import {
  MAX_DOCUMENT_BYTES,
  resolveLesson,
} from "../../src/shared/authoring/resolver.js";
import { app } from "../../src/app.ts";

const repo = new URL("../../", import.meta.url);

const runner = `
import { resolveLesson } from "./lesson-validator.js";
const results = [];
for (const path of Deno.args) {
  const result = await resolveLesson(JSON.parse(await Deno.readTextFile(path)));
  results.push(JSON.stringify(result));
}
console.log(results.join("\\n"));
`;

async function adversarialDocuments(): Promise<Record<string, string>> {
  const demo = parseJson<Record<string, unknown>>(
    await Deno.readTextFile(
      new URL("fixtures/lessons/browser-http-cache.json", repo),
    ),
  );
  const oversized = {
    ...demo,
    assumedKnowledge: "x".repeat(MAX_DOCUMENT_BYTES + 1),
  };
  const deep = "[".repeat(50_000) + "]".repeat(50_000);
  return {
    "generated-oversized.json": JSON.stringify(oversized),
    "generated-deep-nesting.json": `{"schema":"lesson/v1","extra":${deep}}`,
    "generated-prototype-keys.json":
      '{"__proto__":{"valid":true},"constructor":{"prototype":{"valid":true}},"schema":"lesson/v1","concepts":[{"id":"x","options":[{"id":"__proto__","text":"a"}],"misconceptions":[{"id":"constructor","statement":"s","correctingCardId":"c"}]}]}',
  };
}

Deno.test("the generated validator and the shared resolver return byte-equivalent result JSON", async () => {
  const downloaded = await app(
    new Request("http://local/tools/lesson-validator.js"),
  );
  assertEquals(downloaded.status, 200);
  const directory = await Deno.makeTempDir({ prefix: "lesson-validator-" });
  try {
    await Deno.writeTextFile(
      `${directory}/lesson-validator.js`,
      await downloaded.text(),
    );
    await Deno.writeTextFile(`${directory}/run.js`, runner);
    const files: string[] = [];
    const copy = async (name: string, content: string) => {
      const path = `${directory}/${name}`;
      await Deno.writeTextFile(path, content);
      files.push(path);
    };
    await copy(
      "browser-http-cache.json",
      await Deno.readTextFile(
        new URL("fixtures/lessons/browser-http-cache.json", repo),
      ),
    );
    for (const entry of manifest) {
      await copy(
        entry.file.replaceAll("/", "__"),
        await Deno.readTextFile(new URL(`fixtures/${entry.file}`, repo)),
      );
    }
    for (
      const [name, content] of Object.entries(await adversarialDocuments())
    ) await copy(name, content);
    assert(files.length >= 30);

    const command = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-remote",
        "--no-config",
        "--no-lock",
        "--deny-net",
        `--allow-read=${directory}`,
        `${directory}/run.js`,
        ...files,
      ],
      cwd: directory,
      stdout: "piped",
      stderr: "piped",
      env: { NO_COLOR: "1" },
    });
    const started = performance.now();
    const output = await command.output();
    assert(
      performance.now() - started < 60_000,
      "the validator subprocess hung",
    );
    const stderr = new TextDecoder().decode(output.stderr);
    assertEquals(output.code, 0, stderr);
    const lines = new TextDecoder().decode(output.stdout).trimEnd().split("\n");
    assertEquals(lines.length, files.length);

    for (const [index, path] of files.entries()) {
      const expected = JSON.stringify(
        await resolveLesson(JSON.parse(await Deno.readTextFile(path))),
      );
      assertEquals(
        lines[index],
        expected,
        `${path} differs between the generated validator and the shared resolver`,
      );
    }
    const byName: Record<string, Resolution> = Object.fromEntries(
      files.map((
        path,
        index,
      ) => [
        path.slice(directory.length + 1),
        parseJson<Resolution>(lines[index]),
      ]),
    );
    assertEquals(
      byName["generated-oversized.json"].diagnostics.map((d) => d.code),
      ["document.size"],
    );
    assertEquals(
      byName["generated-deep-nesting.json"].diagnostics.map((d) => d.code),
      ["document.nesting"],
    );
    assertEquals(byName["generated-prototype-keys.json"].valid, false);
    assert(byName["browser-http-cache.json"].valid);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("the generated validator matches the committed source", async () => {
  const generated = await Deno.readTextFile(
    new URL("public/tools/lesson-validator.js", repo),
  );
  const source = await Deno.readTextFile(
    new URL("src/shared/authoring/resolver.js", repo),
  );
  assert(generated.endsWith(source), "run deno task tools:generate");
});
