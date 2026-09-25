// Ticket 12 audit: targeted attempts to break the learning-loop contract on a phone viewport.
// Each probe runs in a fresh browser context. Failing checks are collected into the report and
// the test fails at the end when any check failed.
import {
  type BrowserContext,
  chromium,
  expect,
  type Page,
} from "@playwright/test";
import type {
  CardSeen,
  DrillAnswered,
} from "../../src/shared/learning/types.d.ts";
import { app } from "../../src/app.ts";
import { advanceWrapUp } from "../../src/shared/learning/transitions.js";
import { cardsFlow, startCheck } from "../../src/client/learning/flow.js";
import { questionView } from "../../src/client/learning/views.js";
import {
  answer,
  attachListeners,
  check,
  clearProjections,
  DRILL_PATH,
  keyFor,
  LESSON,
  LESSON_PATH,
  observe,
  projection,
  readStore,
  report,
  results,
  settle,
  type Signature,
  signature,
  stem,
  tap,
  tapAction,
  VIEWPORT,
} from "./support.ts";

const REPORT_PATH = new URL("./last-probes.md", import.meta.url).pathname;

Deno.test({
  name: "audit: adversarial probes on a phone viewport",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const server = Deno.serve({ port: 0, onListen() {} }, app);
    const ORIGIN = `http://127.0.0.1:${server.addr.port}`;
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    const consoleMessages: string[] = [];
    const fresh = async () => {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        colorScheme: "light",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(3000);
      attachListeners(page, errors, consoleMessages);
      await page.goto(`${ORIGIN}/`);
      await settle(page);
      return { page, context };
    };
    try {
      await doubleTapContinueOnCard(fresh);
      await doubleTapAfterFeedback(fresh);
      await enterKeySubmits(fresh);
      await emptyAnswerSubmit(fresh);
      await deadBackControls(fresh);
      await browserBackMidLesson(fresh);
      await reloadAtOverviewAfterLearned(fresh);
      await wrapUpRequeueIsLater();
      await optionOrderPerQuestion();
      await check("listeners · no pageerror during the probes", () => {
        expect(errors).toEqual([]);
      });
      await check(
        "listeners · no console error or warning during the probes",
        () => {
          expect(consoleMessages).toEqual([]);
        },
      );
    } finally {
      await browser.close();
      await server.shutdown();
      const text = report("Adversarial probes");
      await Deno.writeTextFile(REPORT_PATH, text + "\n");
      console.log("\n" + text + "\n");
    }
    const failed = results.filter((result) => !result.ok);
    if (failed.length) {
      throw new Error(
        `${failed.length} probe checks failed; see ${REPORT_PATH}`,
      );
    }
  },
});

type Fresh = () => Promise<{ page: Page; context: BrowserContext }>;

async function openFirstCard(page: Page) {
  await tap(page, new RegExp(LESSON.title));
  await tap(page, /Start lesson|Resume/, false);
  await expect(page.locator(".cardbody h2")).toHaveText(
    LESSON.concepts[0].cards[0].heading,
  );
}

/** Two taps that land before the first re-render, as a phone double-tap does. */
async function doubleTap(page: Page, selector: string) {
  await page.evaluate((target: string) => {
    const button = document.querySelector(target) as HTMLElement;
    button.click();
    button.click();
  }, selector);
  await page.waitForTimeout(300);
  await settle(page);
}

async function doubleTapContinueOnCard(fresh: Fresh) {
  const { page, context } = await fresh();
  await openFirstCard(page);
  await doubleTap(page, '[data-action="continue"]');
  await check(
    "double-tap · Continue on Card 1 advances one Card and marks only Card 1 Seen",
    async () => {
      const seen = (await readStore(page, "learning_events")).filter((
        event,
      ): event is CardSeen => event.type === "card_seen").map((event) =>
        event.cardId
      );
      const shown = await signature(page);
      expect(shown.cardHeading).toBe(LESSON.concepts[0].cards[1].heading);
      expect(seen).toEqual([LESSON.concepts[0].cards[0].id]);
    },
  );
  await context.close();
}

async function doubleTapAfterFeedback(fresh: Fresh) {
  const { page, context } = await fresh();
  await openFirstCard(page);
  for (let index = 0; index < LESSON.concepts[0].cards.length; index++) {
    await tap(page, "Continue");
  }
  await expect(page.locator(".qhead")).toBeVisible();
  const asked = await answer(page, false);
  await expect(page.locator(".footer .go")).toHaveText(
    "Try another from this concept",
  );
  const before = await projection(page, "checkpoint");
  await doubleTap(page, '[data-action="advance"]');
  await check(
    "double-tap · Try another after feedback moves to exactly the next unseen Question",
    async () => {
      const after = await projection(page, "checkpoint");
      const shown = await signature(page);
      expect(shown.surface).toBe("learn");
      expect(shown.stem).not.toBeNull();
      expect(shown.stem).not.toBe(asked);
      expect(after?.screen).toBe("question");
      expect(after?.flowKind).toBe("check");
      expect(after?.queue.length).toBe((before?.queue.length ?? 0) - 1);
    },
  );
  await context.close();
}

