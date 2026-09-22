// The ticket 12 learning-loop walk as a reusable module: the full path from a fresh browser and a
// drill from a second fresh context, each recording checks into the shared audit results. The
// local audit (learning_loop_phone_test.ts) runs it against the database-free app; the production
// audit (tests/audit-prod) runs the same walk against the deployed site, where the demo lesson has
// its own server-assigned ID, so the lesson path and the page timeout are parameters.
import { expect } from "@playwright/test";
import {
  LESSON,
  VIEWPORT,
  answer,
  attachListeners,
  check,
  clearProjections,
  idk,
  keyFor,
  observe,
  projection,
  readStore,
  reloadSame,
  settle,
  signature,
  stem,
  surface,
  tap,
  tapAction,
} from "./support.ts";

export interface WalkOptions {
  /** The stable learning URL of the demo lesson on the server under test. */
  lessonPath?: string;
  /** Per-action timeout in milliseconds; a remote server needs more than a local one. */
  timeout?: number;
  /** Extra browser context options, for example mobile emulation. */
  context?: Record<string, unknown>;
  /**
   * The lesson's server-assigned id. Set this when the shelf the walk opens from may hold more
   * than this one lesson (a signed-in owner's own shelf, as opposed to a fresh or guest shelf that
   * shows only this lesson): the walk then opens by `[data-lesson]` instead of by matching the
   * fixture's title text, which is ambiguous once the shelf holds more than one lesson with that
   * title.
   */
  lessonId?: string;
}

function settings(options: WalkOptions) {
  const lessonPath = options.lessonPath ?? `/learn/${LESSON.lessonId}`;
  return { lessonPath, drillPath: `${lessonPath}/drill`, timeout: options.timeout ?? 3000, context: options.context ?? {}, lessonId: options.lessonId };
}

/** Open the lesson from the shelf: by its id when the shelf may hold more than one match for the title, otherwise by the title text. */
async function openFromShelf(page: any, lessonId: string | undefined) {
  if (lessonId) await page.locator(`[data-lesson="${lessonId}"]`).click();
  else await page.getByRole("button", { name: new RegExp(LESSON.title), exact: true }).click();
  await settle(page);
}

/** This lesson's own row on the shelf: by id when the shelf may hold more than one match for the title, otherwise the whole shelf's one `.lstatus`. */
function shelfRow(page: any, lessonId: string | undefined) {
  return lessonId ? page.locator(`[data-lesson="${lessonId}"]`) : page.locator(".lesson").filter({ hasText: LESSON.title });
}

