# Five-minute phone checklist

For Josh, on a real phone, against the production site. Use
`https://learn-joshhale.legoguy32109.deno.net` until `learn.joshhale.me` is
attached; passkeys are bound to the host they were registered on, so keep
using the same address throughout one run. Mark each step in the box and note
what you saw when it did not match.

Before you start, on the laptop in the repository:

```bash
LEARN_BASE_URL=https://learn-joshhale.legoguy32109.deno.net deno task invite:mint
```

Keep the printed link ready. It works once and expires in ten minutes.

| # | Step | Expect | Pass | Notes |
| --- | --- | --- | --- | --- |
| 1 | Open the site in Safari (iPhone) or Chrome (Android). Share, then **Add to Home Screen**. | An icon named **learn** appears on the home screen. | [ ] | |
| 2 | Open the invite link from the laptop on the phone. Tap **Register a passkey**. Use Face ID, Touch ID or your fingerprint. | The shelf opens and reads **Signed in as Josh**. | [ ] | |
| 3 | Open the invite link a second time. | A plain page says the link was already used. No error text. | [ ] | |
| 4 | Swipe the app away, then open it again from the home-screen icon. | It opens full screen without the browser bar and still says **Signed in as Josh**. | [ ] | |
| 5 | On the laptop, create a draft (curl or the agent plugin) with the owner token. On the phone, pull down or tap the refresh icon on the shelf. | The new lesson is first on the shelf, marked **Not started**. | [ ] | |
| 6 | Tap the new lesson, then **Start lesson**. Read to the second Card. | The overview shows the title, then Card 1 and Card 2 of Concept 1. | [ ] | |
| 7 | Turn on airplane mode. Swipe the app away and reopen it from the icon. Tap the lesson, then **Resume**. | The shelf opens offline, the lesson opens, and Card 2 is on screen. | [ ] | |
| 8 | Still offline, tap **Continue** to the Question and answer it. Turn airplane mode off. | Feedback appears and the lesson continues. Nothing is lost when the network returns. | [ ] | |
| 9 | Go back to the overview and tap **Every question**. Answer two Questions, one wrong. Tap **Close drill**. | Drill shows one Question at a time with feedback. The shelf state for the lesson has not changed. | [ ] | |
| 10 | On the shelf, tap **Sign out**, then **Sign in with a passkey**. | The shelf shows **Guest**, then **Signed in as Josh** again after the passkey prompt. | [ ] | |

Known before you start (from the automated audit, tickets in `issues/`):

- Step 7 fails today. Production serves 404 for `/sw.js`, so nothing is
  cached for offline launch (ticket 25). Steps 5, 6 and 8 still work online.
- Steps 1 and 4 depend on the phone's browser. Chrome on Android needs the
  service worker to offer install in some versions; iOS Safari installs from
  the manifest alone.

Date: ____________ Phone and OS: ____________________ Browser: ______________
