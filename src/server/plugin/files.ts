// Every file under public/plugin, generated from the shared sources: the plugin manifest,
// the skill and its references, the bundled validator and scripts, the marketplace manifest
// that pins the archive, the archive itself and a bare Git repository for `git clone`.
// `deno task plugin:generate` writes them; a test regenerates them in memory and fails when
// the committed tree differs in any file.
import { DIAGNOSTIC_CODES, diagnosticsReference } from "../../shared/authoring/diagnostics.js";
import { CANONICAL_ORIGIN } from "../api-docs/openapi.ts";
import { generatedFiles } from "../api-docs/generated.ts";
import { diagnosticsMarkdown } from "../api-docs/diagnostics-reference.ts";
import { bareRepository } from "./git.ts";
import { submitScript, validateScript } from "./scripts.ts";
import { ARCHIVE_FILE, authoringMarkdown, lessonSchemaMarkdown, marketplaceManifest, PLUGIN_VERSION, pluginManifest, readmeMarkdown, REPOSITORY_DIR, SKILL_NAME, skillMarkdown } from "./texts.ts";
import { zip } from "./zip.ts";

export const PLUGIN_ROOT = "public/plugin/";

const encoder = new TextEncoder();

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The plugin directory proper: what the archive and the repository contain. Paths are relative to the plugin root. */
export async function pluginTree(origin: string = CANONICAL_ORIGIN): Promise<Record<string, string>> {
  const generated = await generatedFiles();
  const skill = `skills/${SKILL_NAME}/`;
  return {
    ".claude-plugin/plugin.json": pretty(pluginManifest()),
    "README.md": readmeMarkdown(origin),
    [`${skill}SKILL.md`]: skillMarkdown(origin),
    [`${skill}references/authoring.md`]: authoringMarkdown(origin),
    [`${skill}references/lesson-schema.md`]: lessonSchemaMarkdown(origin),
    [`${skill}references/diagnostics.md`]: diagnosticsMarkdown(),
    [`${skill}references/diagnostics.json`]: pretty(diagnosticsReference),
    [`${skill}scripts/lesson-validator.js`]: generated["public/tools/lesson-validator.js"],
    [`${skill}scripts/validate.mjs`]: validateScript(),
    [`${skill}scripts/submit.mjs`]: submitScript(),
  };
}

export interface PluginFiles {
  /** Every file under public/plugin, keyed by repo-relative path. */
  files: Record<string, Uint8Array>;
  archiveSha256: string;
  commit: string;
}

/** Everything `deno task plugin:generate` writes. Deterministic: the same sources give the same bytes. */
export async function pluginFiles(origin: string = CANONICAL_ORIGIN): Promise<PluginFiles> {
  const tree = await pluginTree(origin);
  const bytes = Object.fromEntries(Object.entries(tree).map(([path, text]) => [path, encoder.encode(text)]));
  const ordered = Object.keys(bytes).sort();
  const archive = zip(ordered.map((path) => ({ path, bytes: bytes[path] })));
  const archiveSha256 = await sha256Hex(archive);
  const repository = await bareRepository(bytes, `learn-lesson plugin ${PLUGIN_VERSION}, generated from the lesson/v1 contract (${DIAGNOSTIC_CODES.length} diagnostic codes)`);
  const files: Record<string, Uint8Array> = {};
  for (const path of ordered) files[PLUGIN_ROOT + path] = bytes[path];
  files[`${PLUGIN_ROOT}marketplace.json`] = encoder.encode(pretty(marketplaceManifest(origin, archiveSha256)));
  files[`${PLUGIN_ROOT}${ARCHIVE_FILE}`] = archive;
  for (const [path, content] of Object.entries(repository.files)) files[`${PLUGIN_ROOT}${REPOSITORY_DIR}/${path}`] = content;
  return { files, archiveSha256, commit: repository.commit };
}

/** Every file currently under public/plugin on disk, keyed like `pluginFiles().files`. */
export async function committedPluginFiles(repo: URL): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  async function walk(directory: URL, prefix: string) {
    for await (const entry of Deno.readDir(directory)) {
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory) await walk(new URL(`${entry.name}/`, directory), `${path}/`);
      else files[path] = await Deno.readFile(new URL(entry.name, directory));
    }
  }
  try {
    await walk(new URL(PLUGIN_ROOT, repo), PLUGIN_ROOT);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return files;
}
