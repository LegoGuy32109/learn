import { chromium, expect } from "@playwright/test";
import { app } from "../../src/app.ts";
import { answerWrong, openFirstCard, readCards } from "./support/demo.ts";

Deno.test({ name: "resume, corrective routing, and I don't know obey the flow contract", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const server = Deno.serve({ port: 0, onListen() {} }, app);
  const ORIGIN = `http://127.0.0.1:${server.addr.port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await openFirstCard(page, ORIGIN);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".cardbody h2")).toHaveText("Age measures stored time");
      await expect(page.locator(".cardbody p:not(.eyebrow)")).toHaveCount(3);
      await page.getByRole("button", { name: "Close lesson" }).click();
      await page.getByRole("button", { name: /How browser HTTP caching works/ }).click();
      await page.getByRole("button", { name: "Resume" }).click();
      await expect(page.locator(".cardbody h2")).toHaveText("Age measures stored time");
      await page.close();
    }

    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await openFirstCard(page, ORIGIN);
      await readCards(page, 2);
      const conceptHeadings = ["A fresh response can be reused", "Age measures stored time"];
      for (let index = 0; index < 3; index++) {
        await answerWrong(page);
        await page.getByRole("button", { name: "Review the correcting card" }).click();
        const heading = (await page.locator(".cardbody h2").textContent()) ?? "";
        expect(conceptHeadings).toContain(heading);
        await page.getByRole("button", { name: "Return to questions" }).click();
        const label = index < 2 ? "Try another from this concept" : "Continue";
        await page.getByRole("button", { name: label, exact: true }).click();
        await page.waitForTimeout(40);
      }
      await expect(page.locator(".cardbody h2")).toHaveText("Validators name a version");
      await page.close();
    }

    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await openFirstCard(page, ORIGIN);
      await readCards(page, 2);
      await page.getByRole("button", { name: "I don't know" }).click();
      await expect(page.getByText("The answer is")).toBeVisible();
      await expect(page.locator(".corrects")).toBeVisible();
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
