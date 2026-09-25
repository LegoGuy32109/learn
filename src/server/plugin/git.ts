// A deterministic bare Git repository, laid out for the dumb HTTP protocol so `git clone`
// works against the static file server: HEAD, info/refs, objects/info/packs and loose
// objects. Loose objects are zlib streams with stored (uncompressed) deflate blocks, so the
// bytes depend only on the content, and the single commit carries a fixed date, so the
// commit hash depends only on the tree. Regenerating unchanged input yields identical files.
import { concat } from "./zip.ts";

const encoder = new TextEncoder();

/** The commit timestamp: 2026-01-01T00:00:00Z. Fixed so the hash follows the content alone. */
const COMMIT_TIME = 1767225600;
const AUTHOR = "learn.joshhale.me <noreply@joshhale.me>";
export const BRANCH = "main";

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib framing around stored deflate blocks. Valid for any inflater and free of compressor quirks. */
export function zlibStored(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  const blockSize = 65535;
  const blocks = Math.max(1, Math.ceil(bytes.length / blockSize));
  for (let index = 0; index < blocks; index++) {
    const chunk = bytes.subarray(
      index * blockSize,
      Math.min(bytes.length, (index + 1) * blockSize),
    );
    const header = new Uint8Array(5);
    header[0] = index === blocks - 1 ? 1 : 0;
    header[1] = chunk.length & 0xff;
    header[2] = chunk.length >> 8;
    header[3] = ~chunk.length & 0xff;
    header[4] = (~chunk.length >> 8) & 0xff;
    parts.push(header, chunk);
  }
  const trailer = new Uint8Array(4);
  new DataView(trailer.buffer).setUint32(0, adler32(bytes), false);
  parts.push(trailer);
  return concat(parts);
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/../g)!.map((pair) => parseInt(pair, 16)));
}

interface StoredObject {
  hash: string;
  loose: Uint8Array;
}

/** Hash and frame one Git object of the given type. */
async function object(
  type: "blob" | "tree" | "commit",
  body: Uint8Array,
): Promise<StoredObject> {
  const framed = concat([encoder.encode(`${type} ${body.length}\0`), body]);
  return { hash: await sha1Hex(framed), loose: zlibStored(framed) };
}

interface TreeNode {
  files: Map<string, Uint8Array>;
  directories: Map<string, TreeNode>;
}

function tree(paths: Record<string, Uint8Array>): TreeNode {
  const root: TreeNode = { files: new Map(), directories: new Map() };
  for (const [path, bytes] of Object.entries(paths)) {
    const segments = path.split("/");
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      if (!node.directories.has(segment)) {
        node.directories.set(segment, {
          files: new Map(),
          directories: new Map(),
        });
      }
      node = node.directories.get(segment)!;
    }
    node.files.set(segments.at(-1)!, bytes);
  }
  return root;
}

/** Git sorts tree entries by name, with directories compared as if they ended in "/". */
function compareEntries(a: [string, boolean], b: [string, boolean]): number {
  const left = a[0] + (a[1] ? "/" : "");
  const right = b[0] + (b[1] ? "/" : "");
  return left < right ? -1 : left > right ? 1 : 0;
}

async function writeTree(
  node: TreeNode,
  out: Map<string, Uint8Array>,
): Promise<string> {
  const entries: Uint8Array[] = [];
  const names: [string, boolean][] = [
    ...[...node.files.keys()].map((name) => [name, false] as [string, boolean]),
    ...[...node.directories.keys()].map((name) =>
      [name, true] as [string, boolean]
    ),
  ];
  names.sort(compareEntries);
  for (const [name, isDirectory] of names) {
    let hash: string;
    let mode: string;
    if (isDirectory) {
      hash = await writeTree(node.directories.get(name)!, out);
      mode = "40000";
    } else {
      const blob = await object("blob", node.files.get(name)!);
      out.set(blob.hash, blob.loose);
      hash = blob.hash;
      mode = "100644";
    }
    entries.push(encoder.encode(`${mode} ${name}\0`), hexToBytes(hash));
  }
  const stored = await object("tree", concat(entries));
  out.set(stored.hash, stored.loose);
  return stored.hash;
}

export interface BareRepository {
  /** Repository files keyed by path inside the bare repository, such as `objects/ab/cd...`. */
  files: Record<string, Uint8Array>;
  commit: string;
}

/** Build a bare repository holding one commit of the given files. */
export async function bareRepository(
  paths: Record<string, Uint8Array>,
  message: string,
): Promise<BareRepository> {
  const objects = new Map<string, Uint8Array>();
  const root = await writeTree(tree(paths), objects);
  const commitBody = encoder.encode(
    `tree ${root}\nauthor ${AUTHOR} ${COMMIT_TIME} +0000\ncommitter ${AUTHOR} ${COMMIT_TIME} +0000\n\n${message}\n`,
  );
  const commit = await object("commit", commitBody);
  objects.set(commit.hash, commit.loose);
  const files: Record<string, Uint8Array> = {
    HEAD: encoder.encode(`ref: refs/heads/${BRANCH}\n`),
    config: encoder.encode(
      "[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = true\n",
    ),
    description: encoder.encode(
      "The learn.joshhale.me agent plugin, served by the site for git clone.\n",
    ),
    "info/refs": encoder.encode(`${commit.hash}\trefs/heads/${BRANCH}\n`),
    [`refs/heads/${BRANCH}`]: encoder.encode(`${commit.hash}\n`),
    "objects/info/packs": encoder.encode("\n"),
  };
  for (
    const [hash, loose] of [...objects.entries()].sort((
      [a],
      [b],
    ) => (a < b ? -1 : 1))
  ) files[`objects/${hash.slice(0, 2)}/${hash.slice(2)}`] = loose;
  return { files, commit: commit.hash };
}
