/** Serialize a value for an inline script without letting it close the script element. */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
}

/** Escape text for an HTML text node or attribute value. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** What the browser app knows about the signed-in account. Never carries a credential. */
export interface PageSession {
  signedIn: boolean;
  displayName: string | null;
}

/** The HTML document every server-rendered page shares: head, stylesheets, body and scripts. */
export function document(
  body: string,
  options: { title?: string } = {},
): string {
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="theme-color" content="#eae2d3" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#1c1812" media="(prefers-color-scheme: dark)">',
    `<title>${escapeHtml(options.title ?? "learn")}</title>`,
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<link rel="icon" href="/icons/icon-192.png" type="image/png">',
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<link rel="stylesheet" href="/css/tokens.css">',
    '<link rel="stylesheet" href="/css/reference.css">',
    '<link rel="stylesheet" href="/css/app.css">',
    '<link rel="stylesheet" href="/css/sync.css">',
  ].join("");
  return `<!doctype html><html lang="en" data-accent="bronze"><head>${head}</head><body>${body}</body></html>`;
}

/**
 * The single app shell. The browser app owns shelf, overview and learning surfaces inside it.
 * With a lesson, the shell inlines it so the first paint needs no second request. Without one
 * (the `/shell` document the service worker serves offline) the browser app reads the lesson it
 * already cached in IndexedDB. The session never carries a credential.
 */
export function page(lesson: unknown | null, session: PageSession): string {
  const scripts = [
    lesson === null ? "" : `window.__LESSON__=${inlineJson(lesson)};`,
    `window.__SESSION__=${inlineJson(session)}`,
  ].join("");
  const body = [
    '<main id="app" aria-live="polite"></main>',
    '<p id="sync-status" class="syncstatus" role="status" aria-live="polite" hidden></p>',
    `<script>${scripts}</script>`,
    '<script type="module" src="/js/app.js"></script>',
  ].join("");
  return document(body);
}

/**
 * What a closed site shows a visitor who is not signed in: no lesson and no app, only a passkey
 * sign-in for a device that already registered one. A new device registers through an invite link.
 */
export function closedPage(): string {
  const body = [
    '<main id="app" class="page invite"><div class="libhead"><div><p class="eyebrow">Private</p><h1 class="libtitle">learn</h1></div></div>',
    '<div class="notice"><span>This site is private.</span></div>',
    '<p id="sign-in-status" class="state" aria-live="polite"></p>',
    '<div class="actions"><button class="go quiet" id="sign-in" type="button">Sign in with a passkey</button></div></main>',
    '<script type="module" src="/js/closed.js"></script>',
  ].join("");
  return document(body, { title: "learn" });
}
