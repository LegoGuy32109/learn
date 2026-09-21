# 06 — Installable PWA shell that reopens a cached lesson offline

**What to build:** Josh adds the site to his phone's home screen. With the
network off, he opens it from the icon, sees his shelf, opens a lesson he
already opened once, and resumes exactly where he left.

Add a web app manifest with icons from the UI reference's icon set, standalone
display, the theme colors already in the page shell, and the stable start URL.
Add a service worker that caches only the versioned application shell and
static assets: the HTML shell, CSS, browser modules, icons and the manifest.
Lesson content and progress stay in IndexedDB as `docs/architecture.md`
requires. Never cache an API response or a mutation.

Version the cache by a build hash. A new deploy activates the new worker on the
next launch and removes the old cache. Show a small "Update ready" affordance
when a new version is waiting, without interrupting a Question.

**Demo path:** Install to the home screen, open the demo lesson to Card 2, turn
on airplane mode, close and reopen from the icon, and see Card 2.

**Blocked by:** 01 — Split the browser app and server routes into domain modules.

**Status:** ready-for-agent

- [ ] The manifest passes an installability check in Chromium: name, icons at
      192 and 512, start URL, display standalone, theme color.
- [ ] The service worker precaches the shell and static assets and serves them
      offline. A request to any `/api/` path is never served from the worker's
      cache.
- [ ] A phone-sized Playwright test loads the app once, goes offline with the
      browser context, reloads, and resumes the same Card from IndexedDB.
- [ ] A changed asset hash results in a new cache name, and the old cache is
      deleted after activation.
- [ ] Every request the worker handles is covered by a unit test of its routing
      decision, run without a browser.
- [ ] `deno task check`, `deno task test` and `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task e2e
```
