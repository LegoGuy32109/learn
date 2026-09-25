// The plugin's pedagogy in the learning shell: a wrong option names the belief behind it and shows
// the correcting Card clamped to its first paragraph under the action row; reload restores it all.
import { assert } from "@std/assert";
import { chromium, expect } from "@playwright/test";
import { DEMO_LESSON as lesson } from "../support/demo-lesson.ts";
import { app } from "../../src/app.ts";
import {
  answerFor,
  clearProjections,
  openFirstCard,
  readCards,
  stem,
} from "./support/demo.ts";

Deno.test({
  name:
    "a wrong option shows the belief and the clamped correcting Card, and survives reload",
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
    try {
      await openFirstCard(page, ORIGIN);
      await readCards(page, 2);
      // Walk the Check until an MCQ is on screen; wrong numeric or short answers move on to the next Question.
      for (
        let attempts = 0;
        attempts < 3 && (await page.locator("#answer").count());
        attempts++
      ) {
        await page.locator("#answer").fill("wrong");
        await page.getByRole("button", { name: "Answer" }).click();
        await expect(page.locator(".corrects")).toBeVisible();
        await page.getByRole("button", {
          name: /Try another from this concept|Continue/,
        }).click();
        await expect(page.locator(".qhead")).toBeVisible();
        await page.waitForTimeout(40);
      }
      await expect(page.locator(".opt")).toHaveCount(3);
      const asked = await stem(page);
      const question = lesson.questions.find((candidate) =>
        asked.includes(answerFor(asked).fragment) && candidate.stem === asked
      );
      assert(question?.type === "mcq", `an MCQ is on screen: ${asked}`);
      const concept = lesson.concepts.find((candidate) =>
        candidate.id === question.conceptId
      );
      assert(concept, `a Concept owns ${question.id}`);
      const distractor = concept.options.find((option) =>
        option.id !== question.key
      );
      assert(distractor, `${question.id} has a distractor`);
      const misconception = concept.misconceptions.find((candidate) =>
        candidate.id === question.map[distractor.id]
      );
      assert(misconception, `${distractor.id} maps to a misconception`);
      const card = concept.cards.find((candidate) =>
        candidate.id === misconception.correctingCardId
      );
      assert(card, `the correcting Card is in ${concept.title}`);

      await page.getByRole("button", { name: distractor.text, exact: true })
        .click();
      const verify = async () => {
        await expect(page.getByText("Not quite", { exact: true }))
          .toBeVisible();
        await expect(page.locator(".feedback p").nth(1)).toHaveText(
          question.feedback[distractor.id],
        );
        await expect(page.locator(".belief")).toContainText(
          "The belief behind that option",
        );
        await expect(page.locator(".belief b")).toHaveText(
          misconception.statement,
        );
        await expect(page.locator(".corrects h3")).toHaveText(card.heading);
        const shown = await page.locator(".corrects > p:not(.eyebrow)")
          .allInnerTexts();
        expect(shown.length).toBe(1);
        expect(shown[0]).toBe(card.body[0].replace(/<[^>]+>/g, ""));
        await expect(page.locator(".corrects details summary")).toHaveText(
          "Read the rest of this card",
        );
        await expect(page.locator(".corrects details p").first()).toBeHidden();
        await expect(page.locator(".footer .go")).toHaveText(
          /^(Try another from this concept|Continue)$/,
        );
        const action = await page.locator(".footer .go").boundingBox();
        const aside = await page.locator(".corrects").boundingBox();
        expect(action && aside && action.y + action.height <= aside.y).toBe(
          true,
        );
      };
      await verify();
      await clearProjections(page);
      await page.reload();
      await verify();
      await page.locator(".corrects details summary").click();
      await expect(page.locator(".corrects details p").first()).toBeVisible();
      await expect(page.locator(".corrects details p")).toHaveCount(
        card.body.length - 1,
      );
      const retry = (await page.locator(".footer .go").textContent()) ===
        "Try another from this concept";
      await page.locator(".footer .go").click();
      if (retry) {
        await expect(page.locator(".qhead")).toBeVisible();
        expect(await stem(page)).not.toBe(asked);
      } else {
        await expect(page.locator(".cardbody h2")).toHaveText(
          "Validators name a version",
        );
      }
    } finally {
      await browser.close();
      await server.shutdown();
    }
  },
});
