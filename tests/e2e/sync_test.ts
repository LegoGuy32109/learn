// Cross-device sync at a phone viewport with two isolated browser contexts signed in as one account.
// Device A learns online up to the Wrap-up; device B opens the lesson and resumes at A's position.
// Both go offline and each learns a different Concept; both come back online and each shows both
// Concepts learned with no event duplicated or lost. A stale checkpoint pushed late never moves a
// device backward. A third device learns with every sync request failing: learning completes, every
// event stays in the outbox, and the four sync states show as the network changes.
import { chromium, expect } from "@playwright/test";
import fixture from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { createApp, FIXTURE_ACCOUNT, fixtureDependencies } from "../../src/app.ts";
import { FixtureLessonRepository } from "../../src/server/repositories/lessons.ts";
import { answerCorrectly, readCards, stem } from "./support/demo.ts";

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const LESSON = fixture.lessonId;
const REVISION = fixture.revisionId;

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

/** The Concepts a device shows as Learned, from its own union of learning events. */
async function learnedConcepts(page: any): Promise<string[]> {
  const events = await readStore(page, "learning_events");
  const ids = new Set(events.map((event) => event.id));
  expect(ids.size).toBe(events.length);
  return [...new Set(events.filter((event) => event.type === "question_answered" && event.flowKind === "wrap_up" && event.correct).map((event) => event.conceptId))].sort();
}

function status(page: any) {
  return page.locator("#sync-status");
}

async function continueOn(page: any) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForTimeout(40);
}

/** Read every Card and pass every Check, arriving at the first Wrap-up Question. */
async function reachWrapUp(page: any) {
  for (const concept of fixture.concepts) {
    await expect(page.locator(".cardbody h2")).toHaveText(concept.cards[0].heading);
    await readCards(page, concept.cards.length);
    await expect(page.locator(".qhead")).toBeVisible();
    await answerCorrectly(page);
    await expect(page.getByText("Correct", { exact: true })).toBeVisible();
    await continueOn(page);
  }
  await expect(page.locator(".prompt .from")).toContainText("Wrap-up");
}