export async function fullWalk(browser: any, ORIGIN: string, errors: string[], consoleMessages: string[], options: WalkOptions = {}) {
  const { lessonPath: LESSON_PATH, timeout, context: contextOptions, lessonId } = settings(options);
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light", ...contextOptions });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  attachListeners(page, errors, consoleMessages);

  // Shelf, fresh.
  await page.goto(`${ORIGIN}/`);
  await settle(page);
  await check("shelf · fresh browser shows the demo lesson Not started", async () => {
    const row = lessonId ? page.locator(`[data-lesson="${lessonId}"]`) : page.locator(".lesson").filter({ hasText: LESSON.title });
    await expect(row).toHaveCount(1);
    await expect(row.locator(".lstatus")).toHaveText("Not started");
    await expect(row.locator(".lname")).toHaveText(LESSON.title);
  });
  await surface(page, "shelf fresh", { screenshot: true });

  // Overview, fresh.
  await openFromShelf(page, lessonId);
  await check("overview · title, assumed knowledge, Concept count, state and Start lesson", async () => {
    await expect(page.locator(".overview h1")).toHaveText(LESSON.title);
    await expect(page.getByText(LESSON.assumedKnowledge)).toBeVisible();
    await expect(page.locator(".facts strong")).toHaveText(`${LESSON.concepts.length} concepts`);
    await expect(page.locator(".overview .state")).toHaveText("Not started");
    await expect(page.locator(".overview .actions .go").first()).toHaveText("Start lesson");
    expect(new URL(page.url()).pathname).toBe(LESSON_PATH);
  });
  await surface(page, "overview fresh", { screenshot: true });

  // First Card.
  await tap(page, "Start lesson");
  const firstCard = LESSON.concepts[0].cards[0].heading;
  await check("card · Start lesson opens Card 1 of Concept 1 at the stable learning URL", async () => {
    await expect(page.locator(".cardbody h2")).toHaveText(firstCard);
    await expect(page.locator(".cardbody .eyebrow")).toHaveText(`${LESSON.concepts[0].title} · Card 1 of ${LESSON.concepts[0].cards.length}`);
    expect(new URL(page.url()).pathname).toBe(LESSON_PATH);
    await expect(page.locator(".rail i")).toHaveCount(LESSON.concepts.length);
  });
  await surface(page, "card 1 of concept 1", { screenshot: true });

  // Square Back at the first learning step returns to the overview; reload should return to the overview.
  await tapAction(page, "back");
  await check("first step · square Back returns to the overview with Resume", async () => {
    await expect(page.locator(".overview .actions .go").first()).toHaveText("Resume");
    await expect(page.locator(".overview .state")).toHaveText("In progress");
  });
  await surface(page, "overview after Back from first Card", { screenshot: false });
  if ((await signature(page)).surface !== "overview") {
    // Recover so the walk can continue from where the learner actually is.
    await check("first step · reload after Back-to-overview shows the overview (recovering)", () => {
      throw new Error("Reload landed on " + (page.url()));
    });
  }
  // Wherever reload put us, get to the overview then resume.
  if ((await signature(page)).surface === "learn") await tapAction(page, "back");
  await tap(page, "Resume");
  await check("first step · Resume from the overview reopens Card 1", async () => {
    await expect(page.locator(".cardbody h2")).toHaveText(firstCard);
  });

  // Close at the first learning step returns to the shelf.
  await page.getByRole("button", { name: "Close lesson" }).click();
  await settle(page);
  await check("first step · close returns to the shelf showing In progress", async () => {
    await expect(shelfRow(page, lessonId).locator(".lstatus")).toHaveText("In progress");
    expect(new URL(page.url()).pathname).toBe("/");
  });
  await surface(page, "shelf in progress after close", { screenshot: false });
  await openFromShelf(page, lessonId);
  await tap(page, "Resume");

  // Browser Back at the first learning step returns to the shelf; reload must keep the shelf.
  await page.goBack();
  await settle(page);
  await check("first step · browser Back returns to the shelf", async () => {
    await expect(shelfRow(page, lessonId).locator(".lstatus")).toHaveText("In progress");
  });
  await check("first step · browser Back leaves the URL at the shelf path", () => {
    expect(new URL(page.url()).pathname).toBe("/");
  });
  await surface(page, "shelf after browser Back from first Card", { screenshot: false });
  // Recover: make sure we are on Card 1 of Concept 1 before continuing.
  if ((await signature(page)).surface !== "learn") {
    if ((await signature(page)).surface === "shelf") await openFromShelf(page, lessonId);
    await tap(page, "Resume");
  }
  await check("first step · learner is back on Card 1 after the Back probes", async () => {
    await expect(page.locator(".cardbody h2")).toHaveText(firstCard);
  });

  // Card 2 and Back inspection.
  await tap(page, "Continue");
  const secondCard = LESSON.concepts[0].cards[1].heading;
  await check("card · Continue marks Card 1 Seen exactly once and shows Card 2", async () => {
    await expect(page.locator(".cardbody h2")).toHaveText(secondCard);
    const seen = (await readStore(page, "learning_events")).filter((event) => event.type === "card_seen");
    expect(seen.map((event) => event.cardId)).toEqual([LESSON.concepts[0].cards[0].id]);
  });
  await surface(page, "card 2 of concept 1", { screenshot: false });
  const eventsBeforeInspect = (await readStore(page, "learning_events")).length;
  await tapAction(page, "back");
  await check("card · Back inspects Card 1 without recording evidence", async () => {
    await expect(page.locator(".cardbody h2")).toHaveText(firstCard);
    expect((await readStore(page, "learning_events")).length).toBe(eventsBeforeInspect);
  });
  await check("card · Back inspection does not replace the canonical checkpoint", async () => {
    expect((await projection(page, "checkpoint")).cardIndex).toBe(1);
  });
  await reloadSame(page, "inspecting Card 1 resumes at the canonical Card 2", {
    expected: (before) => ({ ...before, cardHeading: secondCard, eyebrow: before.eyebrow.replace("Card 1", "Card 2") }),
  });
  await check("card · Continue on an already Seen Card records no duplicate card_seen", async () => {
    if ((await signature(page)).cardHeading !== secondCard) {
      await tapAction(page, "back");
      await tap(page, "Continue");
    }
    const seen = (await readStore(page, "learning_events")).filter((event) => event.type === "card_seen");
    expect(seen.length).toBe(1);
    await expect(page.locator(".cardbody h2")).toHaveText(secondCard);
  });

  // Concept 1 Check: a wrong answer, the corrective detour, Return, Try another, then correct.
  await tap(page, "Continue");
  const askedInChecks = new Set<string>();
  await check("check 1 · the Check opens on an unanswered drawable Question of Concept 1", async () => {
    await expect(page.locator(".prompt .from")).toHaveText(`Concept check · ${LESSON.concepts[0].title}`);
    const key = keyFor(await stem(page));
    expect(key.concept.id).toBe(LESSON.concepts[0].id);
    expect(key.question.reserved === true).toBe(false);
  });
  await checkQuestionShape(page, "check 1 question");
  await surface(page, "check 1 unanswered Question", { screenshot: true });
  await checkDraftNotCheckpointed(page, "check 1");
  const check1First = await answer(page, false);
  askedInChecks.add(check1First);
  await checkWrongFeedback(page, "check 1 wrong", check1First, "Try another from this concept");
  await surface(page, "check 1 wrong feedback", { screenshot: true });
  await tap(page, "Review the correcting card");
  await check("check 1 · Review opens the correcting Card as a detour with Return to questions", async () => {
    await expect(page.locator(".notice")).toContainText("Correcting card");
    const headings = LESSON.concepts[0].cards.map((card: any) => card.heading);
    expect(headings).toContain(await page.locator(".cardbody h2").textContent());
    await expect(page.locator(".footer .go")).toHaveText("Return to questions");
  });
  const eventsBeforeDetour = (await readStore(page, "learning_events")).length;
  await surface(page, "check 1 corrective Card", { screenshot: true });
  const feedbackSignature = await signatureAfterReturn(page);
  await check("check 1 · Return restores the same feedback and the detour recorded no event", async () => {
    expect(feedbackSignature.verdict).toBe("Not quite");
    expect(feedbackSignature.controls).toContain("Try another from this concept");
    expect((await readStore(page, "learning_events")).length).toBe(eventsBeforeDetour);
  });
  await tap(page, "Try another from this concept");
  const check1Second = await stem(page);
  await check("check 1 · Try another asks an unseen Question from the same Concept", async () => {
    expect(check1Second).not.toBe(check1First);
    expect(askedInChecks.has(check1Second)).toBe(false);
    expect(keyFor(check1Second).concept.id).toBe(LESSON.concepts[0].id);
    const checkpoint = await projection(page, "checkpoint");
    expect(checkpoint.queue).not.toContain(keyFor(check1First).question.id);
  });
  askedInChecks.add(check1Second);
  await checkQuestionShape(page, "check 1 retry question");
  await surface(page, "check 1 retry Question", { screenshot: false });
  await answer(page, true);
  await check("check 1 · a correct answer shows Correct with the key's feedback and Continue, never auto-advancing", async () => {
    await expect(page.locator(".verdict")).toHaveText("Correct");
    await expect(page.locator(".feedback p").nth(1)).not.toBeEmpty();
    await expect(page.locator(".footer .go")).toHaveText("Continue");
    await expect(page.locator(".corrects")).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(page.locator(".verdict")).toHaveText("Correct");
  });
  await surface(page, "check 1 correct feedback", { screenshot: true });
  await tap(page, "Continue");

  // Concept 2: Cards, then I don't know.
  await check("concept 2 · Continue after the Check opens Card 1 of Concept 2", async () => {
    await expect(page.locator(".cardbody h2")).toHaveText(LESSON.concepts[1].cards[0].heading);
  });
  for (let index = 0; index < LESSON.concepts[1].cards.length; index++) await tap(page, "Continue");
  await check("check 2 · the Check opens for Concept 2", async () => {
    await expect(page.locator(".prompt .from")).toHaveText(`Concept check · ${LESSON.concepts[1].title}`);
  });
  await checkQuestionShape(page, "check 2 question");
  const progressBeforeIdk = await projection(page, "progress");
  const idkStem = await idk(page);
  askedInChecks.add(idkStem);
  await check("check 2 · I don't know shows the correct answer, a link to the correcting Card and ends the Check", async () => {
    await expect(page.locator(".verdict")).toHaveText("Recorded");
    await expect(page.locator(".feedback")).toContainText("The answer is");
    const key = keyFor(idkStem);
    await expect(page.locator(".feedback")).toContainText(key.correct);
    await expect(page.getByRole("button", { name: "Review the correcting card" })).toBeVisible();
    await expect(page.locator(".corrects")).toBeVisible();
    await expect(page.locator(".footer .go")).toHaveText("Continue");
  });
  await check("check 2 · I don't know carries no penalty: progress state is unchanged", async () => {
    expect((await projection(page, "progress")).state).toBe(progressBeforeIdk.state);
    const recorded = (await readStore(page, "learning_events")).find((event) => event.type === "question_answered" && event.questionId === keyFor(idkStem).question.id);
    expect(recorded.correct).toBe(false);
    expect(recorded.answer).toBeNull();
  });
  await surface(page, "check 2 I don't know feedback", { screenshot: true });
  await tap(page, "Continue");

  // Concept 3: Cards, then exhaust the Pool with wrong answers.
  await check("concept 3 · I don't know then Continue opens Card 1 of Concept 3", async () => {
    await expect(page.locator(".cardbody h2")).toHaveText(LESSON.concepts[2].cards[0].heading);
  });
  for (let index = 0; index < LESSON.concepts[2].cards.length; index++) await tap(page, "Continue");
  const drawable3 = LESSON.questions.filter((question: any) => question.conceptId === LESSON.concepts[2].id && question.reserved !== true).length;
  const check3Stems: string[] = [];
  for (let attempt = 1; attempt <= drawable3; attempt++) {
    await checkQuestionShape(page, `check 3 question ${attempt}`);
    const asked = await answer(page, false);
    check3Stems.push(asked);
    askedInChecks.add(asked);
    const last = attempt === drawable3;
    await checkWrongFeedback(page, `check 3 wrong ${attempt}`, asked, last ? "Continue" : "Try another from this concept");
    if (attempt === 2) await surface(page, "check 3 second wrong feedback", { screenshot: false });
    await tap(page, last ? "Continue" : "Try another from this concept");
  }
  await check("check 3 · every wrong answer was re-asked from an unseen Question until the Pool was exhausted", () => {
    expect(new Set(check3Stems).size).toBe(drawable3);
    for (const asked of check3Stems) expect(keyFor(asked).question.reserved === true).toBe(false);
  });

  // Wrap-up.
  const wrapStems: string[] = [];
  await check("wrap-up · opens with one Question drawn from the reserved Questions the Checks never showed", async () => {
    await expect(page.locator(".prompt .from")).toContainText("Wrap-up");
    const asked = await stem(page);
    expect(keyFor(asked).question.reserved).toBe(true);
    expect(askedInChecks.has(asked)).toBe(false);
    await expect(page.locator(".rail i")).toHaveCount(LESSON.concepts.length + 1);
  });
  await checkQuestionShape(page, "wrap-up question 1");
  await surface(page, "wrap-up Question 1", { screenshot: true });
  await check("wrap-up · shelf shows Seen before any Wrap-up answer, and Resume returns to the same Question", async () => {
    const asked = await stem(page);
    await page.getByRole("button", { name: "Close lesson" }).click();
    await settle(page);
    await expect(shelfRow(page, lessonId).locator(".lstatus")).toHaveText("Seen");
    await openFromShelf(page, lessonId);
    await tap(page, "Resume");
    await expect(page.locator(".qhead")).toHaveText(asked);
  });
  const wrap1 = await answer(page, false);
  wrapStems.push(wrap1);
  await check("wrap-up · a wrong answer shows feedback and Continue, and does not award Learned", async () => {
    await expect(page.locator(".verdict")).toHaveText("Not quite");
    await expect(page.locator(".footer .go")).toHaveText("Continue");
    expect(learnedIds(await projection(page, "progress"))).toEqual([]);
  });
  await surface(page, "wrap-up wrong feedback", { screenshot: true });
  await tap(page, "Continue");
  // Answer the rest of the Wrap-up correctly, recording the order the Concepts come back in.
  for (let steps = 0; steps < 6 && (await page.locator(".qhead").count()); steps++) {
    const asked = await stem(page);
    wrapStems.push(asked);
    await check(`wrap-up · Question ${wrapStems.length} is a reserved Question the Checks never showed`, () => {
      expect(keyFor(asked).question.reserved).toBe(true);
      expect(askedInChecks.has(asked)).toBe(false);
    });
    if (wrapStems.length === 2) await surface(page, "wrap-up Question 2", { screenshot: false });
    if (wrapStems.length === 3) await surface(page, "wrap-up retried or third Question", { screenshot: false });
    await answer(page, true);
    await check(`wrap-up · correct answer ${wrapStems.length} marks its Concept Learned`, async () => {
      await expect(page.locator(".verdict")).toHaveText("Correct");
      expect(learnedIds(await projection(page, "progress"))).toContain(keyFor(asked).concept.id);
    });
    if (wrapStems.length === LESSON.concepts.length + 1) await surface(page, "wrap-up final correct feedback", { screenshot: false });
    await tap(page, "Continue");
  }
  await check("wrap-up · one Question per Concept, and the missed Concept returned once more, later in a shuffled queue", () => {
    const concepts = wrapStems.map((asked) => keyFor(asked).concept.id);
    expect(wrapStems.length).toBe(LESSON.concepts.length + 1);
    expect(new Set(concepts).size).toBe(LESSON.concepts.length);
    expect(concepts.filter((id) => id === keyFor(wrap1).concept.id).length).toBe(2);
  });
  const retriedIndex = wrapStems.findIndex((asked, index) => index > 0 && keyFor(asked).concept.id === keyFor(wrap1).concept.id);
  observe("wrap-up retry", `The missed Concept came back as Wrap-up Question ${retriedIndex + 1} of ${wrapStems.length}, asked with ${wrapStems[retriedIndex] === wrap1 ? "the same" : "a different"} Question.`);
  await check("learned · the summary reads Learned and every Concept is Learned", async () => {
    await expect(page.locator(".lessonhero h1")).toHaveText("Learned");
    const progress = await projection(page, "progress");
    expect(progress.state).toBe("learned");
  });
  observe("Learned summary line", `The Learned summary shows ${JSON.stringify(await page.locator(".summary .line").allInnerTexts())}; a count, never a score.`);
  await surface(page, "Learned summary", { screenshot: true });
  await tap(page, "Back to shelf");
  await check("learned · shelf shows Learned", async () => {
    await expect(shelfRow(page, lessonId).locator(".lstatus")).toHaveText("Learned");
  });
  await surface(page, "shelf Learned", { screenshot: true });

  // A drill after Learned changes nothing either.
  const beforeDrill = await snapshot(page, lessonId);
  await openFromShelf(page, lessonId);
  await tap(page, "Every question");
  await answer(page, false);
  await tap(page, "Continue");
  await page.getByRole("button", { name: "Close drill" }).click();
  await settle(page);
  await check("drill after Learned · closing an unfinished drill leaves Resume every question on the overview", async () => {
    await expect(page.locator(".overview .actions .go.quiet")).toHaveText("Resume every question");
  });
  await tapAction(page, "shelf");
  await check("drill after Learned · learning evidence, navigation evidence and the shelf state are byte-identical", async () => {
    expect(await snapshot(page)).toEqual(beforeDrill);
  });
  await context.close();
}

