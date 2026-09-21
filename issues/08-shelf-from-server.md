# 08 — Mine shelf lists the account's lessons and caches them on open

**What to build:** An agent creates a lesson through the API on the laptop.
Josh pulls down on his phone's shelf and the lesson appears as Not started. He
taps it, the overview loads, and the revision is now in IndexedDB so the whole
lesson works offline from then on. The stable learning URL that the API and
plugin return opens that lesson's overview for the signed-in owner.

The shelf shows every lesson the account owns, newest first, with its progress
state derived from local events: Not started, In progress, Seen, Learned. A
guest sees only lessons already cached on the device. Opening a lesson stores
its Lesson Revision behind the existing local lesson repository, keyed by
revision ID. Progress stays pinned to that revision.

When the server has a newer revision than the one a learner has progress on,
the shelf card shows an Outdated mark. Opening it offers two actions: continue
the old revision, or discard progress and start the new one. Discarding is an
explicit confirmation and advances the progress epoch, as
`docs/domain-model.md` requires. Nothing moves progress across revisions.

Add the read routes the shelf needs. They accept the browser session cookie
from ticket 07 as well as a bearer token.

**Demo path:** Create a draft with curl and the owner token. Refresh the phone
shelf and see it. Open it, then go offline and complete the first Concept.
Create a second revision with curl. Come back online and see Outdated, keep
the old revision, then discard and start the new one.

**Blocked by:** 02 — Lesson content follows the plugin model; 07 — Phone
sign-in with a passkey from a one-time invite link.

**Status:** ready-for-agent

- [ ] The shelf lists the signed-in account's lessons from the server and
      merges them with locally cached revisions without duplicates.
- [ ] Opening a lesson caches its revision. A phone-sized Playwright test then
      goes offline and completes a Concept.
- [ ] The learning URL from the API opens the overview for the owner and shows
      a sign-in prompt for a guest who has not cached it.
- [ ] A newer revision shows Outdated. Continuing keeps the old revision.
      Discarding requires confirmation, advances the epoch, and starts the new
      revision from Not started.
- [ ] A guest with no network and no cached lessons sees an empty shelf with a
      short explanation, not an error.
- [ ] `deno task check`, `deno task test`, `deno task test:db` and
      `deno task e2e` pass.

## Verification

```bash
deno task check && deno task test && deno task test:db && deno task e2e
```
