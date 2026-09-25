// The agent plugin served under /plugin must be exactly what the shared sources generate, must
// install by every route the human page describes, and its scripts must never leak the token.
import type { Lesson } from "../../src/shared/lessons/types.d.ts";
import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";
import { Ajv2020 } from "ajv/2020";
import addFormatsModule from "ajv-formats";
import {
  CARD_WORDS_MAX,
  CARD_WORDS_MIN,
  DRAWABLE_MIN,
  lessonSchema,
  OPTION_COUNT,
  OPTION_RATIO_MAX,
  resolveLesson,
} from "../../src/shared/authoring/resolver.js";
import { DIAGNOSTIC_CODES } from "../../src/shared/authoring/diagnostics.js";
import { app, createApp, fixtureDependencies } from "../../src/app.ts";
import type {
  LessonRepository,
  ResolvedLesson,
  StoredRevision,
} from "../../src/server/repositories/lessons.ts";
import {
  committedPluginFiles,
  PLUGIN_ROOT,
  pluginFiles,
  pluginTree,
} from "../../src/server/plugin/files.ts";
import {
  exampleLesson,
  marketplaceManifest,
  pluginManifest,
} from "../../src/server/plugin/texts.ts";
import { capabilitiesFor } from "../../src/server/api-docs/capabilities.ts";
import { diagnosticsReference } from "../../src/shared/authoring/diagnostics.js";
import { parseJson, readJson } from "../support/json.ts";
import {
  ARCHIVE_FILE,
  DEFAULT_PUBLIC_ORIGIN,
  MARKETPLACE_NAME,
  PLUGIN_NAME,
  PUBLIC_ORIGIN,
  REPOSITORY_DIR,
  SKILL_NAME,
} from "../../src/server/plugin/links.ts";
import { crc32 } from "../../src/server/plugin/zip.ts";

const repo = new URL("../../", import.meta.url);
const decoder = new TextDecoder();
const addFormats =
  ((addFormatsModule as unknown as { default?: unknown }).default ??
    addFormatsModule) as (ajv: Ajv2020) => void;

const generated = await pluginFiles();
const tree = await pluginTree();
const skill = `${PLUGIN_ROOT}skills/${SKILL_NAME}/`;
const text = (path: string) => decoder.decode(generated.files[path]);

Deno.test("the committed plugin directory is exactly what the sources generate (run deno task plugin:generate)", async () => {
  const committed = await committedPluginFiles(repo);
  assertEquals(
    Object.keys(committed).sort(),
    Object.keys(generated.files).sort(),
    "the set of files under public/plugin differs",
  );
  for (const [path, bytes] of Object.entries(generated.files)) {
    assertEquals(committed[path], bytes, `${path} is stale`);
  }
});

