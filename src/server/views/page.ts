/** Serialize a value for an inline script without letting it close the script element. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
}

/** The single page shell. The browser app owns shelf, overview and learning surfaces inside it. */
export function page(lesson: unknown): string {
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="theme-color" content="#eae2d3" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#1c1812" media="(prefers-color-scheme: dark)">',
    "<title>learn</title>",
    '<link rel="stylesheet" href="/css/tokens.css">',
    '<link rel="stylesheet" href="/css/reference.css">',
    '<link rel="stylesheet" href="/css/app.css">',
  ].join("");
  const body = [
    '<main id="app" aria-live="polite"></main>',
    `<script>window.__LESSON__=${inlineJson(lesson)}</script>`,
    '<script type="module" src="/js/app.js"></script>',
  ].join("");
  return `<!doctype html><html lang="en" data-accent="bronze"><head>${head}</head><body>${body}</body></html>`;
}
