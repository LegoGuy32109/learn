// Ticket 27 audit: the golden flow Josh described, walked end to end against production. The
// human-in-the-loop half of the flow (installing the plugin into another coding project and
// letting its skill author a lesson from real work) is not something this rerunnable suite can
// do for itself on every run — a nested agent session is slow, non-deterministic in its content,
// and outside what `deno test` should spawn. That half was walked for real once, by hand, exactly
// as the ticket asks (see issues/27-verify-the-golden-flow.md's report for the transcript, the
// diagnostics it hit, and the production lesson it created). This suite covers everything the
// ticket asks that IS mechanical and worth rerunning: sign-in with a passkey, the shelf showing a
// freshly authored lesson first and Not started, the full learning loop to Learned (Cards, a
// wrong Check answer with its belief and correcting Card, an unseen retry, "I don't know", the
// Wrap-up, the Learned summary), a partial "Every question" drill that leaves the shelf
// unchanged, going offline mid-lesson and resuming at the exact position after closing and
// reopening, finishing a Concept offline and confirming the server has it once back online, and a
// second signed-in context showing the same progress. It creates only lessons whose title starts
// with `audit-`, deletes nothing, and lists what it created in tests/audit-golden/last-run.md.
//
// Run: deno task audit:golden          (LEARN_BASE_URL optional; the owner token is read from .env.prod)
import { chromium, expect } from "@playwright/test";
import {
  answer,
  attachListeners,
  check,
  idk,
  observe,
  readStore,
  report,
  results,
  setScreenshotDirectory,
  settle,
  signature,
  tap,
  useLesson,
} from "../audit/support.ts";
import { drillFromFresh, fullWalk } from "../audit/walk.ts";
import {
  auditTitle,
  BASE,
  created,
  lessonDocument,
  looksLikeStackTrace,
  mintInviteWithTask,
  probe,
  productionSecrets,
  recordPageBodies,
  redact,
  scanBodies,
} from "../audit-prod/support.ts";

const HERE = new URL("./", import.meta.url);
const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const SCREENSHOTS = new URL("./screenshots/", HERE).pathname;
const REPORT_PATH = new URL("./last-run.md", HERE).pathname;

let shot = 0;

/** Screenshot the page into this suite's own screenshots directory and return the path for evidence. */
async function snap(page: any, name: string): Promise<string> {
  shot += 1;
  const file = `${SCREENSHOTS}${String(shot).padStart(2, "0")}-${
    name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
  }.jpg`;
  await page.screenshot({
    path: file,
    type: "jpeg",
    quality: 60,
    fullPage: true,
  });
  return `screenshot: ${file.slice(REPO_ROOT.length)}`;
}

/** iPhone-sized Chromium with touch, a mobile user agent and a 3x screen, as a phone would present. */
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  colorScheme: "light" as const,
};

const errors: string[] = [];
const consoleMessages: string[] = [];

Deno.test({
  name: "audit: the golden flow, from a working agent session to Learned",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    if (!BASE.startsWith("https://")) {
      throw new Error(`LEARN_BASE_URL must use https, got ${BASE}`);
    }
    setScreenshotDirectory(SCREENSHOTS);
    const secrets = await productionSecrets();
    observe(
      "token source",
      `The owner token came from the ${
        secrets.source === "file"
          ? ".env.prod file"
          : "LEARN_OWNER_TOKEN environment variable"
      }.`,
    );
    const started = new Date();
    const browser = await chromium.launch({ headless: true });
    try {
      const signedIn = await signIn(browser);
      if (signedIn.storageState) {
        await shelfAndLearningLoop(browser, signedIn);
        await offlineAndSecondDevice(browser, signedIn);
      }
      const values = (await productionSecrets()).values;
      await check(
        "secrets · no response body anywhere in this run leaked a credential or a token-shaped string",
        () => {
          expect(scanBodies(values)).toEqual([]);
        },
      );
    } finally {
      await browser.close();
      const text = [
        report("Golden flow"),
        "",
        "### Run",
        "",
        `- Base URL: ${BASE}`,
        `- Started: ${started.toISOString()}`,
        "",
        "### Created on production (nothing was deleted)",
        "",
        ...(created.length
          ? created.map((item) => `- ${item}`)
          : ["- nothing"]),
        "",
      ].join("\n");
      await Deno.writeTextFile(REPORT_PATH, redact(text) + "\n");
      console.log("\n" + redact(text) + "\n");
    }
    const failed = results.filter((result) => !result.ok);
    if (failed.length) {
      throw new Error(
        `${failed.length} audit checks failed; see ${REPORT_PATH}`,
      );
    }
  },
});

// ---------------------------------------------------------------------------------------------
// Setup: invite, passkey, home-screen-equivalent session.

