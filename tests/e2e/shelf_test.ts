// The phone shelf against a database-free server: an agent creates a lesson through the API, the
// signed-in phone refreshes and sees it, opens it (which caches the revision), completes a Concept
// offline, opens the learning URL as owner and as guest, sees Outdated after a second revision,
// keeps the old revision, then discards with confirmation and starts the new one from Not started.
// A guest with no network and nothing cached sees an empty shelf with an explanation.
import { chromium, expect } from "@playwright/test";
import fixture from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { createApp, FIXTURE_ACCOUNT, fixtureDependencies } from "../../src/app.ts";
import { FixtureLessonRepository } from "../../src/server/repositories/lessons.ts";
import { stubAuthenticator } from "../support/stub-auth.ts";
import { answerCorrectly, readCards } from "./support/demo.ts";

const OWNER = "e2e-owner-token";
const TITLE = "Staleness in CDN caches";
const REVISED = "Staleness in CDN caches, revised";
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

/** What the agent on the laptop sends: the fixture with another title and no server-assigned IDs. */
function document(title: string) {
  const lesson = structuredClone(fixture) as Record<string, unknown>;
  delete lesson.lessonId;
  delete lesson.revisionId;
  lesson.title = title;
  return JSON.stringify(lesson);
}

async function readStore(page: any, store: string): Promise<any[]> {
  return await page.evaluate((name: string) => new Promise((resolve, reject) => {
    const request = indexedDB.open("learn-local-v1");
    request.onsuccess = () => {
      const all = request.result.transaction(name, "readonly").objectStore(name).getAll();
      all.onsuccess = () => resolve(all.result);
      all.onerror = () => reject(all.error);
    };
    request.onerror = () => reject(request.error);
  }), store);
}