Deno.test("the public origin is one https value and every generated text that names an origin uses it", () => {
  assertMatch(PUBLIC_ORIGIN, /^https:\/\/[^/]+$/);
  assertEquals(DEFAULT_PUBLIC_ORIGIN, "https://learn.joshhale.me");
  const manifest = parseJson<ReturnType<typeof pluginManifest>>(
    text(`${PLUGIN_ROOT}.claude-plugin/plugin.json`),
  );
  assertEquals(manifest.homepage, `${PUBLIC_ORIGIN}/plugin`);
  for (
    const path of Object.keys(generated.files).filter((path) =>
      /\.(md|json|mjs)$/.test(path)
    )
  ) {
    const urls = text(path).match(/https?:\/\/[^\s"'`)<>]+/g) ?? [];
    for (const url of urls) {
      assert(
        url.startsWith(PUBLIC_ORIGIN) ||
          url.startsWith("https://json-schema.org") ||
          url.startsWith("https://example.com"),
        `${path} names ${url}; only the public origin is allowed`,
      );
    }
  }
});

Deno.test("generation is deterministic and the marketplace pins the archive it serves", async () => {
  const again = await pluginFiles();
  assertEquals(again.files, generated.files);
  assertEquals(again.commit, generated.commit);
  const marketplace = parseJson<ReturnType<typeof marketplaceManifest>>(
    text(`${PLUGIN_ROOT}marketplace.json`),
  );
  assertEquals(marketplace.name, MARKETPLACE_NAME);
  assertEquals(
    marketplace.plugins.length,
    1,
    "this marketplace lists the one plugin the site serves",
  );
  assertEquals(marketplace.plugins[0].name, PLUGIN_NAME);
  assertEquals(marketplace.plugins[0].source, {
    source: "archive",
    url: `${PUBLIC_ORIGIN}/plugin/${ARCHIVE_FILE}`,
    sha256: generated.archiveSha256,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    generated.files[`${PLUGIN_ROOT}${ARCHIVE_FILE}`] as BufferSource,
  );
  assertEquals(
    [...new Uint8Array(digest)].map((byte) =>
      byte.toString(16).padStart(2, "0")
    ).join(""),
    generated.archiveSha256,
  );
  const manifest = parseJson<ReturnType<typeof pluginManifest>>(
    text(`${PLUGIN_ROOT}.claude-plugin/plugin.json`),
  );
  assertEquals(manifest.name, PLUGIN_NAME);
  assertEquals(manifest.version, marketplace.plugins[0].version);
});

/** Read a stored-entry ZIP: the central directory, then each entry's name, CRC and bytes. */
function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = bytes.length - 22;
  assertEquals(
    view.getUint32(endOffset, true),
    0x06054b50,
    "end of central directory",
  );
  const count = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index++) {
    assertEquals(view.getUint32(offset, true), 0x02014b50);
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    const localNameLength = view.getUint16(localOffset + 26, true);
    const start = localOffset + 30 + localNameLength;
    const content = bytes.subarray(start, start + size);
    assertEquals(crc32(content), crc, `${name} CRC`);
    entries.set(name, content);
    offset += 46 + nameLength;
  }
  return entries;
}

Deno.test("the archive holds the plugin directory: manifest at the root, the skill, and nothing generated twice", () => {
  const entries = readZip(generated.files[`${PLUGIN_ROOT}${ARCHIVE_FILE}`]);
  assertEquals([...entries.keys()].sort(), Object.keys(tree).sort());
  for (const [path, content] of entries) {
    assertEquals(decoder.decode(content), tree[path], path);
  }
  assert(entries.has(".claude-plugin/plugin.json"));
  assert(
    !entries.has("marketplace.json") && !entries.has(ARCHIVE_FILE),
    "the archive does not contain the marketplace or itself",
  );
});

/** Serve the database-free app on a loopback port for git and the scripts. */
function serve(handler: (request: Request) => Promise<Response>) {
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0, onListen() {} },
    handler,
  );
  return {
    origin: `http://127.0.0.1:${server.addr.port}`,
    close: () => server.shutdown(),
  };
}

