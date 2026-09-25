// Independent helpers for the phone-viewport audit. Nothing here is shared with the implementers'
// e2e suite: the answer key is derived from the fixture itself, and every reload deletes the
// derived projections first so the position has to come back from the event streams.
import { expect } from "@playwright/test";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with {
  type: "json",
};

export const VIEWPORT = { width: 390, height: 844 };
export let LESSON = lesson as any;
export const LESSON_PATH = `/learn/${LESSON.lessonId}`;
export const DRILL_PATH = `${LESSON_PATH}/drill`;
let screenshotDirectory = new URL("./screenshots/", import.meta.url).pathname;

/**
 * Point every shared helper (fullWalk, drillFromFresh, keyFor, answer, idk, stem...) at a
 * different lesson document, by ES module live binding: everything that reads `LESSON` reads it at
 * call time, so this takes effect for code that has not run yet, wherever it imported `LESSON`
 * from. The golden-flow audit calls this with the content the server actually stored for its own
 * freshly-titled submission (a fresh title changes the fingerprint, so every run gets its own
 * Lesson Revision with no progress), so the walk and its answer key derive from whatever that run
 * actually submitted rather than from a fixed literal. Local suites never call this and keep
 * walking the bundled fixture; `LESSON_PATH`/`DRILL_PATH` above stay pointed at it too, since only
 * a local suite (never a `useLesson` caller) reads them.
 */
export function useLesson(nextLesson: any) {
  LESSON = nextLesson;
}

/** Where `schemes` writes its screenshots. The production audit points this at its own directory. */
export function setScreenshotDirectory(path: string) {
  screenshotDirectory = path.endsWith("/") ? path : `${path}/`;
}

export function screenshotDirectoryPath(): string {
  return screenshotDirectory;
}

export interface Result {
  name: string;
  ok: boolean;
  detail?: string;
  /** What proves the outcome: a status line, a header, a screenshot path. Printed for passes and failures. */
  evidence?: string;
}

export interface Observation {
  name: string;
  detail: string;
}

export const results: Result[] = [];
export const observations: Observation[] = [];

/**
 * Run one named check; a failure is recorded, not thrown, so the walk continues. The check may
 * return a string of evidence, which the report prints next to the pass or fail line.
 */
export async function check(
  name: string,
  fn: () => Promise<void | string> | void | string,
): Promise<boolean> {
  try {
    const evidence = await fn();
    results.push({
      name,
      ok: true,
      evidence: typeof evidence === "string" ? evidence : undefined,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name,
      ok: false,
      detail: message.split("\n").filter((line) => line.trim()).slice(0, 8)
        .join("\n"),
    });
    return false;
  }
}

export function observe(name: string, detail: string) {
  observations.push({ name, detail });
}

/** The Question with this stem, its Concept, and the correct and one wrong answer for it. */
export function keyFor(stem: string) {
  const question = LESSON.questions.find((candidate: any) =>
    candidate.stem === stem
  );
  if (!question) throw new Error(`Unknown stem: ${stem}`);
  const concept = LESSON.concepts.find((candidate: any) =>
    candidate.id === question.conceptId
  );
  const keyOption = concept.options.find((option: any) =>
    option.id === question.key
  );
  const wrongOption = concept.options.find((option: any) =>
    option.id !== question.key
  );
  return {
    question,
    concept,
    correct: question.type === "mcq" ? keyOption.text : String(question.answer),
    wrong: question.type === "mcq" ? wrongOption.text : "wrong answer",
    isMcq: question.type === "mcq",
  };
}

export async function settle(page: any) {
  await page.waitForTimeout(80);
  await page.waitForFunction(() =>
    (document.querySelector("#app")?.textContent ?? "").trim().length > 0
  );
}

/**
 * A locator's text once it stops changing: poll every 300ms, up to `timeout`ms, and return once it
 * has read the same value four times running (at least ~900ms quiet). A freshly opened surface on a
 * brand new browser context renders once from IndexedDB alone (empty) and again once the background
 * sync pull merges in whatever progress the account already has on the server, exactly as ticket 10
 * documents; the pull itself only starts after `kick()`'s own debounce (`KICK_DELAY_MS` in
 * src/client/sync/client.js, 150ms), so two reads a mere 200ms apart can both land inside that
 * initial quiet gap and agree before the real change ever begins. Four in a row makes that far less
 * likely without hard-coding the debounce constant here. Not needed after an assertion against a
 * known literal, which Playwright's own `expect(...).toHaveText(...)` already retries; this is for
 * capturing a "before" value the caller does not know in advance.
 */