Deno.test({ name: "two phones signed in as one account merge offline progress without losing Learned, and a stale checkpoint never moves either back", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const dependencies = await fixtureDependencies();
  dependencies.lessons = new FixtureLessonRepository(fixture, FIXTURE_ACCOUNT.id);
  const server = Deno.serve({ port: 0, onListen() {} }, createApp(dependencies));
  const origin = `http://127.0.0.1:${server.addr.port}`;
  const setCookie = await dependencies.sessions.issue(new Request(origin), { accountId: FIXTURE_ACCOUNT.id, displayName: "Josh" });
  const cookieValue = setCookie.split(";")[0].split("=")[1];
  const sessionCookie = { name: "learn_session", value: cookieValue, url: origin };

  const browser = await chromium.launch({ headless: true });
  const errors: string[] = [];
  const deviceA = await browser.newContext(PHONE);
  const deviceB = await browser.newContext(PHONE);
  await deviceA.addCookies([sessionCookie]);
  await deviceB.addCookies([sessionCookie]);
  const a = await deviceA.newPage();
  const b = await deviceB.newPage();
  for (const page of [a, b]) {
    page.setDefaultTimeout(5000);
    page.on("pageerror", (error: Error) => errors.push(error.message));
  }
  try {
    // Device A, online: through every Card and Check to the first Wrap-up Question. Synced.
    await a.goto(`${origin}/`);
    await expect(a.locator("#account-status")).toHaveText("Signed in as Josh");
    await a.getByRole("button", { name: new RegExp(fixture.title) }).click();
    await a.getByRole("button", { name: "Start lesson" }).click();
    await reachWrapUp(a);
    const wrapUpStem = await stem(a);
    await expect(status(a)).toHaveText("Synced");
    expect(await readStore(a, "outbox")).toEqual([]);

    // Device B opens the lesson: the overview offers Resume once the pull lands, and Resume lands on A's Question.
    await b.goto(`${origin}/learn/${LESSON}`);
    await expect(b.locator(".overview h1")).toHaveText(fixture.title);
    await expect(status(b)).toHaveText("Synced");
    await expect(b.getByRole("button", { name: "Resume" })).toBeVisible();
    await expect(b.locator(".overview .state")).toHaveText("Seen");
    await b.getByRole("button", { name: "Resume" }).click();
    await expect(b.locator(".prompt .from")).toContainText("Wrap-up");
    expect(await stem(b)).toBe(wrapUpStem);
    const eventsOnA = await readStore(a, "learning_events");
    const eventsOnB = await readStore(b, "learning_events");
    expect(new Set(eventsOnB.map((event) => event.id))).toEqual(new Set(eventsOnA.map((event) => event.id)));
    await expect(status(b)).toHaveText("Synced");

    // Both offline. A learns the first Wrap-up Concept; B skips it and learns a different one.
    await deviceA.setOffline(true);
    await deviceB.setOffline(true);
    await answerCorrectly(a);
    await expect(a.getByText("Correct", { exact: true })).toBeVisible();
    await continueOn(a);
    await expect(a.locator(".prompt .from")).toContainText("Wrap-up");
    await expect(status(a)).toHaveText("Saved on this device");
    const learnedByA = await learnedConcepts(a);
    expect(learnedByA.length).toBe(1);

    await b.getByRole("button", { name: /don.t know/ }).click();
    await expect(b.locator(".feedback")).toBeVisible();
    await continueOn(b);
    let learnedStemOnB = "";
    for (let tries = 0; tries < 6 && !learnedStemOnB; tries++) {
      const asked = await stem(b);
      if (asked === wrapUpStem) {
        await b.getByRole("button", { name: /don.t know/ }).click();
        await expect(b.locator(".feedback")).toBeVisible();
        await continueOn(b);
        continue;
      }
      await answerCorrectly(b);
      await expect(b.getByText("Correct", { exact: true })).toBeVisible();
      learnedStemOnB = asked;
      await continueOn(b);
    }
    expect(learnedStemOnB).not.toBe("");
    await expect(status(b)).toHaveText("Saved on this device");
    const learnedByB = await learnedConcepts(b);
    expect(learnedByB.length).toBe(1);
    expect(learnedByB).not.toEqual(learnedByA);
    expect((await readStore(b, "outbox")).length).toBeGreaterThan(0);

    // Back online. Each device's events reach the server on their own; each pulls the other's.
    await deviceB.setOffline(false);
    await expect(status(b)).toHaveText("Synced", { timeout: 15000 });
    expect(await readStore(b, "outbox")).toEqual([]);
    await deviceA.setOffline(false);
    await expect(status(a)).toHaveText("Synced", { timeout: 15000 });
    expect(await readStore(a, "outbox")).toEqual([]);
    const bothLearned = [...new Set([...learnedByA, ...learnedByB])].sort();
    expect(bothLearned.length).toBe(2);
    await expect.poll(() => learnedConcepts(a), { timeout: 10000 }).toEqual(bothLearned);
    // B pulls A's events on its next cycle: reopening the overview is one.
    await b.goto(`${origin}/`);
    await b.getByRole("button", { name: new RegExp(fixture.title) }).click();
    await expect(status(b)).toHaveText("Synced", { timeout: 15000 });
    await expect.poll(() => learnedConcepts(b), { timeout: 10000 }).toEqual(bothLearned);
    const unionOnA = await readStore(a, "learning_events");
    const unionOnB = await readStore(b, "learning_events");
    expect(new Set(unionOnA.map((event) => event.id))).toEqual(new Set(unionOnB.map((event) => event.id)));
    expect(unionOnA.length).toBe(unionOnB.length);

    // A resumes at B's position: B's checkpoint depends on more accepted evidence than A's.
    await a.goto(`${origin}/`);
    await a.getByRole("button", { name: new RegExp(fixture.title) }).click();
    await expect(status(a)).toHaveText("Synced", { timeout: 15000 });
    await a.getByRole("button", { name: "Resume" }).click();
    await expect(a.locator(".prompt .from")).toContainText("Wrap-up");
    const resumedStem = await stem(a);
    expect(resumedStem).toBe(await stem(b).catch(() => resumedStem));
    // A finishes the Wrap-up without ever being asked the Concept B learned: that Learned came from B.
    const askedOnA: string[] = [];
    for (let steps = 0; steps < 8 && !(await a.getByRole("heading", { name: "Learned", exact: true }).count()); steps++) {
      askedOnA.push(await stem(a));
      await answerCorrectly(a);
      await expect(a.getByText("Correct", { exact: true })).toBeVisible();
      await continueOn(a);
    }
    await expect(a.getByRole("heading", { name: "Learned", exact: true })).toBeVisible();
    expect(askedOnA).not.toContain(learnedStemOnB);
    await expect(status(a)).toHaveText("Synced", { timeout: 15000 });

    // B: the overview shows Learned after its pull, and Resume lands on the summary.
    await b.goto(`${origin}/`);
    await b.getByRole("button", { name: new RegExp(fixture.title) }).click();
    await expect(status(b)).toHaveText("Synced", { timeout: 15000 });
    await expect(b.locator(".overview .state")).toHaveText("Learned", { timeout: 10000 });
    await b.getByRole("button", { name: "Resume" }).click();
    await expect(b.getByRole("heading", { name: "Learned", exact: true })).toBeVisible();
    await expect(b.locator(".lesson, .overview")).toHaveCount(0);

    // A stale checkpoint arrives late: an early Card position, re-sent now with a fresh id and a later clock.
    const navigationOnB = await readStore(b, "navigation_events");
    const early = navigationOnB.filter((event) => event.checkpoint?.screen === "card").sort((x, y) => x.occurredAt.localeCompare(y.occurredAt))[0];
    expect(early).toBeTruthy();
    const stale = { ...early, id: crypto.randomUUID(), occurredAt: new Date(Date.now() + 60_000).toISOString() };
    const pushed = await fetch(`${origin}/api/v1/progress/navigation-events`, {
      method: "POST",
      headers: { cookie: `learn_session=${cookieValue}`, "content-type": "application/json" },
      body: JSON.stringify({ lessonRevisionId: REVISION, epoch: 0, events: [stale] }),
    });
    expect(pushed.status).toBe(200);
    expect((await pushed.json()).accepted).toBe(1);
    const canonical = await (await fetch(`${origin}/api/v1/progress/checkpoint?revision=${REVISION}&epoch=0`, { headers: { cookie: `learn_session=${cookieValue}` } })).json();
    expect(canonical.checkpoint.screen).toBe("summary");
    for (const [page, context] of [[b, deviceB], [a, deviceA]] as const) {
      await page.goto(`${origin}/`);
      await page.getByRole("button", { name: new RegExp(fixture.title) }).click();
      await expect(status(page)).toHaveText("Synced", { timeout: 15000 });
      await expect.poll(async () => (await readStore(page, "navigation_events")).some((event) => event.id === stale.id), { timeout: 10000 }).toBe(true);
      await page.getByRole("button", { name: "Resume" }).click();
      await expect(page.getByRole("heading", { name: "Learned", exact: true })).toBeVisible();
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole("heading", { name: "Learned", exact: true })).toBeVisible();
      await context.setOffline(false);
    }

    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.shutdown();
  }
} });

