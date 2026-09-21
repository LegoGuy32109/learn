# 14 — Verify the deployed phone experience

**What to do:** Prove that the production site does what Josh will do on his
phone, using mobile-emulated Playwright against the production URL from ticket 05's
report, or `https://learn.joshhale.me` once Josh has attached it,
and then hand Josh a five-minute checklist for a real device. Report defects
as new ticket files. Do not fix anything, and do not create or change any
database.

Automated, against production:

- Manifest and service worker: installability passes, the shell loads offline
  after one visit, and no `/api/` response is ever served from cache.
- Sign-in: with a virtual authenticator, an invite link registers a passkey
  and the session survives a context restart. A reused invite fails cleanly.
- Shelf: a draft created with the owner token appears after refresh, opens,
  caches, and completes offline. A second revision shows Outdated, and the
  discard flow needs confirmation.
- Learning: the full loop from ticket 12's script, run against production.
- Security: HTTPS only, HSTS present, cookie flags correct, no wildcard CORS,
  the capability document and validator served with correct content types,
  and no secret in any response body.

For Josh on a real phone, write a checklist of ten steps or fewer that covers
install to home screen, invite and passkey, open a lesson from a laptop-created
draft, airplane mode resume, and drill mode. Leave space for him to mark each.

**Blocked by:** 05 — Production deployment; 06 — Installable PWA shell; 07 —
Phone sign-in with a passkey; 08 — Mine shelf lists the account's lessons.

**Status:** ready-for-agent

- [ ] The production audit is a rerunnable Playwright suite that takes the
      base URL and the owner token from the environment and creates only
      lessons whose title starts with `audit-`, then deletes nothing and lists
      what it created in the report.
- [ ] Every check above has a pass or fail line in the report with the
      response or screenshot that proves it.
- [ ] The real-device checklist is in the report and in the docs directory.
- [ ] Every defect is a ticket file with a reproduction.
