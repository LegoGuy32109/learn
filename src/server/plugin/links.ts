// Names and served locations of the agent plugin. Imported by the capability document and
// the plugin texts alike, so it depends on nothing else.

/**
 * The public origin the site is reached at, and the one baked into every generated text
 * (plugin, marketplace archive URL, OpenAPI default). The custom domain learn.joshhale.me is
 * not attached yet, so this is the Deno Deploy hostname. Switching to the custom domain means
 * changing this one value (or setting LEARN_PUBLIC_ORIGIN at generation time), then running
 * `deno task plugin:generate` and `deno task deploy`. See docs/deno-deploy.md.
 */
export const DEFAULT_PUBLIC_ORIGIN = "https://learn.joshhale.me";

function configuredPublicOrigin(): string {
  try {
    const value = Deno.env.get("LEARN_PUBLIC_ORIGIN");
    if (value) return new URL(value).origin;
  } catch (error) {
    if (!(error instanceof Deno.errors.NotCapable)) throw error;
  }
  return DEFAULT_PUBLIC_ORIGIN;
}

/** The public origin in effect: LEARN_PUBLIC_ORIGIN when set and readable, else the default. */
export const PUBLIC_ORIGIN = configuredPublicOrigin();

export const PLUGIN_NAME = "learn-lesson";
export const PLUGIN_VERSION = "0.3.0";
export const SKILL_NAME = "lesson";
export const MARKETPLACE_NAME = "learn-joshhale";
export const ARCHIVE_FILE = "learn-lesson-plugin.zip";
export const REPOSITORY_DIR = "learn-lesson-plugin.git";
export const PLUGIN_PATH = "/plugin";

/** The served locations of the plugin, absolute on one origin. */
export function pluginLinks(origin: string) {
  const base = new URL(`${PLUGIN_PATH}/`, origin).href;
  return {
    page: new URL(PLUGIN_PATH, origin).href,
    marketplace: `${base}marketplace.json`,
    manifest: `${base}.claude-plugin/plugin.json`,
    archive: `${base}${ARCHIVE_FILE}`,
    repository: `${base}${REPOSITORY_DIR}`,
    skill: `${base}skills/${SKILL_NAME}/SKILL.md`,
  };
}
