// Writes the agent plugin under public/plugin from the shared sources: manifests, skill,
// references, bundled validator, scripts, archive and the bare repository for git clone.
// The directory is replaced whole so a stale object or text never survives regeneration.
import { committedPluginFiles, PLUGIN_ROOT, pluginFiles } from "../src/server/plugin/files.ts";

const repo = new URL("../", import.meta.url);
const generated = await pluginFiles();
const existing = await committedPluginFiles(repo);
for (const path of Object.keys(existing)) {
  if (!(path in generated.files)) await Deno.remove(new URL(path, repo));
}
for (const [path, bytes] of Object.entries(generated.files)) {
  const target = new URL(path, repo);
  await Deno.mkdir(new URL("./", target), { recursive: true });
  await Deno.writeFile(target, bytes);
}
console.log(`Generated ${Object.keys(generated.files).length} files under ${PLUGIN_ROOT}; archive sha256 ${generated.archiveSha256}; repository commit ${generated.commit}`);
