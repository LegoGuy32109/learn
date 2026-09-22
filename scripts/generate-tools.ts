// Writes the downloadable validator, its declarations, the diagnostics reference and the served
// copies of the human docs. See src/server/api-docs/generated.ts for the list.
import { generatedFiles } from "../src/server/api-docs/generated.ts";

const repo = new URL("../", import.meta.url);
const files = await generatedFiles();
for (const [path, content] of Object.entries(files)) {
  const target = new URL(path, repo);
  await Deno.mkdir(new URL("./", target), { recursive: true });
  await Deno.writeTextFile(target, content);
}
console.log(`Generated ${Object.keys(files).join(", ")}`);
