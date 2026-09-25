// Static assets: stylesheets, browser entry modules, generated tools, served documentation, the
// generated agent plugin, and the browser-safe `src/client` and `src/shared` modules the entry
// modules import. `src/server` is never served.
import { type Route, route } from "./route.ts";

interface Root {
  prefix: string;
  directory: URL;
}

const roots: Root[] = [
  {
    prefix: "/css/",
    directory: new URL("../../../public/css/", import.meta.url),
  },
  {
    prefix: "/js/",
    directory: new URL("../../../public/js/", import.meta.url),
  },
  {
    prefix: "/tools/",
    directory: new URL("../../../public/tools/", import.meta.url),
  },
  {
    prefix: "/icons/",
    directory: new URL("../../../public/icons/", import.meta.url),
  },
  {
    prefix: "/docs/",
    directory: new URL("../../../public/docs/", import.meta.url),
  },
  {
    prefix: "/plugin/",
    directory: new URL("../../../public/plugin/", import.meta.url),
  },
  {
    prefix: "/src/client/",
    directory: new URL("../../client/", import.meta.url),
  },
  {
    prefix: "/src/shared/",
    directory: new URL("../../shared/", import.meta.url),
  },
];

const mime: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".zip": "application/zip",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
};

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

async function serve(root: Root, pathname: string): Promise<Response> {
  const file = new URL(pathname.slice(root.prefix.length), root.directory);
  if (!file.href.startsWith(root.directory.href)) return notFound();
  try {
    const bytes = await Deno.readFile(file);
    const name = pathname.slice(pathname.lastIndexOf("/") + 1);
    const extension = name.includes(".")
      ? name.slice(name.lastIndexOf("."))
      : "";
    return new Response(bytes, {
      headers: {
        "content-type": mime[extension] ?? "application/octet-stream",
      },
    });
  } catch {
    return notFound();
  }
}

export function assetRoutes(): Route[] {
  return roots.map((root) =>
    route(
      "GET",
      `${root.prefix}*`,
      (request) => serve(root, new URL(request.url).pathname),
    )
  );
}