export async function drillFromFresh(browser: any, ORIGIN: string, errors: string[], consoleMessages: string[], options: WalkOptions = {}) {
  const { lessonPath: LESSON_PATH, drillPath: DRILL_PATH, timeout, context: contextOptions, lessonId } = settings(options);
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: "light", ...contextOptions });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  attachListeners(page, errors, consoleMessages);
  await page.goto(`${ORIGIN}/`);
  await settle(page);
  const before = await snapshot(page, lessonId);
  await openFromShelf(page, lessonId);
  await tap(page, "Every question");
  const total = LESSON.questions.length;
  await check("drill · starts at Question 1 of every Question on the drill URL", async () => {
    await expect(page.locator(".prompt .from")).toContainText(`Every question · 1 of ${total}`);
    expect(new URL(page.url()).pathname).toBe(DRILL_PATH);
    await expect(page.locator(".rail i")).toHaveCount(LESSON.concepts.length);
  });
  await checkQuestionShape(page, "drill question 1");
  await surface(page, "drill Question 1", { screenshot: true, checkpoint: "drill_checkpoint" });
  const asked: string[] = [];
  const optionOrders = new Map<string, Set<string>>();
  for (let position = 1; position <= total; position++) {
    const text = await stem(page);
    asked.push(text);
    const key = keyFor(text);
    if (key.isMcq) {
      const order = (await page.locator(".opt").allInnerTexts()).join(" | ");
      if (!optionOrders.has(key.concept.id)) optionOrders.set(key.concept.id, new Set());
      optionOrders.get(key.concept.id)!.add(order);
    }
    const mode = position % 4 === 0 ? "idk" : position % 3 === 0 ? "wrong" : "right";
    if (mode === "idk") {
      await idk(page);
      await check(`drill · I don't know at ${position} shows the answer, the correcting Card and Continue`, async () => {
        await expect(page.locator(".verdict")).toHaveText("Recorded");
        await expect(page.locator(".feedback")).toContainText("The answer is");
        await expect(page.locator(".corrects")).toBeVisible();
        await expect(page.locator(".footer .go")).toHaveText("Continue");
      });
    } else if (mode === "wrong") {
      await answer(page, false);
      await checkWrongFeedback(page, `drill wrong at ${position}`, text, "Continue");
      if (position === 3) {
        await surface(page, "drill wrong feedback", { screenshot: true, checkpoint: "drill_checkpoint" });
        await tap(page, "Review the correcting card");
        await check("drill · Review opens the correcting Card with Return to questions", async () => {
          await expect(page.locator(".notice")).toContainText("Correcting card");
          await expect(page.locator(".footer .go")).toHaveText("Return to questions");
        });
        await surface(page, "drill corrective Card", { screenshot: true, checkpoint: "drill_checkpoint" });
        await tapAction(page, "back");
        await check("drill · square Back on the correcting Card returns to the feedback", async () => {
          await expect(page.locator(".verdict")).toHaveText("Not quite");
        });
      }
    } else {
      await answer(page, true);
      await check(`drill · correct at ${position} shows Correct and Continue`, async () => {
        await expect(page.locator(".verdict")).toHaveText("Correct");
        await expect(page.locator(".footer .go")).toHaveText("Continue");
      });
    }
    if (position === Math.floor(total / 2)) {
      await surface(page, "drill feedback halfway", { screenshot: false, checkpoint: "drill_checkpoint" });
      await tap(page, "Continue");
      await surface(page, "drill Question after halfway reload", { screenshot: false, checkpoint: "drill_checkpoint" });
      // Browser Back leaves for the overview; Resume every question returns to the same Question.
      const next = await stem(page);
      await page.goBack();
      await settle(page);
      await check("drill · browser Back returns to the overview with Resume every question", async () => {
        await expect(page.locator(".overview .actions .go.quiet")).toHaveText("Resume every question");
        expect(new URL(page.url()).pathname).toBe(LESSON_PATH);
      });
      await check("drill · overview still says Not started while a drill is open", async () => {
        await expect(page.locator(".overview .state")).toHaveText("Not started");
      });
      await tap(page, "Resume every question");
      await check("drill · resuming returns to the same unanswered Question and position", async () => {
        await expect(page.locator(".qhead")).toHaveText(next);
        await expect(page.locator(".prompt .from")).toContainText(`Every question · ${position + 1} of ${total}`);
      });
      continue;
    }
    await tap(page, "Continue");
  }
  await check("drill · every Question in every Pool was asked exactly once, reserved ones included", () => {
    expect(new Set(asked).size).toBe(total);
    for (const question of LESSON.questions) expect(asked).toContain(question.stem);
  });
  for (const [conceptId, orders] of optionOrders) {
    const title = LESSON.concepts.find((concept: any) => concept.id === conceptId).title;
    observe(`drill option order · ${title}`, `${orders.size} distinct option order(s) across this Concept's MCQs in one run.`);
  }
  await check("drill · summary lists each Concept and repeats that drill does not earn Learned, with no score or percentage", async () => {
    await expect(page.locator(".lessonhero h1")).toHaveText("Every question seen");
    await expect(page.getByText("Drill does not earn Learned.")).toBeVisible();
    await expect(page.locator(".summary.drill .line")).toHaveCount(LESSON.concepts.length);
    for (const concept of LESSON.concepts) await expect(page.locator(".summary.drill .line span").filter({ hasText: concept.title })).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/%|\bscore\b|Concepts learned/i);
  });
  await surface(page, "drill summary", { screenshot: true, checkpoint: "drill_checkpoint" });
  await tap(page, "Back to overview");
  await check("drill · leaving the summary closes the run and the overview offers Every question and Start lesson", async () => {
    await expect(page.locator(".overview .actions .go.quiet")).toHaveText("Every question");
    await expect(page.locator(".overview .actions .go").first()).toHaveText("Start lesson");
    await expect(page.locator(".overview .state")).toHaveText("Not started");
    expect(await projection(page, "drill_checkpoint")).toBeNull();
  });
  await tapAction(page, "shelf");
  await check("drill · shelf still says Not started and the learning stores never changed", async () => {
    await expect(shelfRow(page, lessonId).locator(".lstatus")).toHaveText("Not started");
    const after = await snapshot(page, lessonId);
    expect(after).toEqual(before);
    expect(after.learning).toEqual([]);
    expect(await projection(page, "checkpoint")).toBeNull();
  });
  await check("drill · the drill stream holds one answer per Question and a closing null checkpoint", async () => {
    const drill = await readStore(page, "drill_events");
    expect(drill.filter((event) => event.type === "drill_question_answered").length).toBe(total);
    expect(drill.some((event) => event.type === "drill_checkpointed" && event.checkpoint === null)).toBe(true);
  });
  await context.close();
}

