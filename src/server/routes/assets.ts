// Static assets: stylesheets, browser entry modules, generated tools, and the browser-safe
// `src/client` and `src/shared` modules the entry modules import. `src/server` is never served.
import { type Route, route } from "./route.ts";

interface Root {
  prefix: string;
  directory: URL;
}

const roots: Root[] = [
  { prefix: "/css/", directory: new URL("../../../public/css/", import.meta.url) },
  { prefix: "/js/", directory: new URL("../../../public/js/", import.meta.url) },
  { prefix: "/tools/", directory: new URL("../../../public/tools/", import.meta.url) },
  { prefix: "/src/client/", directory: new URL("../../client/", import.meta.url) },
  { prefix: "/src/shared/", directory: new URL("../../shared/", import.meta.url) },
];

const mime: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

async function serve(root: Root, pathname: string): Promise<Response> {
  const file = new URL(pathname.slice(root.prefix.length), root.directory);
  if (!file.href.startsWith(root.directory.href)) return notFound();
  try {
    const bytes = await Deno.readFile(file);
    const extension = pathname.slice(pathname.lastIndexOf("."));
    return new Response(bytes, { headers: { "content-type": mime[extension] ?? "application/octet-stream" } });
  } catch {
    return notFound();
  }
}

export function assetRoutes(): Route[] {
  return roots.map((root) => route("GET", `${root.prefix}*`, (request) => serve(root, new URL(request.url).pathname)));
}