export async function stableText(
  locator: any,
  timeout = 15000,
): Promise<string> {
  const deadline = Date.now() + timeout;
  let previous: string | null = null;
  let matches = 0;
  while (Date.now() < deadline) {
    const current = ((await locator.textContent()) ?? "").trim();
    if (current === previous) {
      matches += 1;
      if (matches >= 4) return current;
    } else {
      matches = 0;
    }
    previous = current;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return previous ?? "";
}

export async function tap(page: any, name: string | RegExp, exact = true) {
  await page.getByRole("button", { name, exact }).click();
  await settle(page);
}

export async function tapAction(page: any, action: string) {
  await page.locator(`[data-action="${action}"]`).first().click();
  await settle(page);
}

export async function stem(page: any): Promise<string> {
  return (await page.locator(".qhead").textContent()) ?? "";
}

export async function answer(page: any, correct: boolean): Promise<string> {
  const text = await stem(page);
  const key = keyFor(text);
  const value = correct ? key.correct : key.wrong;
  if (key.isMcq) {
    await page.getByRole("button", { name: value, exact: true }).click();
  } else {
    await page.locator("#answer").fill(value);
    await page.getByRole("button", { name: "Answer", exact: true }).click();
  }
  await settle(page);
  return text;
}

export async function idk(page: any): Promise<string> {
  const text = await stem(page);
  await tap(page, "I don't know");
  return text;
}

/** Everything a learner could notice about the surface, for a before/after reload comparison. */
export async function signature(page: any) {
  return await page.evaluate(() => {
    const text = (selector: string) =>
      (document.querySelector(selector)?.textContent ?? "").trim() || null;
    const all = (selector: string) =>
      [...document.querySelectorAll(selector)].map((element) =>
        (element.textContent ?? "").trim()
      );
    const surface = document.querySelector(".shell.drill")
      ? "drill"
      : document.querySelector(".shell")
      ? "learn"
      : document.querySelector(".overview")
      ? "overview"
      : document.querySelector(".shelf")
      ? "shelf"
      : "blank";
    const field = document.querySelector("#answer") as HTMLInputElement | null;
    return {
      url: location.pathname,
      surface,
      eyebrow: text(".eyebrow"),
      heading: text("h1") ?? text("h2"),
      cardHeading: text(".cardbody h2"),
      notice: text(".notice"),
      from: text(".prompt .from"),
      stem: text(".qhead"),
      options: all(".opt"),
      hint: text(".hintline"),
      fieldPresent: field !== null,
      fieldValue: field?.value ?? null,
      verdict: text(".verdict"),
      feedback: all(".feedback p").slice(1).join(" ") || null,
      belief: text(".belief b"),
      corrects: text(".corrects h3"),
      correctsFirst: text(".corrects > p:not(.eyebrow)"),
      controls: all(
        ".footer .go, .footer .idk, .footer .back, .actions .go, .source, .close",
      ),
      rail: [...document.querySelectorAll(".rail i b")].map((bar) =>
        (bar as HTMLElement).style.width
      ),
      status: text(".lstatus") ?? text(".overview .state"),
      summaryLines: all(".summary .line"),
      startLabel: text(".overview .actions .go:not(.quiet)"),
      drillLabel: text(".overview .actions .go.quiet"),
    };
  });
}

export async function readStore(page: any, store: string): Promise<any[]> {
  return await page.evaluate(
    (name: string) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("learn-local-v1");
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(name)) return resolve([]);
          const read = db.transaction(name, "readonly").objectStore(name)
            .getAll();
          read.onsuccess = () => resolve(read.result);
          read.onerror = () => reject(read.error);
        };
        request.onerror = () => reject(request.error);
      }),
    store,
  );
}

/**
 * A projection by its name. Since ticket 08 projections are keyed `<name>:<revision>:<epoch>`, so
 * the name alone matches the one record for the lesson this context opened; the bare id is still
 * accepted for the older layout.
 */
export async function projection(page: any, id: string): Promise<any> {
  const records = await readStore(page, "projections");
  const record = records.find((candidate) => candidate.id === id) ??
    records.find((candidate) => String(candidate.id).startsWith(`${id}:`));
  return record?.value ?? null;
}

