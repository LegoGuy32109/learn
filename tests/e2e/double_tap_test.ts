// Ticket 20: a phone double tap lands a second click before the first action's re-render replaces
// the DOM. Every learning and drill action must have the effect of one tap. The probe dispatches two
// synchronous clicks, as a double tap does, on the feedback action and on Continue.
import { chromium, expect } from "@playwright/test";
import { app } from "../../src/app.ts";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { answerWrong, openFirstCard, readCards, stem } from "./support/demo.ts";

async function doubleTap(page: any, selector: string) {
  await page.evaluate((target: string) => {
    const button = document.querySelector(target) as HTMLElement;
    button.click();
    button.click();
  }, selector);
  await page.waitForTimeout(300);
}

async function checkpoint(page: any): Promise<any> {
  return await page.evaluate(() =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open("learn-local-v1");
      request.onsuccess = () => {
        const read = request.result.transaction("projections", "readonly").objectStore("projections").getAll();
        read.onsuccess = () => resolve(read.result.find((record: any) => String(record.id).startsWith("checkpoint:"))?.value ?? null);
        read.onerror = () => reject(read.error);
      };
      request.onerror = () => reject(request.error);
    }));
}

async function cardsSeen(page: any): Promise<string[]> {
  return await page.evaluate(() =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open("learn-local-v1");
      request.onsuccess = () => {
        const read = request.result.transaction("learning_events", "readonly").objectStore("learning_events").getAll();
        read.onsuccess = () => resolve(read.result.filter((event: any) => event.type === "card_seen").map((event: any) => event.cardId));
        read.onerror = () => reject(read.error);
      };
      request.onerror = () => reject(request.error);
    }));
}

Deno.test({ name: "two taps within one render cycle have the effect of one tap", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const server = Deno.serve({ port: 0, onListen() {} }, app);
  const ORIGIN = `http://127.0.0.1:${server.addr.port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(2000);
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(error.message));
  try {
    await openFirstCard(page, ORIGIN);

    // Continue on Card 1: one Card forward, one card_seen.
    await doubleTap(page, '[data-action="continue"]');
    await expect(page.locator(".cardbody h2")).toHaveText(lesson.concepts[0].cards[1].heading);
    expect(await cardsSeen(page)).toEqual([lesson.concepts[0].cards[0].id]);

    // Try another from this concept after a wrong answer: the queue shrinks by exactly one.
    await readCards(page, lesson.concepts[0].cards.length - 1);
    await expect(page.locator(".qhead")).toBeVisible();
    const asked = await answerWrong(page);
    await expect(page.getByRole("button", { name: "Try another from this concept" })).toBeVisible();
    const before = await checkpoint(page);
    await doubleTap(page, '[data-action="advance"]');
    const after = await checkpoint(page);
    expect(after.screen).toBe("question");
    expect(after.flowKind).toBe("check");
    expect(after.feedback).toBeNull();
    expect(after.queue.length).toBe(before.queue.length - 1);
    expect(await stem(page)).not.toBe(asked);

    // A double tap on an option records one answer.
    if (await page.locator(".opt").count()) {
      await doubleTap(page, ".opt");
      const answered = await page.evaluate(() =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("learn-local-v1");
          request.onsuccess = () => {
            const read = request.result.transaction("learning_events", "readonly").objectStore("learning_events").getAll();
            read.onsuccess = () => resolve(read.result.filter((event: any) => event.type === "question_answered").length);
            read.onerror = () => reject(read.error);
          };
          request.onerror = () => reject(request.error);
        }));
      expect(answered).toBe(2);
      await expect(page.locator(".verdict")).toBeVisible();
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.shutdown();
  }
} });
