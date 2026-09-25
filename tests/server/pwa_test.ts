import {
  assert,
  assertEquals,
  assertNotEquals,
  assertStringIncludes,
} from "jsr:@std/assert";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with {
  type: "json",
};
import { createApp, fixtureDependencies } from "../../src/app.ts";
import { FixtureLessonRepository } from "../../src/server/repositories/lessons.ts";
import {
  computeBuild,
  readShellFiles,
  SHELL_PATH,
} from "../../src/server/build.ts";
import { renderWorker } from "../../src/server/routes/pwa.ts";

const app = createApp({
  ...await fixtureDependencies(),
  lessons: new FixtureLessonRepository(lesson),
  auth: {
    async authenticate() {
      return { ok: false as const, reason: "unauthenticated" as const };
    },
  },
});

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Uint8Array): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

Deno.test("the manifest is installable: name, 192 and 512 icons, start URL, standalone, theme color", async () => {
  const response = await app(new Request("http://local/manifest.webmanifest"));
  assertEquals(response.status, 200);
  assertStringIncludes(
    response.headers.get("content-type") ?? "",
    "application/manifest+json",
  );
  const manifest = await response.json();
  assertEquals(manifest.name, "learn");
  assertEquals(manifest.start_url, "/");
  assertEquals(manifest.display, "standalone");
  assertEquals(manifest.theme_color, "#eae2d3");
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  assert(sizes.includes("192x192"));
  assert(sizes.includes("512x512"));
  for (const icon of manifest.icons) {
    const png = await app(new Request(`http://local${icon.src}`));
    assertEquals(png.status, 200, icon.src);
    assertEquals(png.headers.get("content-type"), "image/png");
    const [width, height] = pngSize(new Uint8Array(await png.arrayBuffer()));
    assertEquals(`${width}x${height}`, icon.sizes, icon.src);
  }
});

Deno.test("the page shell links the manifest and both theme colors; the offline shell inlines no lesson", async () => {
  const home = await (await app(new Request("http://local/"))).text();
  assertStringIncludes(
    home,
    '<link rel="manifest" href="/manifest.webmanifest">',
  );
  assertStringIncludes(home, 'name="theme-color" content="#eae2d3"');
  assertStringIncludes(home, 'name="theme-color" content="#1c1812"');
  assertStringIncludes(home, "window.__LESSON__=");
  const shell = await app(new Request(`http://local${SHELL_PATH}`));
  assertEquals(shell.status, 200);
  const text = await shell.text();
  assertStringIncludes(text, '<script type="module" src="/js/app.js">');
  assertEquals(text.includes("__LESSON__"), false);
});

Deno.test("the served worker carries the build hash and precache list and is never HTTP-cached", async () => {
  const response = await app(new Request("http://local/sw.js"));
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "no-cache");
  assertStringIncludes(
    response.headers.get("content-type") ?? "",
    "text/javascript",
  );
  const text = await response.text();
  const hash = text.match(/const BUILD_HASH = "([0-9a-f]{12})";/)?.[1];
  assert(hash, "worker must embed a 12-hex build hash");
  const precache: string[] = JSON.parse(
    text.match(/const PRECACHE = (\[.*?\]);/)?.[1] ?? "null",
  );
  assert(precache.includes(SHELL_PATH));
  assert(precache.includes("/css/app.css"));
  assert(precache.includes("/js/app.js"));
  assert(precache.includes("/src/client/learning/flow.js"));
  assert(precache.includes("/src/shared/learning/progress.js"));
  assert(precache.includes("/icons/icon-192.png"));
  assert(precache.includes("/manifest.webmanifest"));
  assertEquals(precache.some((path) => path.startsWith("/api/")), false);
  assertEquals(precache.some((path) => path.startsWith("/src/server/")), false);
  assertEquals(precache.some((path) => path.endsWith("sw.js")), false);
  assertEquals(precache.some((path) => path.endsWith(".d.ts")), false);
  for (const path of precache) {
    const asset = await app(new Request(`http://local${path}`));
    assertEquals(asset.status, 200, path);
    await asset.body?.cancel();
  }
  const routing = await app(new Request("http://local/sw-routing.js"));
  assertEquals(routing.status, 200);
  assertStringIncludes(await routing.text(), "export function classifyRequest");
});

Deno.test("a changed asset byte changes the build hash, so the cache name changes", async () => {
  const files = await readShellFiles();
  const before = await computeBuild(files, "<html>");
  const changed = files.map((file) =>
    file.path === "/css/app.css"
      ? { ...file, bytes: new Uint8Array([...file.bytes, 0x20]) }
      : file
  );
  const after = await computeBuild(changed, "<html>");
  assertNotEquals(before.hash, after.hash);
  assertEquals(before.precache, after.precache);
  const shellChanged = await computeBuild(files, "<html><!-- new -->");
  assertNotEquals(before.hash, shellChanged.hash);
  const same = await computeBuild([...files].reverse(), "<html>");
  assertEquals(before.hash, same.hash);
});

Deno.test("renderWorker substitutes both placeholders and refuses a source without them", () => {
  const source =
    'const BUILD_HASH = "__BUILD_HASH__";\nconst PRECACHE = ["__PRECACHE__"];\n';
  const rendered = renderWorker(source, {
    hash: "abcdef012345",
    precache: ["/shell", "/css/app.css"],
  });
  assertStringIncludes(rendered, 'const BUILD_HASH = "abcdef012345";');
  assertStringIncludes(rendered, 'const PRECACHE = ["/shell","/css/app.css"];');
  let threw = false;
  try {
    renderWorker("nothing here", { hash: "x", precache: [] });
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test("the inlined lesson keeps ordinary spaces and escapes only the line separators", async () => {
  const home = await (await app(new Request("http://local/"))).text();
  const inlined =
    home.match(/window\.__LESSON__=(.*?);window\.__SESSION__=/)?.[1] ?? "";
  assertStringIncludes(inlined, '"How browser HTTP caching works"');
  assertEquals(inlined.includes(" "), false);
  assertEquals(inlined.includes(" "), false);
  assertEquals(
    JSON.parse(inlined.replaceAll("\\u2028", " ")).title,
    lesson.title,
  );
});