async function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
) {
  const process = new Deno.Command(command, {
    args,
    cwd: options.cwd,
    env: options.env,
    clearEnv: options.env !== undefined,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await process.output();
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
  };
}

Deno.test("git clone works against the served repository and yields the plugin directory at the generated commit", async () => {
  const server = serve(app);
  const directory = await Deno.makeTempDir();
  try {
    const clone = await run("git", [
      "clone",
      "--quiet",
      `${server.origin}/plugin/${REPOSITORY_DIR}`,
      "plugin",
    ], { cwd: directory });
    assertEquals(clone.code, 0, clone.stderr);
    const head = await run("git", ["rev-parse", "HEAD"], {
      cwd: `${directory}/plugin`,
    });
    assertEquals(head.stdout.trim(), generated.commit);
    for (const [path, content] of Object.entries(tree)) {
      assertEquals(
        await Deno.readTextFile(`${directory}/plugin/${path}`),
        content,
        path,
      );
    }
    const fsck = await run("git", ["fsck", "--strict"], {
      cwd: `${directory}/plugin`,
    });
    assertEquals(fsck.code, 0, fsck.stderr);
  } finally {
    await server.close();
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("the plugin routes serve the page, the manifests, the skill, the archive and the repository with the right media types", async () => {
  const page = await app(new Request("https://learn.example/plugin"));
  assertEquals(page.status, 200);
  assertEquals(page.headers.get("content-type"), "text/html; charset=utf-8");
  const markup = await page.text();
  assertStringIncludes(
    markup,
    `claude plugin marketplace add https://learn.example/plugin/marketplace.json`,
  );
  assertStringIncludes(
    markup,
    `claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}`,
  );
  assertStringIncludes(
    markup,
    `git clone https://learn.example/plugin/${REPOSITORY_DIR}`,
  );
  assertStringIncludes(markup, `~/.claude/skills/${SKILL_NAME}`);
  assertStringIncludes(markup, "LEARN_TOKEN");
  const expectations: Array<[string, string]> = [
    ["/plugin/marketplace.json", "application/json; charset=utf-8"],
    ["/plugin/.claude-plugin/plugin.json", "application/json; charset=utf-8"],
    [`/plugin/skills/${SKILL_NAME}/SKILL.md`, "text/markdown; charset=utf-8"],
    [
      `/plugin/skills/${SKILL_NAME}/scripts/validate.mjs`,
      "text/javascript; charset=utf-8",
    ],
    [`/plugin/${ARCHIVE_FILE}`, "application/zip"],
    [`/plugin/${REPOSITORY_DIR}/info/refs`, "application/octet-stream"],
  ];
  for (const [path, type] of expectations) {
    const response = await app(new Request(`https://learn.example${path}`));
    assertEquals(response.status, 200, path);
    assertEquals(response.headers.get("content-type"), type, path);
    assertEquals(
      new Uint8Array(await response.arrayBuffer()),
      generated.files[`${PLUGIN_ROOT}${path.slice("/plugin/".length)}`],
      path,
    );
  }
  const escape = await app(
    new Request("https://learn.example/plugin/../tools/lesson-validator.js"),
  );
  assert(escape.status === 200 || escape.status === 404);
  await escape.body?.cancel();
});

Deno.test("the capability document points at the plugin with absolute links that resolve", async () => {
  const body = await readJson<ReturnType<typeof capabilitiesFor>>(
    await app(new Request("https://learn.example/api/v1/capabilities")),
  );
  assertEquals(body.links.plugin, "https://learn.example/plugin");
  assertEquals(body.plugin.name, PLUGIN_NAME);
  assertEquals(body.plugin.tokenEnvironmentVariable, "LEARN_TOKEN");
  for (
    const key of [
      "page",
      "marketplace",
      "manifest",
      "archive",
      "skillDocument",
    ] as const
  ) {
    const href: string = body.plugin[key];
    assert(href.startsWith("https://learn.example/plugin"), `${key}: ${href}`);
    const response = await app(new Request(href));
    assertEquals(response.status, 200, key);
    await response.body?.cancel();
  }
  assertEquals(
    body.plugin.repository,
    `https://learn.example/plugin/${REPOSITORY_DIR}`,
  );
  const refs = await app(new Request(`${body.plugin.repository}/info/refs`));
  assertEquals(refs.status, 200);
  assertStringIncludes(
    await refs.text(),
    `${generated.commit}\trefs/heads/main`,
  );
  assertEquals(body.plugin.install.claudeCode, [
    `claude plugin marketplace add ${body.plugin.marketplace}`,
    `claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}`,
  ]);
  for (
    const href of [
      body.plugin.marketplace,
      body.plugin.archive,
      body.plugin.repository,
      body.plugin.skillDocument,
      body.links.plugin,
    ]
  ) {
    assert(
      body.authentication.publicRoutes.includes(href),
      `${href} is public`,
    );
  }
});

Deno.test("the skill's texts are the plugin's texts adapted for lesson/v1 and carry the resolver's own numbers", async () => {
  const skillDocument = text(`${skill}SKILL.md`);
  assertMatch(skillDocument, /^---\nname: lesson\ndescription: .+\n---\n/);
  for (
    const step of [
      "### 1. Establish the source",
      "### 2. Read the authoring rules",
      "### 3. Write lesson.json",
      "### 3b. Attack your own draft",
      "### 4. Validate",
      "### 5. Submit",
      "### 6. Report",
    ]
  ) assertStringIncludes(skillDocument, step);
  assert(
    !/build\.mjs|renderer|show_widget|fragment\.html/.test(skillDocument),
    "the build-and-render steps are gone",
  );
  for (
    const required of [
      `exactly ${OPTION_COUNT} options`,
      `${CARD_WORDS_MIN} to\n${CARD_WORDS_MAX} words`,
      `at least ${DRAWABLE_MIN} drawable`,
      '"reserved": true',
      "LEARN_TOKEN",
      "unknown",
      "client_version",
      "session_reference",
      `${PUBLIC_ORIGIN}/api/v1/lessons`,
      `${PUBLIC_ORIGIN}/api/v1/capabilities`,
      "/learn/<lessonId>",
    ]
  ) assertStringIncludes(skillDocument, required);
  assert(
    !skillDocument.includes("mastery.") ||
      skillDocument.includes("never the word mastery"),
  );

  const authoring = text(`${skill}references/authoring.md`);
  for (
    const required of [
      "shared option set",
      "Distractor provenance",
      "correctingCardId",
      "## Short-answer Questions",
      "## Cards",
      "paragraph",
      "never the reserved instance",
      `${OPTION_RATIO_MAX} times`,
      `${CARD_WORDS_MIN} to ${CARD_WORDS_MAX} words`,
      "| `card.words` |",
      "| `pool.drawable.minimum` |",
    ]
  ) assertStringIncludes(authoring, required);
  assert(
    !/corrected_by|"X"|item's key/.test(authoring),
    "the quiz plugin's field names are adapted",
  );

  const schemaReference = text(`${skill}references/lesson-schema.md`);
  for (
    const definition of [
      "### concept",
      "### option",
      "### misconception",
      "### card",
      "### mcq",
      "### numeric",
      "### short",
      "### source",
      "### provenance",
    ]
  ) assertStringIncludes(schemaReference, definition);
  assertStringIncludes(
    schemaReference,
    `array of [option](#option) (min ${OPTION_COUNT}, max ${OPTION_COUNT})`,
  );

  const diagnostics = text(`${skill}references/diagnostics.md`);
  assertEquals(
    diagnostics,
    await Deno.readTextFile(new URL("docs/diagnostics.md", repo)),
  );
  const catalog = parseJson<typeof diagnosticsReference>(
    text(`${skill}references/diagnostics.json`),
  );
  assertEquals(
    catalog.diagnostics.map((entry) => entry.code),
    DIAGNOSTIC_CODES,
  );

  assertEquals(
    text(`${skill}scripts/lesson-validator.js`),
    await Deno.readTextFile(new URL("public/tools/lesson-validator.js", repo)),
  );
  const readme = text(`${PLUGIN_ROOT}README.md`);
  for (
    const required of [
      "claude plugin marketplace add",
      "git clone",
      `~/.claude/skills/${SKILL_NAME}`,
      "LEARN_TOKEN",
    ]
  ) assertStringIncludes(readme, required);
});

Deno.test("the example in the schema reference passes the JSON Schema and fails the resolver only on Card length", async () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(lessonSchema);
  const example = exampleLesson();
  assert(validate(example), JSON.stringify(validate.errors));
  assertStringIncludes(
    text(`${skill}references/lesson-schema.md`),
    JSON.stringify(example, null, 2),
  );
  const resolved = await resolveLesson(example);
  assertEquals([
    ...new Set(resolved.diagnostics.map((diagnostic) => diagnostic.code)),
  ], ["card.words"]);
});

const scripts = new URL(`${skill}scripts/`, repo).pathname;

Deno.test("validate.mjs runs the bundled resolver: exit 0 with OK on the demo lesson, exit 1 with codes and fixes on a broken one", async () => {
  const good = await run("deno", [
    "run",
    "--allow-read",
    `${scripts}validate.mjs`,
    new URL("fixtures/lessons/browser-http-cache.json", repo).pathname,
  ]);
  assertEquals(good.code, 0, good.stderr);
  assertMatch(
    good.stdout,
    /^OK: valid lesson\/v1, 0 warning\(s\), fingerprint sha256:[0-9a-f]{64}\n$/,
  );
  const bad = await run("deno", [
    "run",
    "--allow-read",
    `${scripts}validate.mjs`,
    new URL("fixtures/authoring/invalid/demo-path-two-diagnostics.json", repo)
      .pathname,
  ]);
  assertEquals(bad.code, 1);
  assertStringIncludes(bad.stdout, "FAIL lesson.key.longest at /concepts:");
  assertStringIncludes(
    bad.stdout,
    "FAIL card.words at /concepts/0/cards/0/body:",
  );
  assertStringIncludes(bad.stdout, "fix: Write 120 to 200 words");
  assertStringIncludes(bad.stdout, "FAILED: 2 error(s), 0 warning(s)");
  const usage = await run("deno", [
    "run",
    "--allow-read",
    `${scripts}validate.mjs`,
  ]);
  assertEquals(usage.code, 2);
});

Deno.test("validate.mjs --remote agrees byte for byte with the resolution route", async () => {
  const server = serve(app);
  try {
    const result = await run("deno", [
      "run",
      "--allow-read",
      "--allow-net=127.0.0.1",
      "--allow-env=LEARN_BASE_URL",
      `${scripts}validate.mjs`,
      new URL("fixtures/lessons/browser-http-cache.json", repo).pathname,
      "--remote",
    ], { env: { LEARN_BASE_URL: server.origin } });
    assertEquals(result.code, 0, result.stderr + result.stdout);
    assertStringIncludes(
      result.stdout,
      "remote 200 from " + server.origin + ": identical to the local result",
    );
  } finally {
    await server.close();
  }
});

const TOKEN = "learn_pat_testprefix_" + "s".repeat(43);

/** Drafts in memory with the same fingerprint idempotency as the Turso repository. */
class MemoryLessons implements LessonRepository {
  revisions: StoredRevision[] = [];
  constructor(private fixture: Lesson) {}
  featured() {
    return Promise.resolve(this.fixture);
  }
  createLesson(
    _account: string,
    resolved: ResolvedLesson,
  ): Promise<StoredRevision> {
    const existing = this.revisions.find((revision) =>
      revision.fingerprint === resolved.fingerprint
    );
    if (existing) return Promise.resolve(existing);
    const lessonId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    const stored: StoredRevision = {
      lessonId,
      revisionId,
      revisionNumber: 1,
      status: "draft",
      fingerprint: resolved.fingerprint,
      content: { ...resolved.normalizedLesson, lessonId, revisionId },
      createdAt: Date.now(),
    };
    this.revisions.push(stored);
    return Promise.resolve(stored);
  }
  createRevision(
    account: string,
    _lessonId: string,
    resolved: ResolvedLesson,
  ) {
    return Promise.resolve(this.createLesson(account, resolved));
  }
  getRevision() {
    return Promise.resolve(null);
  }
  latestRevision() {
    return Promise.resolve(null);
  }
  learnableRevision() {
    return Promise.resolve(null);
  }
  listMine() {
    return Promise.resolve([]);
  }
  shelf() {
    return Promise.resolve([]);
  }
}

async function draftApp() {
  const dependencies = await fixtureDependencies();
  const lessons = new MemoryLessons(await dependencies.lessons.featured());
  const application = createApp({
    ...dependencies,
    lessons,
    auth: {
      authenticate(request, scope) {
        if (request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
          return Promise.resolve({ ok: false, reason: "unauthenticated" });
        }
        if (scope !== "lessons:write") {
          return Promise.resolve({ ok: false, reason: "forbidden" });
        }
        return Promise.resolve({
          ok: true,
          principal: { accountId: "owner", scopes: ["lessons:write"] },
        });
      },
    },
  });
  return { application, lessons };
}

Deno.test("submit.mjs creates a draft, prints the learning URL, returns the same revision twice and never prints the token", async () => {
  const { application, lessons } = await draftApp();
  const server = serve(application);
  const lesson =
    new URL("fixtures/lessons/browser-http-cache.json", repo).pathname;
  const submit = (env: Record<string, string>, ...extra: string[]) =>
    run("deno", [
      "run",
      "--allow-read",
      "--allow-net=127.0.0.1",
      "--allow-env=LEARN_TOKEN,LEARN_BASE_URL",
      `${scripts}submit.mjs`,
      lesson,
      ...extra,
    ], { env });
  try {
    const first = await submit({
      LEARN_TOKEN: TOKEN,
      LEARN_BASE_URL: server.origin,
    });
    assertEquals(first.code, 0, first.stderr + first.stdout);
    assertEquals(lessons.revisions.length, 1);
    const { lessonId, revisionId } = lessons.revisions[0];
    assertStringIncludes(first.stdout, "Created draft revision (201)");
    assertStringIncludes(first.stdout, `lessonId:    ${lessonId}`);
    assertStringIncludes(first.stdout, `revisionId:  ${revisionId}`);
    assertStringIncludes(
      first.stdout,
      `learn:       ${server.origin}/learn/${lessonId}`,
    );

    const second = await submit({
      LEARN_TOKEN: TOKEN,
      LEARN_BASE_URL: server.origin,
    });
    assertEquals(second.code, 0);
    assertEquals(
      lessons.revisions.length,
      1,
      "the same document creates no second revision",
    );
    assertStringIncludes(second.stdout, `revisionId:  ${revisionId}`);

    const wrong = await submit({
      LEARN_TOKEN: "learn_pat_wrongprefi_" + "w".repeat(43),
      LEARN_BASE_URL: server.origin,
    });
    assertEquals(wrong.code, 1);
    assertStringIncludes(wrong.stdout, "401");
    const missing = await submit({ LEARN_BASE_URL: server.origin });
    assertEquals(missing.code, 1);
    assertStringIncludes(missing.stderr, "LEARN_TOKEN is not set");
    const onCommandLine = await submit({
      LEARN_TOKEN: TOKEN,
      LEARN_BASE_URL: server.origin,
    }, TOKEN);
    assertEquals(onCommandLine.code, 2);

    for (const output of [first, second, wrong, missing, onCommandLine]) {
      assert(
        !output.stdout.includes(TOKEN) && !output.stderr.includes(TOKEN),
        "the token never appears in output",
      );
      assert(
        !/learn_pat_[A-Za-z0-9_-]{10}_/.test(output.stdout + output.stderr),
        "no token-shaped string appears in output",
      );
    }
  } finally {
    await server.close();
  }
});

Deno.test("the Claude Code plugin validator accepts the plugin and the marketplace manifests", async () => {
  const which = await run("which", ["claude"]).catch(() => null);
  if (!which || which.code !== 0) {
    console.log("claude CLI not installed; skipping");
    return;
  }
  const plugin = await run("claude", [
    "plugin",
    "validate",
    new URL(PLUGIN_ROOT, repo).pathname,
    "--strict",
  ]);
  assertEquals(plugin.code, 0, plugin.stdout + plugin.stderr);
  const directory = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${directory}/.claude-plugin`);
    await Deno.writeFile(
      `${directory}/.claude-plugin/marketplace.json`,
      generated.files[`${PLUGIN_ROOT}marketplace.json`],
    );
    const marketplace = await run("claude", [
      "plugin",
      "validate",
      directory,
      "--strict",
    ]);
    assertEquals(marketplace.code, 0, marketplace.stdout + marketplace.stderr);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