async function enterKeySubmits(fresh: Fresh) {
  const { page, context } = await fresh();
  await tap(page, new RegExp(LESSON.title));
  await tap(page, "Every question");
  // Walk the drill until a typed Question is on screen.
  for (
    let steps = 0;
    steps < LESSON.questions.length && !(await page.locator("#answer").count());
    steps++
  ) {
    await answer(page, true);
    await tap(page, "Continue");
  }
  await expect(page.locator("#answer")).toBeVisible();
  const key = keyFor(await stem(page));
  await page.locator("#answer").fill(key.correct);
  await page.locator("#answer").press("Enter");
  await page.waitForTimeout(300);
  await check(
    "keyboard · Enter in the answer field submits the answer, as the plugin renderer does",
    async () => {
      await expect(page.locator(".verdict")).toHaveText("Correct");
    },
  );
  await context.close();
}

async function emptyAnswerSubmit(fresh: Fresh) {
  const { page, context } = await fresh();
  await tap(page, new RegExp(LESSON.title));
  await tap(page, "Every question");
  for (
    let steps = 0;
    steps < LESSON.questions.length && !(await page.locator("#answer").count());
    steps++
  ) {
    await answer(page, true);
    await tap(page, "Continue");
  }
  await expect(page.locator("#answer")).toBeVisible();
  const asked = await stem(page);
  await tap(page, "Answer");
  const shown = await signature(page);
  const last = (await readStore(page, "drill_events")).filter((
    event,
  ): event is DrillAnswered => event.type === "drill_question_answered").at(-1);
  observe(
    "empty answer",
    shown.verdict
      ? `Tapping Answer with a blank field on ${
        JSON.stringify(asked.slice(0, 40))
      } is graded ${shown.verdict} and recorded as answer ${
        JSON.stringify(last?.answer)
      }; the plugin renderer grades a blank field the same way.`
      : "Tapping Answer with a blank field does nothing.",
  );
  await context.close();
}

async function deadBackControls(fresh: Fresh) {
  const { page, context } = await fresh();
  await openFirstCard(page);
  for (let index = 0; index < LESSON.concepts[0].cards.length; index++) {
    await tap(page, "Continue");
  }
  await expect(page.locator(".qhead")).toBeVisible();

  const unchanged = async (name: string) => {
    const before = await signature(page);
    await tapAction(page, "back");
    const after = await signature(page);
    await check(
      `back · ${name} · the square Back control does something when a prior surface exists`,
      () => {
        expect(after).not.toEqual(before);
      },
    );
    return { before, after };
  };

  // Documented behaviour (ticket 21): Back on a Question or on a Concept's first Card looks back at
  // the last Card of the Concept before it, and Continue on that Card returns to where the look-back
  // started without reversing progress. Back on a correcting Card returns to the Question.
  const lookedBack = async (name: string, conceptIndex: number) => {
    const { before, after } = await unchanged(name);
    const concept = LESSON.concepts[conceptIndex];
    await check(
      `back · ${name} · Back looks back at the last Card of ${concept.title}`,
      () => {
        expect(after.surface).toBe("learn");
        expect(after.cardHeading).toBe(concept.cards.at(-1)?.heading);
        expect(after.controls).toContain("Continue");
      },
    );
    await tap(page, "Continue");
    await check(
      `back · ${name} · Continue on the looked-back Card returns to where Back was tapped`,
      async () => {
        expect(await signature(page)).toEqual(before);
      },
    );
  };

  await lookedBack("unanswered Concept Check Question", 0);
  await answer(page, false);
  await expect(page.locator(".verdict")).toHaveText("Not quite");
  await lookedBack("wrong-answer feedback", 0);
  await tap(page, "Review the correcting card");
  await expect(page.locator(".notice")).toBeVisible();
  const { after: afterCorrective } = await unchanged(
    "correcting Card in the learning shell",
  );
  await check(
    "back · correcting Card · Back returns to the Question it interrupted, as it does in drill",
    () => {
      expect(afterCorrective.verdict).toBe("Not quite");
    },
  );
  if (afterCorrective.notice) await tap(page, "Return to questions");
  await tap(page, /Try another from this concept|Continue/, false);
  // Reach the first Card of Concept 2 by answering correctly (or exhausting).
  for (
    let steps = 0;
    steps < 4 && (await page.locator(".qhead").count());
    steps++
  ) {
    await answer(page, true);
    await tap(page, "Continue");
  }
  await expect(page.locator(".cardbody h2")).toHaveText(
    LESSON.concepts[1].cards[0].heading,
  );
  await lookedBack("first Card of Concept 2", 0);
  await check(
    "back · first Card of Concept 2 · looking back recorded no evidence and did not move the checkpoint",
    async () => {
      const seen = (await readStore(page, "learning_events")).filter((event) =>
        event.type === "card_seen"
      );
      expect(seen.length).toBe(LESSON.concepts[0].cards.length);
      const checkpoint = await projection(page, "checkpoint");
      expect(checkpoint?.screen).toBe("card");
      expect(checkpoint?.conceptIndex).toBe(1);
      expect(checkpoint?.cardIndex).toBe(0);
      expect(checkpoint?.detour).toBeNull();
    },
  );
  await context.close();
}

