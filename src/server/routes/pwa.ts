// Installable shell: the web app manifest, the lesson-free HTML shell the worker serves offline,
// and the service worker itself. The worker is rendered from its source with the build hash and
// precache list substituted, so any change to a shell asset changes the worker's bytes and the
// browser installs a new version on the next launch.
import type { Dependencies } from "../dependencies.ts";
import { type Build, diskBuild, SHELL_PATH } from "../build.ts";
import { html } from "../http.ts";
import { page } from "../views/page.ts";
import { type Route, route } from "./route.ts";

const workerDirectory = new URL("../../client/pwa/", import.meta.url);
const manifestFile = new URL("../../../public/manifest.webmanifest", import.meta.url);

const HASH_PLACEHOLDER = '"__BUILD_HASH__"';
const PRECACHE_PLACEHOLDER = '["__PRECACHE__"]';

/** Fill the worker source's two placeholders. Exported so a test can prove the substitution. */
export function renderWorker(source: string, build: Build): string {
  if (!source.includes(HASH_PLACEHOLDER) || !source.includes(PRECACHE_PLACEHOLDER)) {
    throw new Error("Service worker source is missing a build placeholder");
  }
  return source
    .replace(HASH_PLACEHOLDER, JSON.stringify(build.hash))
    .replace(PRECACHE_PLACEHOLDER, JSON.stringify(build.precache));
}

/** Worker scripts are never cached by the browser's HTTP cache, so an update check always sees the deploy. */
function script(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" },
  });
}

export function pwaRoutes(dependencies: Dependencies): Route[] {
  const build = dependencies.build ?? diskBuild(page(null, { signedIn: false, displayName: null }));
  return [
    route("GET", "/manifest.webmanifest", async () => {
      const text = await Deno.readTextFile(manifestFile);
      return new Response(text, { headers: { "content-type": "application/manifest+json; charset=utf-8" } });
    }),
    route("GET", SHELL_PATH, () => Promise.resolve(html(page(null, { signedIn: false, displayName: null })))),
    route("GET", "/sw.js", async () => {
      const source = await Deno.readTextFile(new URL("sw.js", workerDirectory));
      return script(renderWorker(source, await build()));
    }),
    route("GET", "/sw-routing.js", async () => script(await Deno.readTextFile(new URL("sw-routing.js", workerDirectory)))),
  ];
}