/** Exactly three shared options, all from the Concept's set, an I don't know control, and a blank field. */
async function checkQuestionShape(page: any, name: string) {
  await check(`${name} · exactly three shared options, I don't know present, field blank`, async () => {
    const text = await stem(page);
    const key = keyFor(text);
    await expect(page.getByRole("button", { name: "I don't know" })).toBeVisible();
    if (key.isMcq) {
      await expect(page.locator(".opt")).toHaveCount(3);
      const shown = (await page.locator(".opt").allInnerTexts()).sort();
      expect(shown).toEqual(key.concept.options.map((option: any) => option.text).sort());
      expect(Object.keys(key.question.feedback).sort()).toEqual(key.concept.options.map((option: any) => option.id).sort());
    } else {
      await expect(page.locator("#answer")).toHaveValue("");
      await expect(page.locator(".opt")).toHaveCount(0);
    }
    await expect(page.locator(".verdict")).toHaveCount(0);
  });
}

/** An unsubmitted draft in the answer field reloads blank. */
async function checkDraftNotCheckpointed(page: any, name: string) {
  if (!(await page.locator("#answer").count())) return;
  await page.locator("#answer").fill("draft that must not survive");
  await clearProjections(page);
  await page.reload();
  await settle(page);
  await check(`${name} · an unanswered short-answer draft reloads blank`, async () => {
    await expect(page.locator("#answer")).toHaveValue("");
  });
}