Deno.test({ name: "phone shelf lists the account's lessons, caches on open, works offline, and handles an outdated revision", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const dependencies = await fixtureDependencies();
  dependencies.lessons = new FixtureLessonRepository(fixture, FIXTURE_ACCOUNT.id);
  dependencies.auth = stubAuthenticator({ [OWNER]: { accountId: FIXTURE_ACCOUNT.id, scopes: ["lessons:read", "lessons:write"] } });
  const server = Deno.serve({ port: 0, onListen() {} }, createApp(dependencies));
  const origin = `http://127.0.0.1:${server.addr.port}`;
  const setCookie = await dependencies.sessions.issue(new Request(origin), { accountId: FIXTURE_ACCOUNT.id, displayName: "Josh" });
  const sessionCookie = { name: "learn_session", value: setCookie.split(";")[0].split("=")[1], url: origin };
  const agent = (path: string, body: string) => fetch(`${origin}${path}`, { method: "POST", headers: { authorization: `Bearer ${OWNER}`, "content-type": "application/json" }, body });

  const browser = await chromium.launch({ headless: true });
  const errors: string[] = [];
  const phone = await browser.newContext(PHONE);
  await phone.addCookies([sessionCookie]);
  const page = await phone.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error: Error) => errors.push(error.message));
  try {
    // The signed-in shelf shows the demo lesson the account owns, and the worker takes control.
    await page.goto(`${origin}/`);
    await expect(page.locator("#account-status")).toHaveText("Signed in as Josh");
    await expect(page.locator(".lesson")).toHaveCount(1);
    await expect(page.locator(".lesson").first()).toContainText(fixture.title);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    // An agent creates a lesson on the laptop. The phone refreshes and sees it first, Not started.
    const created = await (await agent("/api/v1/lessons", document(TITLE))).json();
    expect(created.revisionNumber).toBe(1);
    await page.getByRole("button", { name: "Refresh shelf" }).click();
    await expect(page.locator(".lesson")).toHaveCount(2);
    await expect(page.locator(".lesson").first()).toContainText(TITLE);
    await expect(page.locator(".lesson").first()).toContainText("Not started");
    await expect(page.locator(".lesson").first()).not.toContainText("Outdated");

    // Opening it shows the overview and caches the revision, pinned in a progress stream.
    await page.getByRole("button", { name: new RegExp(TITLE) }).click();
    await expect(page.locator(".overview h1")).toHaveText(TITLE);
    await expect(page).toHaveURL(`${origin}/learn/${created.lessonId}`);
    await expect(page.getByRole("button", { name: "Start lesson" })).toBeVisible();
    const cachedIds = (await readStore(page, "lessons")).map((record) => record.id);
    expect(cachedIds).toContain(created.revisionId);
    expect(await readStore(page, "progress_streams")).toEqual([{ id: created.lessonId, revisionId: created.revisionId, epoch: 0 }]);

    // Airplane mode: reload the learning URL from the cached shell and complete the first Concept.
    await phone.setOffline(true);
    await page.reload();
    expect(await page.evaluate(() => "__LESSON__" in window)).toBe(false);
    await expect(page.locator(".overview h1")).toHaveText(TITLE);
    await page.getByRole("button", { name: "Start lesson" }).click();
    await expect(page.locator(".cardbody h2")).toHaveText("A fresh response can be reused");
    await readCards(page, 2);
    await expect(page.locator(".qhead")).toBeVisible();
    await answerCorrectly(page);
    await expect(page.getByText("Correct", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator(".cardbody h2")).toHaveText("Validators name a version");
    await phone.setOffline(false);
    const offlineEvents = await readStore(page, "learning_events");
    expect(offlineEvents.length).toBeGreaterThanOrEqual(4);
    expect(offlineEvents.every((event) => event.lessonRevisionId === created.revisionId && event.epoch === 0)).toBe(true);

    // The learning URL: the owner on another device lands on the overview; a guest is asked to sign in.
    const laptop = await browser.newContext(PHONE);
    await laptop.addCookies([sessionCookie]);
    const ownerPage = await laptop.newPage();
    ownerPage.setDefaultTimeout(5000);
    await ownerPage.goto(`${origin}/learn/${created.lessonId}`);
    await expect(ownerPage.locator(".overview h1")).toHaveText(TITLE);
    await expect(ownerPage.getByRole("button", { name: "Start lesson" })).toBeVisible();
    await laptop.close();
    const stranger = await browser.newContext(PHONE);
    const guestPage = await stranger.newPage();
    guestPage.setDefaultTimeout(5000);
    await guestPage.goto(`${origin}/learn/${created.lessonId}`);
    await expect(guestPage.locator("h1")).toHaveText("Sign in to open this lesson");
    await expect(guestPage.getByRole("button", { name: "Sign in with a passkey" })).toBeVisible();
    await guestPage.getByRole("button", { name: "Back to shelf" }).click();
    await expect(guestPage.locator(".libtitle")).toHaveText("Mine");
    await expect(guestPage.locator(".lesson")).toHaveCount(1);
    await stranger.close();

    // The agent creates a second revision. Back online, the shelf marks the lesson Outdated.
    const revised = await (await agent(`/api/v1/lessons/${created.lessonId}/revisions`, document(REVISED))).json();
    expect(revised.revisionNumber).toBe(2);
    await page.goto(`${origin}/`);
    await expect(page.locator(".lesson").first()).toContainText(TITLE);
    await expect(page.locator(".lesson").first()).toContainText("In progress");
    await expect(page.locator(".lesson").first()).toContainText("Outdated");

    // Continuing keeps the old revision and its checkpoint.
    await page.locator(".lesson").first().click();
    await expect(page.locator("#outdated-notice")).toBeVisible();
    await page.getByRole("button", { name: "Resume this revision" }).click();
    await expect(page.locator(".shellhead h1")).toHaveText(TITLE);
    await expect(page.locator(".cardbody h2")).toHaveText("Validators name a version");
    await page.getByRole("button", { name: "Close lesson" }).click();
    await expect(page.locator(".lesson").first()).toContainText("Outdated");
    expect(await readStore(page, "progress_streams")).toEqual([{ id: created.lessonId, revisionId: created.revisionId, epoch: 0 }]);

    // Discarding asks first. Keeping changes nothing; confirming advances the epoch and starts the new revision.
    await page.locator(".lesson").first().click();
    await page.getByRole("button", { name: "Discard progress and start the new revision" }).click();
    await expect(page.locator("#discard-confirm")).toBeVisible();
    await page.getByRole("button", { name: "Keep my progress" }).click();
    await expect(page.locator("#discard-confirm")).toHaveCount(0);
    await expect(page.locator("#outdated-notice")).toBeVisible();
    await page.getByRole("button", { name: "Discard progress and start the new revision" }).click();
    await page.getByRole("button", { name: "Discard and start the new revision" }).click();
    await expect(page.locator(".overview h1")).toHaveText(REVISED);
    await expect(page.locator(".overview .state")).toHaveText("Not started");
    await expect(page.locator("#outdated-notice")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start lesson" })).toBeVisible();
    expect(await readStore(page, "progress_streams")).toEqual([{ id: created.lessonId, revisionId: revised.revisionId, epoch: 1 }]);
    const afterDiscard = await readStore(page, "learning_events");
    expect(afterDiscard.length).toBe(offlineEvents.length);
    expect((await readStore(page, "lessons")).map((record) => record.id)).toContain(revised.revisionId);
    await page.getByRole("button", { name: "Back to shelf" }).click();
    await expect(page.locator(".lesson").first()).toContainText(REVISED);
    await expect(page.locator(".lesson").first()).toContainText("Not started");
    await expect(page.locator(".lesson").first()).not.toContainText("Outdated");
    await expect(page.locator(".lesson")).toHaveCount(2);

    // A guest with nothing cached and no network sees an empty shelf that explains itself.
    const empty = await browser.newContext(PHONE);
    const emptyPage = await empty.newPage();
    emptyPage.setDefaultTimeout(5000);
    emptyPage.on("pageerror", (error: Error) => errors.push(error.message));
    await emptyPage.goto(`${origin}/shell`);
    await emptyPage.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await expect(emptyPage.locator("#shelf-empty")).toContainText("Nothing on this shelf yet");
    await empty.setOffline(true);
    await emptyPage.goto(`${origin}/`);
    await expect(emptyPage.locator("#shelf-empty")).toContainText("Nothing on this shelf yet");
    await expect(emptyPage.locator("#shelf-empty")).toContainText("Sign in with your passkey while connected");
    await expect(emptyPage.locator(".lesson")).toHaveCount(0);
    await expect(emptyPage.locator("#account-status")).toHaveText("Guest");
    await empty.close();

    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.shutdown();
  }
} });