async function browserBackMidLesson(fresh: Fresh) {
  const { page, context } = await fresh();
  await openFirstCard(page);
  await tap(page, "Continue");
  await expect(page.locator(".cardbody h2")).toHaveText(
    LESSON.concepts[0].cards[1].heading,
  );
  const pathFor = (
    shown: Signature,
  ) => (shown.surface === "shelf"
    ? "/"
    : shown.surface === "drill"
    ? DRILL_PATH
    : LESSON_PATH);
  await page.goBack();
  await settle(page);
  const one = await signature(page);
  // The learning shell takes over the overview's history entry (ticket 17), so a second Back can
  // leave the app for whatever came before it. That is the browser's history, not a surface; step
  // forward again and judge the app's own entries.
  await page.goBack();
  const leftApp = page.url().startsWith("about:");
  if (leftApp) await page.goForward();
  await settle(page);
  const two = await signature(page);
  await clearProjections(page);
  await page.reload();
  await settle(page);
  const reloaded = await signature(page);
  observe(
    "browser Back mid-lesson",
    `From Card 2, one browser Back shows ${one.surface} at ${one.url}; a second ${
      leftApp ? "leaves the app" : `shows ${two.surface} at ${two.url}`
    }; reloading then shows ${reloaded.surface} at ${reloaded.url}.`,
  );
  await check(
    "browser Back mid-lesson · the URL always names the surface on screen",
    () => {
      expect(one.url).toBe(pathFor(one));
      expect(two.url).toBe(pathFor(two));
      expect(reloaded.surface).toBe(two.surface);
      expect(reloaded.url).toBe(two.url);
    },
  );
  await context.close();
}

async function reloadAtOverviewAfterLearned(fresh: Fresh) {
  const { page, context } = await fresh();
  await openFirstCard(page);
  // Fast path to Learned: read every Card, answer every Question correctly.
  for (
    let steps = 0;
    steps < 60 && !(await page.locator(".lessonhero h1").count());
    steps++
  ) {
    if (await page.locator(".qhead").count()) await answer(page, true);
    else await tap(page, "Continue");
    if (await page.locator(".verdict").count()) await tap(page, "Continue");
  }
  await expect(page.locator(".lessonhero h1")).toHaveText("Learned");
  await tap(page, "Back to shelf");
  await expect(page.locator(".lstatus")).toHaveText("Learned");
  await tap(page, new RegExp(LESSON.title));
  const overview = await signature(page);
  observe(
    "overview after Learned",
    `The overview of a Learned lesson offers ${
      JSON.stringify(overview.startLabel)
    }.`,
  );
  await clearProjections(page);
  await page.reload();
  await settle(page);
  const reloaded = await signature(page);
  await check(
    "reload · overview of a Learned lesson comes back as the overview",
    () => {
      expect(reloaded.surface).toBe("overview");
      expect(reloaded.startLabel).toBe(overview.startLabel);
    },
  );
  await context.close();
}

/** Pure rule: a missed Wrap-up Concept returns later, after the remaining Concepts, never immediately. */
async function wrapUpRequeueIsLater() {
  const immediate: number[] = [];
  for (let seed = 0; seed < 200; seed++) {
    const next = advanceWrapUp({
      queue: ["missed", "b", "c"],
      correct: false,
      seed,
    });
    if (next.queue[0] === "missed") immediate.push(seed);
  }
  await check(
    "wrap-up · a missed Concept is never re-asked immediately (200 seeds, three Concepts)",
    () => {
      expect(immediate).toEqual([]);
    },
  );
  observe(
    "wrap-up requeue",
    `${immediate.length} of 200 seeds re-ask the missed Concept as the very next Question; e.g. seeds ${
      immediate.slice(0, 5).join(", ")
    }.`,
  );
}

/** Pure rule: option display order should be shuffled per Question, not one permutation per attempt. */
async function optionOrderPerQuestion() {
  const concept = LESSON.concepts[0];
  const flow = startCheck(LESSON, cardsFlow(0), {
    seed: 7,
    attemptId: "attempt",
  });
  const mcqs = LESSON.questions.filter((question) =>
    question.conceptId === concept.id && question.type === "mcq"
  );
  const orders = new Set(
    mcqs.map((question) => {
      const html = questionView(concept, question, flow);
      return [...html.matchAll(/data-answer="([^"]+)"/g)].map((match) =>
        match[1]
      ).join(",");
    }),
  );
  await check(
    "options · MCQs in one Concept Check attempt do not all share one option permutation",
    () => {
      expect(mcqs.length).toBeGreaterThan(1);
      expect(orders.size).toBeGreaterThan(1);
    },
  );
}
