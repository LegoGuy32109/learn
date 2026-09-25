// A copy of the application the server refuses as outdated resets the device: it signs out,
// deletes the local database and the shell, and reloads the shelf from the network. The learner's
// evidence on this device is gone, by design; they sign in again.
import { chromium, expect } from "@playwright/test";
import { app } from "../../src/app.ts";
import type { OutdatedClientReply } from "../../src/shared/api/v1.d.ts";
import { openFirstCard, readCards } from "./support/demo.ts";

const origin = "http://127.0.0.1:8005";

Deno.test({
  name: "a copy refused as outdated wipes the device and reloads the shelf",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const server = Deno.serve({ port: 8005, onListen() {} }, app);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const learningEvents = () =>
      page.evaluate(() =>
        new Promise<number>((resolve, reject) => {
          const request = indexedDB.open("learn-local-v1");
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("learning_events")) {
              db.close();
              return resolve(0);
            }
            const count = db.transaction("learning_events", "readonly")
              .objectStore("learning_events").count();
            count.onsuccess = () => {
              db.close();
              resolve(count.result);
            };
            count.onerror = () => reject(count.error);
          };
          request.onerror = () => reject(request.error);
        })
      );
    try {
      await openFirstCard(page, origin);
      await readCards(page, 1);
      expect(await learningEvents()).toBeGreaterThan(0);
      await page.goto(`${origin}/`);
      await expect(page.locator(".lstatus").first()).not.toHaveText(
        "Not started",
      );

      // The server now answers this copy's next API call as it would answer a copy older than its
      // API revision.
      const outdated: OutdatedClientReply = {
        type: "about:blank",
        title: "Application outdated",
        status: 409,
        detail:
          "This copy of the application is older than the server supports.",
        code: "client.outdated",
        revision: 2,
      };
      await page.route(
        "**/api/v1/passkeys/authentication-options",
        (route) =>
          route.fulfill({
            status: 409,
            contentType: "application/problem+json",
            body: JSON.stringify(outdated),
          }),
      );
      const signedOut = page.waitForRequest((request) =>
        request.method() === "DELETE" &&
        new URL(request.url()).pathname === "/api/v1/session"
      );
      const reloaded = page.waitForEvent("load");
      await page.getByRole("button", { name: "Sign in with a passkey" })
        .click();
      await signedOut;
      await reloaded;

      await expect(page.locator(".lstatus").first()).toHaveText("Not started");
      expect(await learningEvents()).toBe(0);
      expect(new URL(page.url()).pathname).toBe("/");
    } finally {
      await browser.close();
      await server.shutdown();
    }
  },
});
