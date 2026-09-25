// Cross-device sync, adversarially verified: every scenario in issues/15-verify-cross-device-sync.md
// driven by two or three isolated Playwright contexts signed in as one account, against a real HTTP
// server backed by one ephemeral `learn-test-<uuid>` Turso database. Every scenario inspects the raw
// database rows after acting, not just the API's own account of itself. The database is created once
// for the whole suite and destroyed in `finally`, including on failure. Each scenario uses its own
// Lesson (same fixture content, a distinct title so `createLesson` does not dedupe by fingerprint), so
// scenarios cannot contaminate each other's streams.
//
// This is a verification suite: it never fixes anything it finds. A confirmed defect is filed by hand
// as a new ticket file under issues/.
import type { StoreName, Stores } from "../support/stores.ts";
import { type Browser, chromium, expect, type Page } from "@playwright/test";
import type { Client } from "../../src/server/db.ts";
import { assert, assertEquals } from "@std/assert";
import {
  authoredLesson,
  DEMO_LESSON as fixture,
} from "../support/demo-lesson.ts";
import { resolveLesson } from "../../src/shared/authoring/resolver.js";
import {
  frontierCount,
  selectCheckpoint,
} from "../../src/shared/learning/sync.js";
import { createApp } from "../../src/app.ts";
import { TursoLessonRepository } from "../../src/server/repositories/lessons.ts";
import { TursoProgressRepository } from "../../src/server/repositories/progress.ts";
import { redactBearerTokens } from "../../src/server/identity/redaction.ts";
import { tursoDependencies } from "../db/support/dependencies.ts";
import {
  createAccount,
  createEphemeralDatabase,
} from "../db/support/ephemeral.ts";
import { answerCorrectly, readCards, stem } from "../e2e/support/demo.ts";

const PHONE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};

/** The `screen` of a checkpoint the server stored as opaque JSON, or null. */
function screenOf(checkpoint: unknown): unknown {
  return typeof checkpoint === "object" && checkpoint !== null &&
      "screen" in checkpoint
    ? checkpoint.screen
    : null;
}

/** What `GET /api/v1/progress/checkpoint` answers. */
interface ServedCheckpoint {
  checkpoint:
    | ({ screen?: string; marker?: string } & Record<string, unknown>)
    | null;
  frontier: number;
  learningEvents: number;
}

/** A fresh Lesson owned by `accountId`: the fixture's content with a scenario-unique title, so the
 * server's fingerprint dedupe never folds two scenarios' lessons together. */
async function freshLesson(db: Client, accountId: string, suffix: string) {
  const title = `${fixture.title} (${suffix})`;
  const resolved = await resolveLesson(authoredLesson(title));
  assert(resolved.valid, `fixture with title "${title}" failed to resolve`);
  const stored = await new TursoLessonRepository(db).createLesson(
    accountId,
    resolved,
  );
  // `GET /` always inlines the featured (newest published) lesson for its first paint, even for a
  // signed-in account visiting the shelf, so at least one published revision must exist or every page
  // load 500s. This mirrors what `scripts/seed-demo.ts` does for a real deployment.
  await db.execute({
    sql:
      "UPDATE lesson_revisions SET status = 'published', published_at = ? WHERE id = ?",
    args: [Date.now(), stored.revisionId],
  });
  return stored;
}

/** A second revision of an existing Lesson, so its shelf entry gets a new `latestRevisionId`. */
async function nextRevision(
  db: Client,
  accountId: string,
  lessonId: string,
  suffix: string,
) {
  const title = `${fixture.title} (${suffix})`;
  const resolved = await resolveLesson(authoredLesson(title));
  assert(resolved.valid, `fixture with title "${title}" failed to resolve`);
  return await new TursoLessonRepository(db).createRevision(
    accountId,
    lessonId,
    resolved,
  );
}

async function readStore<S extends StoreName>(
  page: Page,
  store: S,
): Promise<Stores[S][]> {
  return await page.evaluate(
    (name: string) =>
      new Promise<Stores[S][]>((resolve, reject) => {
        const request = indexedDB.open("learn-local-v1");
        request.onsuccess = () => {
          const all = request.result.transaction(name, "readonly").objectStore(
            name,
          ).getAll();
          all.onsuccess = () => resolve(all.result);
          all.onerror = () => reject(all.error);
        };
        request.onerror = () => reject(request.error);
      }),
    store,
  );
}

function status(page: Page) {
  return page.locator("#sync-status");
}

async function continueOn(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForTimeout(40);
}

/** Read every Card and pass every Check, arriving at the first Wrap-up Question. */
async function reachWrapUp(page: Page) {
  for (const concept of fixture.concepts) {
    await expect(page.locator(".cardbody h2")).toHaveText(
      concept.cards[0].heading,
    );
    await readCards(page, concept.cards.length);
    await expect(page.locator(".qhead")).toBeVisible();
    await answerCorrectly(page);
    await expect(page.getByText("Correct", { exact: true })).toBeVisible();
    await continueOn(page);
  }
  await expect(page.locator(".prompt .from")).toContainText("Wrap-up");
}

