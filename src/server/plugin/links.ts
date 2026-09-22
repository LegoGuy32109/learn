// Names and served locations of the agent plugin. Imported by the capability document and
// the plugin texts alike, so it depends on nothing else.

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