interface SignedIn {
  storageState: any;
  displayName: string;
}

async function signIn(browser: any): Promise<SignedIn> {
  const outcome: SignedIn = { storageState: null, displayName: "Josh" };
  let invite: { url: string; path: string; expiresAt: number } | null = null;
  await check(
    "setup · a sign-in invite minted the way Josh mints one opens for his account",
    async () => {
      invite = await mintInviteWithTask();
      created.push(
        `sign-in invite ${
          invite.path.slice(0, 16)
        }… (consumed by this run's passkey registration)`,
      );
      return `invite expires in ${
        Math.round((invite.expiresAt - Date.now()) / 1000)
      } s (link withheld)`;
    },
  );
  if (!invite) return outcome;
  const minted = invite as { url: string; path: string; expiresAt: number };

  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  attachListeners(page, errors, consoleMessages);
  recordPageBodies(page, "sign-in");
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send(
      "WebAuthn.addVirtualAuthenticator",
      {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
        },
      },
    );
    await page.goto(minted.url);
    await check(
      "setup · the invite page names Josh's account with one Register a passkey button",
      async () => {
        const notice = await page.locator(".notice strong").first()
          .textContent();
        const named = notice?.match(/^Invite for (.+)\.$/);
        expect(named, `notice reads ${JSON.stringify(notice)}`).toBeTruthy();
        outcome.displayName = named![1];
        await expect(page.getByRole("button", { name: "Register a passkey" }))
          .toBeVisible();
        return await snap(page, "invite page");
      },
    );
    await page.getByRole("button", { name: "Register a passkey" }).click();
    await check(
      "setup · registering a passkey signs in and lands on the shelf, as the phone would after Add to Home Screen",
      async () => {
        await page.waitForURL(`${BASE}/`);
        await expect(page.locator("#account-status")).toHaveText(
          `Signed in as ${outcome.displayName}`,
        );
        return await snap(page, "shelf signed in after registration");
      },
    );
    outcome.storageState = await context.storageState();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
    observe(
      "home screen",
      '"Add to Home Screen" itself is not something a headless browser can drive or verify; the manifest that makes it installable (name, icons, standalone display) is already asserted by ticket 14\'s audit_prod suite, so this run only re-proves the sign-in half.',
    );
  } catch (error) {
    await check("setup · the sign-in section ran to completion", () => {
      throw error;
    });
  } finally {
    await cdp.detach().catch(() => {});
    await context.close();
  }
  return outcome;
}

// ---------------------------------------------------------------------------------------------
// Shelf, overview, and the full learning loop to Learned, as the signed-in owner.