/** From the first Wrap-up Question, answer every Wrap-up Question correctly to the Learned summary. */
async function finishWrapUp(page: Page) {
  for (
    let steps = 0;
    steps < 10 &&
    !(await page.getByRole("heading", { name: "Learned", exact: true })
      .count());
    steps++
  ) {
    await answerCorrectly(page);
    await expect(page.getByText("Correct", { exact: true })).toBeVisible();
    await continueOn(page);
  }
  await expect(page.getByRole("heading", { name: "Learned", exact: true }))
    .toBeVisible();
}

/** Open the lesson from the shelf by its title fragment, then Start (or Resume). */
async function openLesson(page: Page, origin: string, title: string) {
  await page.goto(`${origin}/`);
  await page.getByRole("button", { name: new RegExp(escapeRegExp(title)) })
    .click();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Click whichever the overview offers: progress is shared across every device on the same account,
 * so a device that opens after another device on the same account has already recorded a
 * `lesson_started` event sees "Resume", not "Start lesson", once its merge lands. */
async function startOrResume(page: Page) {
  await expect(
    page.getByRole("button", { name: "Start lesson" }).or(
      page.getByRole("button", { name: "Resume" }),
    ),
  ).toBeVisible();
  const resume = page.getByRole("button", { name: "Resume" });
  if (await resume.count()) await resume.click();
  else await page.getByRole("button", { name: "Start lesson" }).click();
}

/** Click a named button, dumping the overview/shell text on failure so a timeout is diagnosable. */
async function click(
  page: Page,
  name: string,
  options: Record<string, unknown> = {},
) {
  try {
    await page.getByRole("button", { name, ...options }).click();
  } catch (error) {
    const body = await page.locator("body").innerText().catch(() =>
      "<unreadable>"
    );
    console.error(`click("${name}") failed. Page text:\n${body}`);
    throw error;
  }
}

Deno.test({
  name:
    "cross-device sync, verified adversarially against an ephemeral database",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const ephemeral = await createEphemeralDatabase();
    console.log(`ephemeral database created: ${ephemeral.name}`);
    const { db } = ephemeral;
    let browser: Browser | null = null;
    let server: Deno.HttpServer | null = null;
    try {
      const clock = () => Date.now();
      const accountId = await createAccount(db, "Josh Hale");
      const dependencies = tursoDependencies(db, clock);
      server = Deno.serve({ port: 0, onListen() {} }, createApp(dependencies));
      const origin = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
      const setCookie = await dependencies.sessions.issue(new Request(origin), {
        accountId,
        displayName: "Josh Hale",
      });
      const cookieValue = setCookie.split(";")[0].split("=")[1];
      const sessionCookie = {
        name: "learn_session",
        value: cookieValue,
        url: origin,
      };
      const cookieHeader = { cookie: `learn_session=${cookieValue}` };

      const phone = await chromium.launch({ headless: true });
      browser = phone;

      const newDevice = async () => {
        const context = await phone.newContext(PHONE);
        await context.addCookies([sessionCookie]);
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        const errors: string[] = [];
        page.on("pageerror", (error: Error) => errors.push(error.message));
        return { context, page, errors };
      };

      const progressRepo = new TursoProgressRepository(db);

      /** Raw row counts and the served checkpoint for one Lesson Revision and epoch, straight from the DB. */
      const inspect = async (revisionId: string, epoch = 0) => {
        const learningRows = await db.execute({
          sql:
            "SELECT id, epoch FROM progress_events WHERE account_id = ? AND lesson_revision_id = ? AND epoch = ?",
          args: [accountId, revisionId, epoch],
        });
        const navigationRows = await db.execute({
          sql:
            "SELECT id, epoch FROM navigation_events WHERE account_id = ? AND lesson_revision_id = ? AND epoch = ?",
          args: [accountId, revisionId, epoch],
        });
        const navigation = (await progressRepo.all(accountId, "navigation", {
          lessonRevisionId: revisionId,
          epoch,
        })).map((row) => row.event);
        const learning = (await progressRepo.all(accountId, "learning", {
          lessonRevisionId: revisionId,
          epoch,
        })).map((row) => row.event);
        const checkpoint = selectCheckpoint(navigation, learning);
        return {
          learningCount: learningRows.rows.length,
          navigationCount: navigationRows.rows.length,
          learningIds: learningRows.rows.map((row) => String(row.id)),
          navigationIds: navigationRows.rows.map((row) => String(row.id)),
          navigation,
          learning,
          checkpoint,
        };
      };

      // ---------------------------------------------------------------------------------------------
      await t.step(
        "1. A learns online, B resumes at A's exact Card, then at A's exact submitted feedback screen",
        async () => {
          const lesson = await freshLesson(db, accountId, "scenario 1");
          const title = lesson.content.title;
          const a = await newDevice();
          const b = await newDevice();
          try {
            await openLesson(a.page, origin, title);
            await a.page.getByRole("button", { name: "Start lesson" }).click();
            // A reads the first Card only (not the second), a mid-Concept checkpoint.
            await expect(a.page.locator(".cardbody h2")).toHaveText(
              fixture.concepts[0].cards[0].heading,
            );
            await continueOn(a.page);
            await expect(a.page.locator(".cardbody h2")).toHaveText(
              fixture.concepts[0].cards[1].heading,
            );
            await expect(status(a.page)).toHaveText("Synced", {
              timeout: 25000,
            });

            // B opens fresh and resumes: it must land on A's exact second Card, not the first.
            await openLesson(b.page, origin, title);
            await expect(status(b.page)).toHaveText("Synced", {
              timeout: 25000,
            });
            await b.page.getByRole("button", { name: "Resume" }).click();
            await expect(b.page.locator(".cardbody h2")).toHaveText(
              fixture.concepts[0].cards[1].heading,
            );

            // A continues into the Question and submits an answer: this is a checkpoint with feedback attached.
            await continueOn(a.page);
            await expect(a.page.locator(".qhead")).toBeVisible();
            await answerCorrectly(a.page);
            await expect(a.page.getByText("Correct", { exact: true }))
              .toBeVisible();
            await expect(status(a.page)).toHaveText("Synced", {
              timeout: 25000,
            });

            // B reopens: it must resume showing A's exact submitted feedback screen. Once a checkpoint
            // carries feedback, `views.js` renders the feedback view INSTEAD of the question head — `.qhead`
            // is gone from the DOM at that point — so the feedback text itself is the thing to check.
            await openLesson(b.page, origin, title);
            await expect(status(b.page)).toHaveText("Synced", {
              timeout: 25000,
            });
            await click(b.page, "Resume");
            await expect(b.page.getByText("Correct", { exact: true }))
              .toBeVisible({ timeout: 15000 });

            const row = await inspect(lesson.revisionId);
            const localLearning = await readStore(a.page, "learning_events");
            const localNavigation = await readStore(
              a.page,
              "navigation_events",
            );
            assertEquals(
              row.learningCount,
              localLearning.length,
              "the server holds exactly the learning events A generated: lesson_started, two card_seen, one question_answered",
            );
            assertEquals(
              row.navigationCount,
              localNavigation.length,
              "the server holds exactly A's checkpoints: on Start, after each Continue, and after the submitted answer",
            );
            expect(a.errors).toEqual([]);
            expect(b.errors).toEqual([]);
          } finally {
            await a.context.close();
            await b.context.close();
          }
        },
      );

      // ---------------------------------------------------------------------------------------------
      for (const order of ["A then B", "B then A"] as const) {
        await t.step(
          `2. A and B both offline complete different Concepts, reconnect ${order}`,
          async () => {
            const lesson = await freshLesson(
              db,
              accountId,
              `scenario 2 ${order}`,
            );
            const title = lesson.content.title;
            const a = await newDevice();
            const b = await newDevice();
            try {
              // Both open the lesson online first, so both cache it, then go offline.
              await openLesson(a.page, origin, title);
              await a.page.getByRole("button", { name: "Start lesson" })
                .click();
              await expect(status(a.page)).toHaveText("Synced", {
                timeout: 25000,
              });
              await openLesson(b.page, origin, title);
              await expect(status(b.page)).toHaveText("Synced", {
                timeout: 25000,
              });
              await startOrResume(b.page);
              await expect(status(b.page)).toHaveText("Synced", {
                timeout: 25000,
              });

              await a.context.setOffline(true);
              await b.context.setOffline(true);

              // A completes Concept 1 (index 0). B skips to Concept 2 (index 1) by reading its cards directly
              // — the flow lets a Card be visited without the earlier Concept's Check being passed, but here we
              // just drive A and B through DIFFERENT Concepts' Cards and Checks so their Learned sets differ.
              await expect(a.page.locator(".cardbody h2")).toHaveText(
                fixture.concepts[0].cards[0].heading,
              );
              await readCards(a.page, fixture.concepts[0].cards.length);
              await answerCorrectly(a.page);
              await expect(a.page.getByText("Correct", { exact: true }))
                .toBeVisible();
              await continueOn(a.page);
              await expect(status(a.page)).toHaveText("Saved on this device");

              await expect(b.page.locator(".cardbody h2")).toHaveText(
                fixture.concepts[0].cards[0].heading,
              );
              await readCards(b.page, fixture.concepts[0].cards.length);
              await answerCorrectly(b.page);
              await expect(b.page.getByText("Correct", { exact: true }))
                .toBeVisible();
              await continueOn(b.page);
              await readCards(b.page, fixture.concepts[1].cards.length);
              await answerCorrectly(b.page);
              await expect(b.page.getByText("Correct", { exact: true }))
                .toBeVisible();
              await continueOn(b.page);
              await expect(status(b.page)).toHaveText("Saved on this device");

              const outboxA = (await readStore(a.page, "outbox")).length;
              const outboxB = (await readStore(b.page, "outbox")).length;
              expect(outboxA).toBeGreaterThan(0);
              expect(outboxB).toBeGreaterThan(0);

              const devices = order === "A then B" ? [a, b] : [b, a];
              for (const device of devices) {
                await device.context.setOffline(false);
                await expect(status(device.page)).toHaveText("Synced", {
                  timeout: 25000,
                });
              }

              const row = await inspect(lesson.revisionId);
              assertEquals(
                row.learningCount,
                new Set([
                  ...(await readStore(a.page, "learning_events")).map((e) =>
                    e.id
                  ),
                  ...(await readStore(b.page, "learning_events")).map((e) =>
                    e.id
                  ),
                ]).size,
                "the server's union has every learning event exactly once",
              );
              assertEquals(
                new Set(row.learningIds).size,
                row.learningCount,
                "no learning event is duplicated in progress_events",
              );

              // Each device pulls the other's events on its next cycle.
              for (const device of [a, b]) {
                await openLesson(device.page, origin, title);
                await expect(status(device.page)).toHaveText("Synced", {
                  timeout: 25000,
                });
              }
              for (const device of [a, b]) {
                const events = await readStore(device.page, "learning_events");
                const ids = new Set(events.map((e) => e.id));
                expect(ids.size).toBe(row.learningCount);
              }
              expect(a.errors).toEqual([]);
              expect(b.errors).toEqual([]);
            } finally {
              await a.context.close();
              await b.context.close();
            }
          },
        );
      }

      // ---------------------------------------------------------------------------------------------
      await t.step(
        "3. A and B both offline answer the same Wrap-up Question differently; Learned is never lost and the checkpoint follows the larger frontier, with a deterministic tie breaker",
        async () => {
          const lesson = await freshLesson(db, accountId, "scenario 3");
          const title = lesson.content.title;
          const a = await newDevice();
          const b = await newDevice();
          try {
            await openLesson(a.page, origin, title);
            await a.page.getByRole("button", { name: "Start lesson" }).click();
            await reachWrapUp(a.page);
            const askedStem = await stem(a.page);
            await expect(status(a.page)).toHaveText("Synced", {
              timeout: 25000,
            });

            await openLesson(b.page, origin, title);
            await expect(status(b.page)).toHaveText("Synced", {
              timeout: 25000,
            });
            await click(b.page, "Resume");
            await expect(b.page.locator(".qhead")).toHaveText(askedStem);

            await a.context.setOffline(true);
            await b.context.setOffline(true);
            // A answers correctly; B answers the same Wrap-up Question wrong.
            await answerCorrectly(a.page);
            await expect(a.page.getByText("Correct", { exact: true }))
              .toBeVisible();
            await continueOn(a.page);
            await b.page.locator(".opt, #answer").first().isVisible().catch(
              () => {},
            );
            const wrongAnswered = await (async () => {
              const optCount = await b.page.locator(".opt").count();
              if (optCount > 0) {
                await b.page.locator(".opt").last().click();
              } else {
                await b.page.locator("#answer").fill("definitely wrong");
                await b.page.getByRole("button", { name: "Answer" }).click();
              }
              await b.page.waitForTimeout(40);
              return true;
            })();
            assert(wrongAnswered);
            await expect(b.page.locator(".feedback")).toBeVisible();
            await continueOn(b.page);

            const learningBefore = await Promise.all([
              readStore(a.page, "learning_events"),
              readStore(b.page, "learning_events"),
            ]);
            expect(learningBefore[0].length).toBeGreaterThan(0);
            expect(learningBefore[1].length).toBeGreaterThan(0);

            await a.context.setOffline(false);
            await expect(status(a.page)).toHaveText("Synced", {
              timeout: 25000,
            });
            await b.context.setOffline(false);
            await expect(status(b.page)).toHaveText("Synced", {
              timeout: 25000,
            });

            const merged = await inspect(lesson.revisionId);
            assertEquals(
              merged.learningCount,
              new Set([
                ...learningBefore[0].map((e) => e.id),
                ...learningBefore[1].map((e) => e.id),
              ]).size,
              "both answers to the same Question are kept, Learned never lost",
            );

            // Construct an equal-frontier tie: two checkpoints over the SAME accepted learning events, one
            // with an earlier occurredAt and a lower event id, one with a later occurredAt (or, when the
            // clocks tie too, a greater event id). The server must deterministically prefer the later one.
            const ids = merged.learning.map((event) => event.id);
            const checkpointed = (
              marker: string,
              occurredAt: string,
              id: string,
            ) => ({
              id,
              type: "navigation_checkpointed",
              lessonRevisionId: lesson.revisionId,
              epoch: 0,
              occurredAt,
              checkpoint: {
                screen: "summary",
                conceptIndex: 0,
                cardIndex: 0,
                flowKind: "wrap_up",
                seed: 0,
                attemptId: "",
                queue: [],
                feedback: null,
                detour: null,
                marker,
                learningEventFrontier: ids,
              },
            });
            const low = checkpointed(
              "tie-low",
              "2026-09-22T09:00:00.000Z",
              "00000000-0000-4000-8000-00000000000a",
            );
            const high = checkpointed(
              "tie-high",
              "2026-09-22T09:00:00.000Z",
              "ffffffff-ffff-4fff-bfff-ffffffffffff",
            );
            const pushed = await fetch(
              `${origin}/api/v1/progress/navigation-events`,
              {
                method: "POST",
                headers: {
                  ...cookieHeader,
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  lessonRevisionId: lesson.revisionId,
                  epoch: 0,
                  events: [low, high],
                }),
              },
            );
            assertEquals(pushed.status, 200);
            await pushed.body?.cancel();
            const served = await (await fetch(
              `${origin}/api/v1/progress/checkpoint?revision=${lesson.revisionId}&epoch=0`,
              { headers: cookieHeader },
            )).json();
            assertEquals(
              served.checkpoint.marker,
              "tie-high",
              "equal frontiers and equal clocks break the tie by the greater event id",
            );

            const raw = await inspect(lesson.revisionId);
            assertEquals(
              selectCheckpoint(raw.navigation, raw.learning),
              served.checkpoint,
              "replaying the raw rows through the shared rule reproduces the served checkpoint",
            );
            expect(a.errors).toEqual([]);
            expect(b.errors).toEqual([]);
          } finally {
            await a.context.close();
            await b.context.close();
          }
        },
      );

      // ---------------------------------------------------------------------------------------------
      await t.step(
        "4. A discards progress; B, offline with old-epoch events, reconnects and is rejected, not resurrected",
        async () => {
          const lesson = await freshLesson(db, accountId, "scenario 4");
          const title = lesson.content.title;
          const a = await newDevice();
          const b = await newDevice();
          try {
            await openLesson(a.page, origin, title);
            await a.page.getByRole("button", { name: "Start lesson" }).click();
            await expect(a.page.locator(".cardbody h2")).toHaveText(
              fixture.concepts[0].cards[0].heading,
            );
            await readCards(a.page, fixture.concepts[0].cards.length);
            await expect(a.page.locator(".qhead")).toBeVisible();
            await answerCorrectly(a.page);
            await expect(a.page.getByText("Correct", { exact: true }))
              .toBeVisible();
            await continueOn(a.page);
            await expect(status(a.page)).toHaveText("Synced", {
              timeout: 25000,
            });

            await openLesson(b.page, origin, title);
            await expect(status(b.page)).toHaveText("Synced", {
              timeout: 25000,
            });
            await b.context.setOffline(true);
            await click(b.page, "Resume");
            await readCards(b.page, fixture.concepts[1].cards.length);
            await expect(b.page.locator(".qhead")).toBeVisible();
            await answerCorrectly(b.page);
            await expect(b.page.getByText("Correct", { exact: true }))
              .toBeVisible();
            await continueOn(b.page);
            await expect(status(b.page)).toHaveText("Saved on this device");
            const bOutbox = (await readStore(b.page, "outbox")).length;
            expect(bOutbox).toBeGreaterThan(0);

            const revision2 = await nextRevision(
              db,
              accountId,
              lesson.lessonId,
              "scenario 4, revision 2",
            );

            // A refetches the shelf (a fresh navigation, not client routing) and sees Outdated.
            await openLesson(a.page, origin, title);
            await expect(status(a.page)).toHaveText("Synced", {
              timeout: 25000,
            });
            await expect(a.page.locator(".status.outdated")).toHaveText(
              "Outdated",
            );
            await a.page.getByRole("button", {
              name: "Discard progress and start the new revision",
            }).click();
            await a.page.getByRole("button", {
              name: "Discard and start the new revision",
              exact: true,
            }).click();
            await expect(a.page.locator(".overview .state")).toHaveText(
              "Not started",
            );
            await expect(status(a.page)).toHaveText("Synced", {
              timeout: 25000,
            });

            const streamRow = await db.execute({
              sql:
                "SELECT epoch, lesson_revision_id FROM progress_streams WHERE account_id = ? AND lesson_id = ?",
              args: [accountId, lesson.lessonId],
            });
            assertEquals(
              String(streamRow.rows[0].lesson_revision_id),
              revision2.revisionId,
            );
            const newEpoch = Number(streamRow.rows[0].epoch);
            expect(newEpoch).toBeGreaterThan(0);

            const beforeStaleCount = (await db.execute({
              sql:
                "SELECT COUNT(*) AS n FROM progress_events WHERE account_id = ? AND lesson_revision_id = ? AND epoch = 0",
              args: [accountId, lesson.revisionId],
            })).rows[0].n;

            // B reconnects: its old-epoch push is refused. The UI must offer the explicit discard flow.
            await b.context.setOffline(false);
            await expect(status(b.page)).toHaveText("Sync failed", {
              timeout: 25000,
            });
            const banner = b.page.locator("#sync-discard");
            await expect(banner).toBeVisible({ timeout: 20000 });
            await expect(banner).toContainText("discarded on another device");

            const afterStaleCount = (await db.execute({
              sql:
                "SELECT COUNT(*) AS n FROM progress_events WHERE account_id = ? AND lesson_revision_id = ? AND epoch = 0",
              args: [accountId, lesson.revisionId],
            })).rows[0].n;
            assertEquals(
              afterStaleCount,
              beforeStaleCount,
              "B's stale-epoch push never stores anything server-side",
            );

            await banner.getByRole("button", { name: "Discard here" }).click();
            await expect(b.page.locator(".overview .state")).toHaveText(
              "Not started",
              { timeout: 20000 },
            );
            // No resurrection: B never shows Learned/Seen state from the discarded revision after adopting.
            await expect(b.page.locator(".status.outdated")).toHaveCount(0);
            expect(a.errors).toEqual([]);
            expect(b.errors).toEqual([]);
          } finally {
            await a.context.close();
            await b.context.close();
          }
        },
      );

      // ---------------------------------------------------------------------------------------------
      await t.step(
        "5. The server drops every request for a full lesson: the device finishes, shows Sync failed, the outbox holds every event, and the server returns to sync once with nothing duplicated",
        async () => {
          const lesson = await freshLesson(db, accountId, "scenario 5");
          const title = lesson.content.title;
          const device = await newDevice();
          let requests = 0;
          try {
            await device.page.route("**/api/v1/progress/**", (route) => {
              requests += 1;
              return route.fulfill({
                status: 500,
                contentType: "application/problem+json",
                body: JSON.stringify({
                  type: "about:blank",
                  title: "Broken",
                  status: 500,
                  detail: "The request could not be completed.",
                }),
              });
            });
            await openLesson(device.page, origin, title);
            await device.page.getByRole("button", { name: "Start lesson" })
              .click();
            await reachWrapUp(device.page);
            await finishWrapUp(device.page);
            await expect(status(device.page)).toHaveText("Sync failed");
            expect(requests).toBeGreaterThan(0);

            const learning = await readStore(device.page, "learning_events");
            const navigation = await readStore(
              device.page,
              "navigation_events",
            );
            const outbox = await readStore(device.page, "outbox");
            const queuedIds = new Set(outbox.map((entry) => entry.id));
            for (const event of learning) {
              expect(queuedIds.has(event.id)).toBe(true);
            }
            for (const event of navigation) {
              expect(queuedIds.has(event.id)).toBe(true);
            }
            assertEquals(
              outbox.length,
              learning.length + navigation.length,
              "the outbox holds every event from the whole lesson, learning and navigation alike",
            );

            await device.page.unroute("**/api/v1/progress/**");
            await device.context.setOffline(true);
            await device.context.setOffline(false);
            await device.page.reload();
            await expect(status(device.page)).toHaveText("Synced", {
              timeout: 20000,
            });
            expect(await readStore(device.page, "outbox")).toEqual([]);

            const row = await inspect(lesson.revisionId);
            assertEquals(
              row.learningCount,
              learning.length,
              "no learning event was duplicated by the retried batches",
            );
            assertEquals(
              row.navigationCount,
              navigation.length,
              "no navigation event was duplicated by the retried batches",
            );
            assertEquals(new Set(row.learningIds).size, row.learningCount);
            assertEquals(new Set(row.navigationIds).size, row.navigationCount);
            expect(device.errors).toEqual([]);
          } finally {
            await device.context.close();
          }
        },
      );

      // ---------------------------------------------------------------------------------------------
      await t.step(
        "6. A delayed stale checkpoint arrives after newer progress on both devices; neither moves backward",
        async () => {
          const lesson = await freshLesson(db, accountId, "scenario 6");
          const title = lesson.content.title;
          const a = await newDevice();
          const b = await newDevice();
          try {
            await openLesson(a.page, origin, title);
            await a.page.getByRole("button", { name: "Start lesson" }).click();
            await reachWrapUp(a.page);
            await expect(status(a.page)).toHaveText("Synced", {
              timeout: 25000,
            });

            await openLesson(b.page, origin, title);
            await expect(status(b.page)).toHaveText("Synced", {
              timeout: 25000,
            });
            await b.page.getByRole("button", { name: "Resume" }).click();
            await finishWrapUp(b.page);
            await expect(status(b.page)).toHaveText("Synced", {
              timeout: 25000,
            });

            // "Synced" can reflect an earlier cycle that predates the debounced upload of the final
            // summary checkpoint (kick() waits KICK_DELAY_MS after the render before a cycle runs), so
            // poll the server's own account until it agrees, rather than trusting one status read.
            const seen: { before: ServedCheckpoint | null } = { before: null };
            await expect.poll(async () => {
              const served: ServedCheckpoint = await (await fetch(
                `${origin}/api/v1/progress/checkpoint?revision=${lesson.revisionId}&epoch=0`,
                { headers: cookieHeader },
              )).json();
              seen.before = served;
              return served.checkpoint?.screen;
            }, { timeout: 20000 }).toBe("summary");

            // A stale checkpoint depending on far less evidence, stamped with a LATER client clock so only
            // the frontier rule (not the clock) can be trusted to keep it from winning.
            const stale = {
              id: crypto.randomUUID(),
              type: "navigation_checkpointed",
              lessonRevisionId: lesson.revisionId,
              epoch: 0,
              occurredAt: new Date(Date.now() + 3_600_000).toISOString(),
              checkpoint: {
                screen: "card",
                conceptIndex: 0,
                cardIndex: 0,
                flowKind: "cards",
                seed: 0,
                attemptId: "",
                queue: [],
                feedback: null,
                detour: null,
                marker: "late-stale",
                learningEventFrontier: [],
              },
            };
            const pushed = await fetch(
              `${origin}/api/v1/progress/navigation-events`,
              {
                method: "POST",
                headers: {
                  ...cookieHeader,
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  lessonRevisionId: lesson.revisionId,
                  epoch: 0,
                  events: [stale],
                }),
              },
            );
            assertEquals(pushed.status, 200);
            assertEquals((await pushed.json()).accepted, 1);

            const after: ServedCheckpoint = await (await fetch(
              `${origin}/api/v1/progress/checkpoint?revision=${lesson.revisionId}&epoch=0`,
              { headers: cookieHeader },
            )).json();
            assertEquals(
              after.checkpoint?.screen,
              "summary",
              "a checkpoint with a smaller frontier never replaces one with a larger frontier, however late it arrives or however new its clock",
            );
            assertEquals(
              after.checkpoint?.marker,
              seen.before?.checkpoint?.marker ?? undefined,
            );

            const raw = await inspect(lesson.revisionId);
            assert(
              raw.navigationIds.includes(stale.id),
              "the stale event is stored",
            );
            assertEquals(
              screenOf(selectCheckpoint(raw.navigation, raw.learning)),
              "summary",
            );

            for (const device of [a, b]) {
              await openLesson(device.page, origin, title);
              await expect(status(device.page)).toHaveText("Synced", {
                timeout: 25000,
              });
              await expect.poll(
                async () =>
                  (await readStore(device.page, "navigation_events")).some((
                    event,
                  ) => event.id === stale.id),
                { timeout: 20000 },
              ).toBe(true);
              await click(device.page, "Resume");
              await expect(
                device.page.getByRole("heading", {
                  name: "Learned",
                  exact: true,
                }),
              ).toBeVisible();
            }
            expect(a.errors).toEqual([]);
            expect(b.errors).toEqual([]);
          } finally {
            await a.context.close();
            await b.context.close();
          }
        },
      );

      // ---------------------------------------------------------------------------------------------
      await t.step(
        "7. Kill the tab mid-upload after the server has accepted the batch: reopening shows no duplicate and an empty outbox",
        async () => {
          const lesson = await freshLesson(db, accountId, "scenario 7");
          const title = lesson.content.title;
          const context = await phone.newContext(PHONE);
          await context.addCookies([sessionCookie]);
          let page = await context.newPage();
          page.setDefaultTimeout(20000);
          try {
            let learningStored = false;
            const learningIds: string[] = [];
            // Replay the POST directly against the server with Deno's own fetch, independent of
            // Playwright's route.fetch() (whose promise does not settle while the route itself is left
            // unfulfilled). This still proves the server received and stored the batch before the tab dies;
            // the intercepted route is never fulfilled, so the page's own fetch() never resolves. drainOutbox
            // pushes its groups sequentially, so this alone is enough to freeze the whole cycle mid-upload —
            // the navigation-events batch is never even attempted while this one hangs, exactly like a real
            // dropped connection.
            await page.route(
              "**/api/v1/progress/learning-events",
              async (route) => {
                if (route.request().method() !== "POST") {
                  return route.continue();
                }
                const posted: { events?: Array<{ id: string }> } = JSON.parse(
                  route.request().postData() ?? "{}",
                );
                learningIds.push(
                  ...(posted.events ?? []).map((event) => event.id),
                );
                const replayed = await fetch(
                  `${origin}/api/v1/progress/learning-events`,
                  {
                    method: "POST",
                    headers: {
                      ...cookieHeader,
                      "content-type": "application/json",
                    },
                    body: JSON.stringify(posted),
                  },
                );
                await replayed.body?.cancel();
                learningStored = true;
              },
            );

            await openLesson(page, origin, title);
            await page.getByRole("button", { name: "Start lesson" }).click();
            await expect(page.locator(".cardbody h2")).toHaveText(
              fixture.concepts[0].cards[0].heading,
            );
            await readCards(page, fixture.concepts[0].cards.length);
            await expect(page.locator(".qhead")).toBeVisible();
            await answerCorrectly(page);
            await expect(page.getByText("Correct", { exact: true }))
              .toBeVisible();

            await expect.poll(() => learningStored, { timeout: 20000 }).toBe(
              true,
            );
            expect(learningIds.length).toBeGreaterThan(0);
            // Every event this device holds locally, learning and navigation alike, must end up stored
            // exactly once after the kill-and-reopen below — whether or not its own batch ever got sent.
            const navigationIds = (await readStore(page, "navigation_events"))
              .map((event) => event.id);
            expect(navigationIds.length).toBeGreaterThan(0);

            // The server holds the learning batch; the client, mid-request, never got the response. Kill the tab.
            await page.close();

            page = await context.newPage();
            page.setDefaultTimeout(20000);
            await page.goto(`${origin}/learn/${lesson.lessonId}`);
            await expect(status(page)).toHaveText("Synced", { timeout: 20000 });
            expect(await readStore(page, "outbox")).toEqual([]);

            const learningRows = await db.execute({
              sql:
                "SELECT id FROM progress_events WHERE account_id = ? AND lesson_revision_id = ? AND id IN (" +
                learningIds.map(() => "?").join(",") + ")",
              args: [accountId, lesson.revisionId, ...learningIds],
            });
            assertEquals(
              learningRows.rows.length,
              learningIds.length,
              "each killed-mid-upload learning event has exactly one row, not zero and not more than one",
            );
            const navigationRows = await db.execute({
              sql:
                "SELECT id FROM navigation_events WHERE account_id = ? AND lesson_revision_id = ? AND id IN (" +
                navigationIds.map(() => "?").join(",") + ")",
              args: [accountId, lesson.revisionId, ...navigationIds],
            });
            assertEquals(
              navigationRows.rows.length,
              navigationIds.length,
              "each killed-mid-upload navigation event has exactly one row, not zero and not more than one",
            );
          } finally {
            await context.close();
          }
        },
      );

      // ---------------------------------------------------------------------------------------------
      // A raw sanity sweep over every scenario's data: no navigation_checkpointed event ever holds the
      // account's served checkpoint for its scope while a DIFFERENT accepted checkpoint in the same scope
      // depends on strictly more accepted learning evidence.
      await t.step(
        "invariant sweep: the served checkpoint always has the largest accepted frontier in its scope",
        async () => {
          const streams = await db.execute({
            sql:
              "SELECT DISTINCT lesson_revision_id, epoch FROM navigation_events WHERE account_id = ?",
            args: [accountId],
          });
          for (const row of streams.rows) {
            const revisionId = String(row.lesson_revision_id);
            const epoch = Number(row.epoch);
            const navigation =
              (await progressRepo.all(accountId, "navigation", {
                lessonRevisionId: revisionId,
                epoch,
              })).map((r) => r.event);
            const learning = (await progressRepo.all(accountId, "learning", {
              lessonRevisionId: revisionId,
              epoch,
            })).map((r) => r.event);
            const accepted = new Set(learning.map((event) => event.id));
            const served = selectCheckpoint(navigation, learning);
            if (!served) continue;
            const servedFrontier = frontierCount(
              { checkpoint: served },
              accepted,
            );
            for (const candidate of navigation) {
              if (candidate.type !== "navigation_checkpointed") continue;
              const frontier = frontierCount(candidate, accepted);
              expect(
                frontier,
                `checkpoint ${candidate.id} in revision ${revisionId} epoch ${epoch} depends on more accepted evidence than the served one`,
              ).toBeLessThanOrEqual(servedFrontier);
            }
          }
        },
      );
    } catch (error) {
      throw new Error(
        redactBearerTokens(
          error instanceof Error
            ? `${error.message}\n${error.stack ?? ""}`
            : String(error),
        ),
      );
    } finally {
      if (browser) await browser.close();
      if (server) await server.shutdown();
      await ephemeral.destroy();
      console.log(`ephemeral database deleted: ${ephemeral.name}`);
    }
  },
});
