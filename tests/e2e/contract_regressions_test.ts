import { chromium, expect } from "@playwright/test";
import { app } from "../../src/app.ts";

async function firstCard(page: any) {
  await page.goto("http://127.0.0.1:8002/");
  await page.getByRole("button", { name: /How browser HTTP caching works/ }).click();
  await page.getByRole("button", { name: "Start lesson" }).click();
}

async function answerWrong(page: any): Promise<string> {
  const stem = (await page.locator(".qhead").textContent()) ?? "";
  if (await page.locator(".opt").count()) {
    const correct = stem.includes("fresh response") ? "Reuse it without contacting the origin." : stem.includes("ETag") ? "If-None-Match" : "Do not store the response.";
    await page.locator(".opt").filter({ hasNotText: correct }).first().click();
  } else {
    await page.locator("#answer").fill("wrong");
    await page.getByRole("button", { name: "Answer" }).click();
  }
  await page.waitForTimeout(60);
  return stem;
}

Deno.test({ name: "resume, corrective routing, and I don't know obey the flow contract", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const server = Deno.serve({ port: 8002 }, app);
  const browser = await chromium.launch({ headless: true });
  try {
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await firstCard(page);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".cardbody h2")).toHaveText("Age measures stored time");
      await page.getByRole("button", { name: "Close lesson" }).click();
      await page.getByRole("button", { name: /How browser HTTP caching works/ }).click();
      await page.getByRole("button", { name: "Resume" }).click();
      await expect(page.locator(".cardbody h2")).toHaveText("Age measures stored time");
      await page.close();
    }

    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await firstCard(page);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      for (let index = 0; index < 3; index++) {
        const stem = await answerWrong(page);
        const expected = stem.includes("fresh response") ? "A fresh response can be reused" : "Age measures stored time";
        await page.getByRole("button", { name: "Review the correcting card" }).click();
        await expect(page.locator(".cardbody h2")).toHaveText(expected);
        await page.getByRole("button", { name: "Return to questions" }).click();
        await page.getByRole("button", { name: "Try another from this concept" }).click();
        await page.waitForTimeout(60);
      }
      await expect(page.locator(".cardbody h2")).toHaveText("Validators name a version");
      await page.close();
    }

    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await firstCard(page);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "I don't know" }).click();
      await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".cardbody h2")).toHaveText("Validators name a version");
      await page.close();
    }
  } finally {
    await browser.close();
    await server.shutdown();
  }
} });