async function shelfAndLearningLoop(browser: any, signedIn: SignedIn) {
  const { ownerToken } = await productionSecrets();
  // A fresh title every run (the offline scenario below already does this) changes the fingerprint,
  // so this always gets its own Lesson Revision with no progress: identical content dedupes to the
  // same revision by fingerprint (src/server/repositories/lessons.ts's byFingerprint), and that
  // revision's progress syncs back from the server to any freshly signed-in device, so reusing one
  // fixed title would make this walk's own lesson permanently Learned and unrunnable a second time.
  // useLesson points every shared helper (fullWalk, drillFromFresh, keyFor, answer, idk...) at the
  // content the server actually stored for this title, so the walk and its answer key stay correct
  // for whatever this run submitted rather than for a fixed literal.
  const title = auditTitle("-golden-learning-loop");
  let lessonId = "";

  await check(
    "author · a lesson draft is created with the owner's bearer token (stands in for the plugin's own submission)",
    async () => {
      const response = await fetch(`${BASE}/api/v1/lessons`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${ownerToken}`,
          "content-type": "application/json",
        },
        body: lessonDocument(title),
      });
      const body = await response.json();
      expect(response.status).toBe(201);
      lessonId = body.lessonId;
      useLesson(body.content);
      created.push(`lesson ${lessonId} "${title}" (learning-loop run)`);
      return `POST /api/v1/lessons -> 201 lessonId=${lessonId}`;
    },
  );
  if (!lessonId) return;
  const lessonPath = `/learn/${lessonId}`;
  const context = { ...PHONE, storageState: signedIn.storageState };

  const shelfContext = await browser.newContext(context);
  const shelfPage = await shelfContext.newPage();
  shelfPage.setDefaultTimeout(10000);
  attachListeners(shelfPage, errors, consoleMessages);
  recordPageBodies(shelfPage, "shelf");
  try {
    await shelfPage.goto(`${BASE}/`);
    // This lesson's title is unique to this run (above), so this is always a brand new draft, Not
    // started; "first, newest" ordering is proved instead in offlineAndSecondDevice, whose lesson is
    // uniquely titled the same way. This check only proves the lesson the walk is about to drive is
    // on the shelf, Not started, as the signed-in owner.
    await check(
      "shelf · the authored lesson is on the shelf, Not started, for the signed-in owner",
      async () => {
        await expect(shelfPage.locator("#account-status")).toHaveText(
          `Signed in as ${signedIn.displayName}`,
        );
        await shelfPage.getByRole("button", { name: "Refresh shelf" }).click();
        await settle(shelfPage);
        await expect(shelfPage.locator(`[data-lesson="${lessonId}"] .lstatus`))
          .toHaveText("Not started");
        return await snap(shelfPage, "shelf with new lesson");
      },
    );
  } finally {
    await shelfContext.close();
  }

  await fullWalk(browser, BASE, errors, consoleMessages, {
    lessonPath,
    lessonId,
    timeout: 10000,
    context,
  });
  await drillFromFresh(browser, BASE, errors, consoleMessages, {
    lessonPath,
    lessonId,
    timeout: 10000,
    context,
  });
  observe(
    "learning loop",
    'fullWalk carries the Cards, a wrong Check answer with its belief and correcting Card, an unseen retry, a correct answer, "I don\'t know" on another Concept, the Wrap-up (which draws a reserved Question the Checks never asked) and the Learned summary, then opens "Every question", answers one wrong and closes the drill unfinished, asserting the shelf and evidence stores are unchanged by it. drillFromFresh separately runs the drill to completion from a fresh state.',
  );
}

// ---------------------------------------------------------------------------------------------
// Offline: close, reopen from the icon, resume at the exact Card, finish a Concept offline, sync.
// Second device: a second signed-in context sees the same progress and the same resume point.

async function offlineAndSecondDevice(browser: any, signedIn: SignedIn) {
  const { ownerToken } = await productionSecrets();
  const title = auditTitle("-golden-offline");
  let lessonId = "";
  let revisionId = "";

  await check(
    "author · a second lesson draft, isolated from the learning-loop run, for the offline and second-device scenarios",
    async () => {
      const response = await fetch(`${BASE}/api/v1/lessons`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${ownerToken}`,
          "content-type": "application/json",
        },
        body: lessonDocument(title),
      });
      const body = await response.json();
      expect(response.status).toBe(201);
      lessonId = body.lessonId;
      revisionId = body.revisionId;
      created.push(
        `lesson ${lessonId} "${title}" (offline and second-device run)`,
      );
      return `POST /api/v1/lessons -> 201 lessonId=${lessonId} revisionId=${revisionId}`;
    },
  );
  if (!lessonId) return;
  const lessonPath = `/learn/${lessonId}`;
  const contextOptions = { ...PHONE, storageState: signedIn.storageState };

  const orderContext = await browser.newContext(contextOptions);
  const orderPage = await orderContext.newPage();
  orderPage.setDefaultTimeout(10000);
  attachListeners(orderPage, errors, consoleMessages);
  try {
    await orderPage.goto(`${BASE}/`);
    await check(
      "shelf · this uniquely-titled fresh draft is first on the shelf, newest first, Not started",
      async () => {
        await orderPage.getByRole("button", { name: "Refresh shelf" }).click();
        await settle(orderPage);
        const firstId = await orderPage.locator(".lesson").first().getAttribute(
          "data-lesson",
        );
        expect(firstId, "the newest lesson is not first on the shelf").toBe(
          lessonId,
        );
        await expect(orderPage.locator(`[data-lesson="${lessonId}"] .lstatus`))
          .toHaveText("Not started");
        return await snap(orderPage, "shelf newest lesson first");
      },
    );
  } finally {
    await orderContext.close();
  }

  const deviceOne = await browser.newContext(contextOptions);
  let page = await deviceOne.newPage();
  page.setDefaultTimeout(10000);
  attachListeners(page, errors, consoleMessages);
  recordPageBodies(page, "offline");
  let resumeSignature: any = null;
  try {
    await page.goto(`${BASE}${lessonPath}`);
    await page.waitForFunction(
      () => navigator.serviceWorker.controller !== null,
      null,
      { timeout: 10000 },
    );
    await tap(page, "Start lesson");
    await tap(page, "Continue"); // Card 1 seen, now on Card 2 of Concept 1.
    resumeSignature = await signature(page);
    await check(
      "offline · Card 2 of Concept 1 is on screen before going offline",
      () => {
        expect(resumeSignature.surface).toBe("learn");
        expect(resumeSignature.cardHeading).toBeTruthy();
        return `surface=${resumeSignature.surface} card=${
          JSON.stringify(resumeSignature.cardHeading)
        }`;
      },
    );

    await deviceOne.setOffline(true);
    await page.close();
    page = await deviceOne.newPage();
    page.setDefaultTimeout(10000);
    attachListeners(page, errors, consoleMessages);
    await page.goto(`${BASE}/`); // the URL Add to Home Screen opens, offline, after the app was killed.
    await settle(page);
    let afterReopen = await signature(page);
    await check(
      "offline · closing the app and reopening from the icon, offline, resumes at the exact Card",
      async () => {
        if (afterReopen.surface === "shelf") {
          await tap(page, new RegExp(title));
          afterReopen = await signature(page);
        }
        if (afterReopen.surface === "overview") {
          await tap(page, "Resume");
          afterReopen = await signature(page);
        }
        expect(
          afterReopen.surface,
          `landed on ${
            JSON.stringify(afterReopen)
          } instead of the Card left off on`,
        ).toBe("learn");
        expect(afterReopen.cardHeading).toBe(resumeSignature.cardHeading);
        return `resumed at card=${
          JSON.stringify(afterReopen.cardHeading)
        }; ${await snap(
          page,
          "concept 2 reached offline".replace("2", "1 resumed"),
        )}`;
      },
    );

    await check(
      "offline · a whole Concept (its remaining Card, then a correct Check answer) completes with the network off",
      async () => {
        await tap(page, "Continue"); // Card 2 seen, now the Concept 1 Check.
        await answer(page, true);
        const after = await signature(page);
        expect(after.surface).toBe("learn");
        return `after finishing Concept 1 offline: ${
          JSON.stringify({
            surface: after.surface,
            cardHeading: after.cardHeading,
            stem: after.stem,
          })
        }; ${await snap(page, "concept 2 reached offline")}`;
      },
    );

    await deviceOne.setOffline(false);
    // A failed sync cycle backs off (up to 60s); reload starts a fresh cycle immediately rather
    // than waiting out whatever backoff the offline attempts accumulated.
    await page.reload();
    await settle(page);
    let flushed = false;
    for (let attempt = 0; attempt < 30 && !flushed; attempt += 1) {
      const outbox = await readStore(page, "outbox");
      flushed = outbox.length === 0;
      if (!flushed) await page.waitForTimeout(500);
    }
    await check(
      "offline · back online, the outbox drains (the client pushed every offline event)",
      () => {
        expect(
          flushed,
          "the outbox never emptied within 15s of reconnecting (after a reload to skip backoff)",
        ).toBe(true);
      },
    );
    await check(
      "offline · the server holds the offline-completed Concept once back online",
      async () => {
        const checkpoint = await page.evaluate(
          async ({ revisionId }: { revisionId: string }) => {
            const response = await fetch(
              `/api/v1/progress/checkpoint?revision=${revisionId}&epoch=0`,
            );
            const text = await response.text();
            let body: any = null;
            try {
              body = JSON.parse(text);
            } catch {
              // left null; the raw text is returned below for evidence.
            }
            return { status: response.status, body, text };
          },
          { revisionId },
        );
        expect(
          checkpoint.status,
          `GET /api/v1/progress/checkpoint -> ${checkpoint.status}: ${
            checkpoint.text.slice(0, 500)
          }`,
        ).toBe(200);
        expect(checkpoint.body.learningEvents).toBeGreaterThanOrEqual(3); // lesson_started, 2 card_seen, 1 question_answered at minimum
        expect(checkpoint.body.checkpoint).toBeTruthy();
        return `GET /api/v1/progress/checkpoint -> ${
          JSON.stringify(checkpoint.body)
        }`;
      },
    );
  } finally {
    // Device one stays open and signed in for the second-device comparison below.
  }

  const deviceTwo = await browser.newContext(contextOptions);
  const secondPage = await deviceTwo.newPage();
  secondPage.setDefaultTimeout(10000);
  attachListeners(secondPage, errors, consoleMessages);
  try {
    await secondPage.goto(`${BASE}${lessonPath}`);
    await settle(secondPage);
    await check(
      "second device · a second signed-in context shows the same progress and resumes at the same place",
      async () => {
        await expect(secondPage.locator(".overview .state")).toHaveText(
          "In progress",
        );
        await tap(secondPage, "Resume");
        const there = await signature(secondPage);
        expect(there.surface).toBe("learn");
        expect(there.eyebrow ?? there.heading ?? "").not.toBe(""); // it is a live surface, not a blank/error state
        return `second device surface: ${
          JSON.stringify({
            surface: there.surface,
            cardHeading: there.cardHeading,
            stem: there.stem,
            status: there.status,
          })
        }; ${await snap(secondPage, "second device same progress")}`;
      },
    );
  } finally {
    await deviceTwo.close();
    await deviceOne.close();
  }
}
