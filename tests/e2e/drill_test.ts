// Drill mode on a phone viewport: every Question once, feedback with belief and correcting Card,
// a reload halfway that resumes the same Question, a summary that lists each Concept, and a shelf
// and learning checkpoint that are exactly as they were before the drill.
import { chromium, expect } from "@playwright/test";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with { type: "json" };
import { app } from "../../src/app.ts";
import { answerCorrectly, answerFor, answerWrong, clearProjections, stem } from "./support/demo.ts";

interface Snapshot {
  learning: unknown[];
  navigation: unknown[];
  checkpoint: unknown;
  progress: unknown;
}

async function readStore(page: any, store: string): Promise<unknown[]> {
  return await page.evaluate((name: string) => new Promise((resolve, reject) => {
    const request = indexedDB.open("learn-local-v1");
    request.onsuccess = () => {
      const read = request.result.transaction(name, "readonly").objectStore(name).getAll();
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    };
    request.onerror = () => reject(request.error);
  }), store);
}

async function snapshot(page: any): Promise<Snapshot> {
  const projections = await readStore(page, "projections") as any[];
  const find = (id: string) => projections.find((record) => record.id === id)?.value ?? null;
  return {
    learning: await readStore(page, "learning_events"),
    navigation: await readStore(page, "navigation_events"),
    checkpoint: find("checkpoint"),
    progress: find("progress"),
  };
}

Deno.test({ name: "drill asks every Question, resumes after a reload, and leaves the shelf Not started", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const server = Deno.serve({ port: 0, onListen() {} }, app);
  const ORIGIN = `http://127.0.0.1:${server.addr.port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(2000);
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(error.message));
  try {
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator(".lstatus")).toHaveText("Not started");
    const before = await snapshot(page);
    expect(before.learning).toEqual([]);
    expect(before.navigation).toEqual([]);
    expect(before.checkpoint).toBeNull();

    await page.getByRole("button", { name: /How browser HTTP caching works/ }).click();
    await expect(page.getByText("Drill does not earn Learned.")).toBeVisible();
    await page.getByRole("button", { name: "Every question", exact: true }).click();
    await expect(page.locator(".prompt .from")).toContainText("Every question · 1 of 12");
    expect(new URL(page.url()).pathname).toBe(`/learn/${lesson.lessonId}/drill`);

    const asked: string[] = [];
    let sawBelief = false;
    for (let position = 1; position <= lesson.questions.length; position++) {
      await expect(page.locator(".prompt .from")).toContainText(`Every question · ${position} of ${lesson.questions.length}`);
      const text = await stem(page);
      asked.push(text);
      const wrong = position % 3 === 0;
      if (wrong) {
        await answerWrong(page);
        await expect(page.getByText("Not quite", { exact: true })).toBeVisible();
        await expect(page.locator(".corrects h3")).toBeVisible();
        if (answerFor(text).option) {
          await expect(page.locator(".belief b")).not.toBeEmpty();
          sawBelief = true;
        }
      } else {
        await answerCorrectly(page);
        await expect(page.getByText("Correct", { exact: true })).toBeVisible();
      }
      await expect(page.locator(".footer .go")).toHaveText("Continue");
      if (position === 6) {
        // Reload halfway, with every projection deleted, and land on the same feedback for the same Question.
        const corrects = await page.locator(".corrects h3").textContent();
        await clearProjections(page);
        await page.reload();
        await expect(page.locator(".footer .go")).toHaveText("Continue");
        await expect(page.getByText("Not quite", { exact: true })).toBeVisible();
        await expect(page.locator(".corrects h3")).toHaveText(corrects ?? "");
        expect(new URL(page.url()).pathname).toBe(`/learn/${lesson.lessonId}/drill`);
        await page.locator(".footer .go").click();
        await page.waitForTimeout(40);
        // The unanswered next Question also survives a reload with the same stem.
        const next = await stem(page);
        await clearProjections(page);
        await page.reload();
        await expect(page.locator(".qhead")).toHaveText(next);
        await expect(page.locator(".prompt .from")).toContainText(`Every question · ${position + 1} of ${lesson.questions.length}`);
        continue;
      }
      await page.locator(".footer .go").click();
      await page.waitForTimeout(40);
    }
    expect(sawBelief).toBe(true);
    expect(new Set(asked).size).toBe(lesson.questions.length);
    for (const question of lesson.questions) expect(asked).toContain(question.stem);

    await expect(page.getByRole("heading", { name: "Every question seen" })).toBeVisible();
    await expect(page.getByText("Drill does not earn Learned.")).toBeVisible();
    for (const concept of lesson.concepts) await expect(page.locator(".summary.drill .line span").filter({ hasText: concept.title })).toBeVisible();
    await expect(page.locator(".summary.drill .line")).toHaveCount(lesson.concepts.length);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\bscore\b|%/i);
    expect(body).not.toMatch(/Concepts learned/);

    await page.getByRole("button", { name: "Back to overview" }).click();
    await expect(page.getByRole("button", { name: "Start lesson" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Every question", exact: true })).toBeVisible();
    await expect(page.locator(".overview .state")).toHaveText("Not started");
    await page.getByRole("button", { name: "Back to shelf" }).click();
    await expect(page.locator(".lstatus")).toHaveText("Not started");

    const after = await snapshot(page);
    expect(after.learning).toEqual(before.learning);
    expect(after.navigation).toEqual(before.navigation);
    expect(after.checkpoint).toEqual(before.checkpoint);
    expect(after.progress).toEqual(before.progress);
    const drill = await readStore(page, "drill_events") as any[];
    expect(drill.filter((event) => event.type === "drill_question_answered").length).toBe(lesson.questions.length);
    expect(drill.some((event) => event.type === "drill_checkpointed" && event.checkpoint === null)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await server.shutdown();
  }
} });
