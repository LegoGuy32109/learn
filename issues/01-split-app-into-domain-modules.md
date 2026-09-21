# 01 — Split the browser app and server routes into domain modules

**What to build:** No learner-visible change. The browser learning app and the
server request handler are each one dense file today. Split them so that the
tickets that follow can land in parallel without editing the same file.

Browser side: one entry module per surface (shelf, overview, learning shell),
one module for the flow controller, one for rendering the Card, Question,
feedback and corrective views, and the storage repositories already under the
client storage boundary. Server side: keep bootstrap in the entry file, keep
the request handler as the composition point, and move route groups into
domain modules (pages, lesson API, discovery, static assets) that export
handlers the composition point wires.

Keep the dependency direction from `docs/architecture.md`: shared code imports
no DOM, IndexedDB, HTTP or database code. Format the split code so a line holds
one statement. The current files pack several statements per line, which makes
review and merge conflicts hard.

**Demo path:** The demo lesson plays exactly as before on a phone viewport, and
every existing test passes without edits to its assertions.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The browser code has one entry module per major surface and no module
      longer than about 200 lines.
- [ ] The server request handler contains only composition; each route group
      lives in its own domain module.
- [ ] No shared module imports a browser, Deno, IndexedDB or Turso API.
- [ ] Existing unit, server, database and browser tests pass unchanged in
      what they assert. Import paths may change.
- [ ] `deno task check`, `deno task test`, `deno task test:db` and
      `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task test:db && deno task e2e
```
