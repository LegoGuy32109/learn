// Server-rendered page shells. The browser app owns navigation inside them.
import type { Dependencies } from "../dependencies.ts";
import { html } from "../http.ts";
import { closedPage, page } from "../views/page.ts";
import { type Route, route } from "./route.ts";

export function pageRoutes(dependencies: Dependencies): Route[] {
  /**
   * The shell inlines one lesson so the first paint needs no second request: the featured lesson,
   * or at a learning URL the newest revision of that lesson when the signed-in account owns it.
   * The browser app still decides which cached revision the learner is pinned to. A closed site
   * shows a visitor who is not signed in nothing but a passkey sign-in.
   */
  const shell = async (request: Request) => {
    const lessonId = new URL(request.url).pathname.match(/^\/learn\/([^/]+)/)
      ?.[1];
    const session = await dependencies.sessions.read(request);
    if (!session && dependencies.guests === "closed") {
      return html(closedPage());
    }
    const owned = session && lessonId
      ? await dependencies.lessons.latestRevision(session.accountId, lessonId)
      : null;
    const lesson = owned
      ? owned.content
      : await dependencies.lessons.featured();
    return html(
      page(lesson, {
        signedIn: session != null,
        displayName: session?.displayName ?? null,
      }),
    );
  };
  return [
    route("GET", "/", shell),
    route("GET", "/learn/*", shell),
  ];
}
