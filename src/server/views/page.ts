/** Serialize a value for an inline script without letting it close the script element. */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
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
export function document(body: string, options: { title?: string } = {}): string {
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="theme-color" content="#eae2d3" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#1c1812" media="(prefers-color-scheme: dark)">',
    `<title>${escapeHtml(options.title ?? "learn")}</title>`,
    '<link rel="stylesheet" href="/css/tokens.css">',
    '<link rel="stylesheet" href="/css/reference.css">',
    '<link rel="stylesheet" href="/css/app.css">',
  ].join("");
  return `<!doctype html><html lang="en" data-accent="bronze"><head>${head}</head><body>${body}</body></html>`;
}

/** The single app shell. The browser app owns shelf, overview and learning surfaces inside it. */
export function page(lesson: unknown, session: PageSession): string {
  const body = [
    '<main id="app" aria-live="polite"></main>',
    `<script>window.__LESSON__=${inlineJson(lesson)};window.__SESSION__=${inlineJson(session)}</script>`,
    '<script type="module" src="/js/app.js"></script>',
  ].join("");
  return document(body);
}
