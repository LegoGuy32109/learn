// The agent plugin: a human page at /plugin and the generated plugin files under /plugin/,
// including the marketplace manifest, the archive and the bare repository for git clone.
import { html } from "../http.ts";
import { PLUGIN_PATH } from "../plugin/links.ts";
import { pluginPage } from "../views/plugin.ts";
import { type Route, route } from "./route.ts";

export function pluginRoutes(): Route[] {
  return [
    route(
      "GET",
      PLUGIN_PATH,
      async (request) => html(pluginPage(new URL(request.url).origin)),
    ),
  ];
}
