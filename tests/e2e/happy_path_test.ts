import { chromium, expect } from "@playwright/test";
import { app } from "../../src/app.ts";
import {
  answerCorrectly,
  clearProjections,
  openFirstCard,
  stem,
} from "./support/demo.ts";

Deno.test({
  name: "phone learner resumes and reaches Learned",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const server = Deno.serve({ port: 0, onListen() {} }, app);
    const ORIGIN = `http://127.0.0.1:${server.addr.port}`;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    page.setDefaultTimeout(2000);
    const errors: string[] = [];
    page.on("pageerror", (error: Error) => errors.push(error.message));
    try {
      await openFirstCard(page, ORIGIN);
      await page.reload();
      await expect(page.getByText("A fresh response can be reused"))
        .toBeVisible();
      let reloadedFeedback = false;
      const checkStems = new Set<string>();
      const wrapUpStems: string[] = [];
      for (
        let steps = 0;
        steps < 60 &&
        !(await page.getByText("Learned", { exact: true }).count());
        steps++
      ) {
        const continueButton = page.getByRole("button", {
          name: "Continue",
          exact: true,
        });
        if (await page.getByText("Correct", { exact: true }).count()) {
          await continueButton.click();
          await page.waitForTimeout(40);
          continue;
        }
        if (
          await continueButton.count() &&
          !(await page.locator(".qhead").count())
        ) {
          await continueButton.click();
          await page.waitForTimeout(40);
          continue;
        }
        if (!(await page.locator(".qhead").count())) {
          throw new Error(await page.locator("body").innerText());
        }
        const wrapUp =
          ((await page.locator(".prompt .from").textContent()) ?? "").includes(
            "Wrap-up",
          );
        const asked = await stem(page);
        if (wrapUp) wrapUpStems.push(asked);
        else checkStems.add(asked);
        await answerCorrectly(page);
        await expect(page.getByText("Correct", { exact: true })).toBeVisible();
        if (!reloadedFeedback) {
          await clearProjections(page);
          await page.reload();
          await expect(page.getByText("Correct", { exact: true }))
            .toBeVisible();
          reloadedFeedback = true;
        }
      }
      await expect(page.getByText("Learned").last()).toBeVisible();
      expect(checkStems.size).toBe(3);
      expect(wrapUpStems.length).toBe(3);
      for (const asked of wrapUpStems) {
        expect(checkStems.has(asked)).toBe(false);
      }
      const body = await page.locator("body").innerText();
      for (
        const banned of [
          /\bscore\b/i,
          /\bstreak\b/i,
          /\bdifficulty\b/i,
          /\bmastery\b/i,
          /\bminutes\b/i,
        ]
      ) expect(body).not.toMatch(banned);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.shutdown();
    }
  },
});