/** Wrong-answer feedback: verdict, option feedback, belief for a distractor, clamped correcting Card below the action row. */
async function checkWrongFeedback(page: any, name: string, asked: string, expectedAction: string) {
  await check(`${name} · Not quite, feedback text, belief for a distractor, clamped correcting Card under the action row, ${expectedAction}`, async () => {
    const key = keyFor(asked);
    await expect(page.locator(".verdict")).toHaveText("Not quite");
    await expect(page.locator(".feedback p").nth(1)).not.toBeEmpty();
    await expect(page.locator(".footer .go")).toHaveText(expectedAction);
    await expect(page.getByRole("button", { name: "Review the correcting card" })).toBeVisible();
    await expect(page.locator(".corrects h3")).not.toBeEmpty();
    const shown = await page.locator(".corrects > p:not(.eyebrow)").allInnerTexts();
    expect(shown.length).toBe(1);
    if (key.isMcq) {
      await expect(page.locator(".belief b")).not.toBeEmpty();
      const statements = key.concept.misconceptions.map((misconception: any) => misconception.statement);
      expect(statements).toContain(await page.locator(".belief b").textContent());
    }
    const action = await page.locator(".footer .go").boundingBox();
    const aside = await page.locator(".corrects").boundingBox();
    expect(action && aside && action.y + action.height <= aside.y).toBe(true);
  });
}

async function signatureAfterReturn(page: any) {
  await tap(page, "Return to questions");
  return await signature(page);
}

function learnedIds(progress: any): string[] {
  return (progress?.conceptStates ?? []).filter((concept: any) => concept.learned).map((concept: any) => concept.id);
}

/**
 * The learning evidence and the state the shelf shows for it. Projections themselves are deleted by
 * the reload probes and rebuilt whenever a lesson is opened, so they are not part of the comparison;
 * the evidence stores and the shelf's own status line are.
 */
async function snapshot(page: any, lessonId?: string) {
  return {
    learning: await readStore(page, "learning_events"),
    navigation: await readStore(page, "navigation_events"),
    shelfStatus: (await shelfRow(page, lessonId).locator(".lstatus").first().textContent())?.trim() ?? null,
  };
}