export async function clearProjections(page: any) {
  await page.evaluate(() =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open("learn-local-v1");
      request.onsuccess = () => {
        const transaction = request.result.transaction(
          "projections",
          "readwrite",
        );
        transaction.objectStore("projections").clear();
        transaction.oncomplete = () => resolve(undefined);
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    })
  );
}

/** The resume-relevant part of a checkpoint: what must come back identically after a reload. */
function resumeFields(checkpoint: any) {
  if (!checkpoint) return null;
  const {
    screen,
    flowKind,
    conceptIndex,
    cardIndex,
    seed,
    attemptId,
    queue,
    feedback,
    detour,
    wrapTotal,
    runId,
    total,
  } = checkpoint;
  return {
    screen,
    flowKind,
    conceptIndex,
    cardIndex,
    seed,
    attemptId,
    queue,
    feedback,
    detour,
    wrapTotal,
    runId,
    total,
  };
}

/**
 * Delete every projection, reload, and assert the surface and the rebuilt checkpoint are the
 * same as before. `expectedAfter` overrides the expected signature for surfaces whose reload
 * position is documented to differ (Back inspection does not move the canonical checkpoint).
 */
export async function reloadSame(
  page: any,
  name: string,
  options: { checkpoint?: string; expected?: (before: any) => any } = {},
) {
  const before = await signature(page);
  const checkpointId = options.checkpoint ?? "checkpoint";
  const checkpointBefore = resumeFields(await projection(page, checkpointId));
  await clearProjections(page);
  await page.reload();
  await settle(page);
  const after = await signature(page);
  const checkpointAfter = resumeFields(await projection(page, checkpointId));
  const expected = options.expected ? options.expected(before) : before;
  await check(`reload · ${name} · surface comes back`, () => {
    expect(after).toEqual(expected);
  });
  // The shelf has no open lesson, so nothing rebuilds a checkpoint there until a lesson is opened.
  if (before.surface !== "shelf") {
    await check(`reload · ${name} · checkpoint rebuilt from events`, () => {
      expect(checkpointAfter).toEqual(checkpointBefore);
    });
  }
  return { before, after };
}

const FORBIDDEN_WORDS = [
  /\bscores?\b/i,
  /\bstreaks?\b/i,
  /\bdifficulty\b/i,
  /\bmaster(y|ed|ing)?\b/i,
  /\bestimated?\b/i,
  /\b\d+\s*(min|mins|minutes?|hours?|hrs?)\b/i,
  /\bpartial credit\b/i,
];

/** Forbidden words and metrics are absent from the whole DOM, not just the visible text. */
export async function forbidden(page: any, name: string) {
  const { html, text } = await page.evaluate(() => ({
    html: document.querySelector("#app")?.outerHTML ?? "",
    text: (document.querySelector("#app") as HTMLElement | null)?.innerText ??
      "",
  }));
  await check(
    `forbidden · ${name} · no score, streak, difficulty, mastery or time estimate in the DOM`,
    () => {
      for (const pattern of FORBIDDEN_WORDS) {
        const match = html.match(pattern);
        if (match) {
          throw new Error(
            `${pattern} matched ${JSON.stringify(match[0])} in ${name}`,
          );
        }
      }
      expect(text).not.toMatch(/%/);
    },
  );
  await check(`vocabulary · ${name} · says Question, not Item`, () => {
    expect(text).not.toMatch(/\bitems?\b/i);
  });
}

