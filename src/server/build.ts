// The application shell as one versioned unit: every static file the browser needs to boot without
// a network, plus the hash that names the service worker's cache for that exact set of bytes.
// A changed byte anywhere in the shell changes the hash, which changes the served /sw.js, which
// makes the browser install a new worker that opens a new cache and deletes the old one.

export interface ShellFile {
  /** URL path the browser requests, such as `/css/app.css`. */
  path: string;
  bytes: Uint8Array;
}

export interface Build {
  /** First 12 hex characters of the SHA-256 over every shell file, in path order. */
  hash: string;
  /** Every URL the worker precaches at install. */
  precache: string[];
}

/** The lesson-free HTML shell the worker serves for a navigation when the network is unreachable. */
export const SHELL_PATH = "/shell";

/** Files served under these URL prefixes from these directories make up the shell. */
const roots = [
  { prefix: "/css/", directory: new URL("../../public/css/", import.meta.url) },
  { prefix: "/js/", directory: new URL("../../public/js/", import.meta.url) },
  {
    prefix: "/icons/",
    directory: new URL("../../public/icons/", import.meta.url),
  },
  { prefix: "/src/client/", directory: new URL("../client/", import.meta.url) },
  { prefix: "/src/shared/", directory: new URL("../shared/", import.meta.url) },
];

/** The worker's own scripts update through the browser's worker lifecycle, never through the cache. */
const WORKER_SCRIPTS = new Set([
  "/src/client/pwa/sw.js",
  "/src/client/pwa/sw-routing.js",
]);

/** Files that the browser fetches: stylesheets, modules, icons and the manifest. Declarations are not served. */
function servedToBrowser(path: string): boolean {
  if (path.endsWith(".d.ts")) return false;
  return /\.(css|js|png|svg|webmanifest)$/.test(path);
}

async function* walk(
  directory: URL,
  prefix: string,
): AsyncGenerator<{ path: string; file: URL }> {
  for await (const entry of Deno.readDir(directory)) {
    const file = new URL(entry.name, directory);
    if (entry.isDirectory) {
      yield* walk(
        new URL(`${entry.name}/`, directory),
        `${prefix}${entry.name}/`,
      );
    } else if (entry.isFile) {
      yield { path: `${prefix}${entry.name}`, file };
    }
  }
}

/** Read every shell file from disk. Exported so tests can hash a controlled set instead. */
export async function readShellFiles(): Promise<ShellFile[]> {
  const files: ShellFile[] = [];
  for (const root of roots) {
    for await (const found of walk(root.directory, root.prefix)) {
      if (!servedToBrowser(found.path)) continue;
      files.push({ path: found.path, bytes: await Deno.readFile(found.file) });
    }
  }
  const manifest = new URL(
    "../../public/manifest.webmanifest",
    import.meta.url,
  );
  files.push({
    path: "/manifest.webmanifest",
    bytes: await Deno.readFile(manifest),
  });
  return files;
}

/** Hash the shell files and derive the precache list. Pure over its input, so a changed byte is testable. */
export async function computeBuild(
  files: ShellFile[],
  shellHtml: string,
): Promise<Build> {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [encoder.encode(shellHtml)];
  for (const file of sorted) {
    parts.push(encoder.encode(`\n${file.path}\n`));
    parts.push(file.bytes);
  }
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
  const hash = Array.from(
    digest.slice(0, 6),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const precache = [
    SHELL_PATH,
    ...sorted.map((file) => file.path).filter((path) =>
      !WORKER_SCRIPTS.has(path)
    ),
  ];
  return { hash, precache };
}

/** Provides the current build. Bootstrap uses the disk once per process; tests substitute their own. */
export type BuildProvider = () => Promise<Build>;

/** Compute the build from disk once and reuse it for the life of the process. */
export function diskBuild(shellHtml: string): BuildProvider {
  let build: Promise<Build> | null = null;
  return () => {
    build ??= readShellFiles().then((files) => computeBuild(files, shellHtml));
    return build;
  };
}
