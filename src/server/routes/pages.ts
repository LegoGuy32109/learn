// Server-rendered page shells. The browser app owns navigation inside them.
import type { Dependencies } from "../dependencies.ts";
import { html } from "../http.ts";
import { page } from "../views/page.ts";
import { type Route, route } from "./route.ts";

export function pageRoutes(dependencies: Dependencies): Route[] {
  const shell = async () => html(page(await dependencies.lessons.featured()));
  return [
    route("GET", "/", shell),
    route("GET", "/learn/*", shell),
  ];
}