/** Controls at least 44px on the shortest side, no horizontal overflow, I don't know off the edge, no blank panel. */
export async function visual(page: any, name: string) {
  const report = await page.evaluate(() => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 &&
        style.visibility !== "hidden" && style.display !== "none";
    };
    const controls = [
      ...document.querySelectorAll("button, input, summary, a[href]"),
    ].filter(visible);
    const small = controls
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label:
            (element.getAttribute("aria-label") ?? element.textContent ?? "")
              .trim().slice(0, 40),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        };
      })
      .filter((box) => Math.min(box.w, box.h) < 44);
    const idk = document.querySelector(".idk")?.getBoundingClientRect() ?? null;
    const app = document.querySelector("#app") as HTMLElement;
    const container = document.querySelector(".shell, .page") as
      | HTMLElement
      | null;
    let safeArea = false;
    if (container) {
      for (const sheet of [...document.styleSheets]) {
        let rules: CSSRule[] = [];
        try {
          rules = [...sheet.cssRules];
        } catch {
          rules = [];
        }
        for (const rule of rules) {
          const style = rule as CSSStyleRule;
          if (!style.selectorText) continue;
          const matches = style.selectorText.split(",").some((selector) => {
            try {
              return container.matches(selector.trim());
            } catch {
              return false;
            }
          });
          if (
            matches &&
            /safe-area-inset-bottom/.test(
              style.style.paddingBottom || style.style.padding || "",
            )
          ) safeArea = true;
        }
      }
    }
    return {
      small,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      idk: idk
        ? {
          left: Math.round(idk.left),
          right: Math.round(idk.right),
          width: Math.round(idk.width),
        }
        : null,
      blank: app.innerText.trim().length === 0,
      container: container?.className ?? null,
      safeArea,
    };
  });
  await check(`visual · ${name} · panel is not blank`, () => {
    expect(report.blank).toBe(false);
  });
  await check(
    `visual · ${name} · every control is at least 44px on its shortest side`,
    () => {
      expect(report.small).toEqual([]);
    },
  );
  await check(`visual · ${name} · no horizontal overflow at 390px`, () => {
    expect(report.scrollWidth).toBeLessThanOrEqual(report.innerWidth);
    expect(report.bodyScrollWidth).toBeLessThanOrEqual(report.innerWidth);
  });
  if (report.idk) {
    await check(
      `visual · ${name} · I don't know is contained away from the screen edge`,
      () => {
        expect(report.idk!.left).toBeGreaterThanOrEqual(24);
        expect(report.idk!.right).toBeLessThanOrEqual(report.innerWidth - 24);
      },
    );
  }
  await check(
    `visual · ${name} · bottom safe-area padding on ${report.container}`,
    () => {
      expect(report.safeArea).toBe(true);
    },
  );
}

let shot = 0;

/** Screenshot the surface in both schemes; assert the scheme actually changes the page colours. */
export async function schemes(page: any, name: string) {
  shot += 1;
  const prefix = `${String(shot).padStart(2, "0")}-${
    name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
  }`;
  const colours: Record<string, string> = {};
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(30);
    colours[scheme] = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    await page.screenshot({
      path: `${screenshotDirectory}${prefix}-${scheme}.jpg`,
      type: "jpeg",
      quality: 55,
      fullPage: true,
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
  await check(
    `scheme · ${name} · light and dark render different backgrounds`,
    () => {
      expect(colours.light).not.toBe(colours.dark);
    },
  );
  return prefix;
}

/** The full battery every distinct surface gets. */
export async function surface(
  page: any,
  name: string,
  options: {
    screenshot?: boolean;
    reload?: boolean;
    checkpoint?: string;
    expected?: (before: any) => any;
  } = {},
) {
  await forbidden(page, name);
  await visual(page, name);
  if (options.screenshot) await schemes(page, name);
  if (options.reload !== false) {
    await reloadSame(page, name, {
      checkpoint: options.checkpoint,
      expected: options.expected,
    });
  }
}

export function attachListeners(
  page: any,
  errors: string[],
  consoleMessages: string[],
) {
  page.on(
    "pageerror",
    (error: Error) => errors.push(`pageerror: ${error.message}`),
  );
  page.on("console", (message: any) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  });
}

export function report(title: string) {
  const passed = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const lines = [
    `## ${title}`,
    "",
    `${passed.length} passed, ${failed.length} failed, ${observations.length} observations`,
    "",
  ];
  if (failed.length) {
    lines.push("### Failed", "");
    for (const result of failed) {
      lines.push(
        `- ${result.name}`,
        "  ```",
        ...(result.detail ?? "").split("\n").map((line) => `  ${line}`),
        "  ```",
      );
    }
    lines.push("");
  }
  if (observations.length) {
    lines.push("### Observations", "");
    for (const observation of observations) {
      lines.push(`- ${observation.name}: ${observation.detail}`);
    }
    lines.push("");
  }
  lines.push("### Passed", "");
  for (const result of passed) {
    lines.push(
      result.evidence
        ? `- ${result.name}\n  ${result.evidence.replaceAll("\n", "\n  ")}`
        : `- ${result.name}`,
    );
  }
  return lines.join("\n");
}