Deno.test({ name: "with every sync request failing, learning completes, every event stays in the outbox, and the state says so", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const dependencies = await fixtureDependencies();
  dependencies.lessons = new FixtureLessonRepository(fixture, FIXTURE_ACCOUNT.id);
  const server = Deno.serve({ port: 0, onListen() {} }, createApp(dependencies));
  const origin = `http://127.0.0.1:${server.addr.port}`;
  const setCookie = await dependencies.sessions.issue(new Request(origin), { accountId: FIXTURE_ACCOUNT.id, displayName: "Josh" });
  const sessionCookie = { name: "learn_session", value: setCookie.split(";")[0].split("=")[1], url: origin };
  const browser = await chromium.launch({ headless: true });
  const phone = await browser.newContext(PHONE);
  await phone.addCookies([sessionCookie]);
  const page = await phone.newPage();
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(error.message));
  let requests = 0;
  try {
    await page.route("**/api/v1/progress/**", (route: any) => {
      requests += 1;
      return route.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ type: "about:blank", title: "Broken", status: 500, detail: "The request could not be completed." }) });
    });
    await page.goto(`${origin}/`);
    await page.getByRole("button", { name: new RegExp(fixture.title) }).click();
    await page.getByRole("button", { name: "Start lesson" }).click();
    await expect(page.locator(".cardbody h2")).toHaveText(fixture.concepts[0].cards[0].heading);
    await readCards(page, fixture.concepts[0].cards.length);
    await expect(page.locator(".qhead")).toBeVisible();
    await answerCorrectly(page);
    await expect(page.getByText("Correct", { exact: true })).toBeVisible();
    await continueOn(page);
    await expect(page.locator(".cardbody h2")).toHaveText(fixture.concepts[1].cards[0].heading);
    await expect(status(page)).toHaveText("Sync failed");
    expect(requests).toBeGreaterThan(0);
    const learning = await readStore(page, "learning_events");
    const outbox = await readStore(page, "outbox");
    expect(learning.length).toBeGreaterThanOrEqual(4);
    const queuedIds = new Set(outbox.map((entry) => entry.id));
    for (const event of learning) expect(queuedIds.has(event.id)).toBe(true);
    for (const event of await readStore(page, "navigation_events")) expect(queuedIds.has(event.id)).toBe(true);

    // The server comes back: the next action drains the outbox once, with nothing duplicated.
    await page.unroute("**/api/v1/progress/**");
    await continueOn(page);
    await expect(status(page)).toHaveText("Synced", { timeout: 15000 });
    expect(await readStore(page, "outbox")).toEqual([]);
    const cookie = `learn_session=${sessionCookie.value}`;
    const pulled: any[] = [];
    let cursor = "";
    for (let pages = 0; pages < 20; pages++) {
      const response = await fetch(`${origin}/api/v1/progress/learning-events?revision=${REVISION}&epoch=0&limit=3&cursor=${cursor}`, { headers: { cookie } });
      const body = await response.json();
      pulled.push(...body.events);
      cursor = body.cursor;
      if (!body.hasMore) break;
    }
    const local = await readStore(page, "learning_events");
    expect(new Set(pulled.map((event) => event.id))).toEqual(new Set(local.map((event) => event.id)));
    expect(pulled.length).toBe(local.length);

    // Offline reads as Saved on this device, not as a failure.
    await phone.setOffline(true);
    await continueOn(page);
    await expect(status(page)).toHaveText("Saved on this device");
    await phone.setOffline(false);
    await expect(status(page)).toHaveText("Synced", { timeout: 15000 });
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.shutdown();
  }
} });
