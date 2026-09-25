// Installable shell: the worker precaches the shell, a phone resumes a cached lesson offline from
// IndexedDB, no /api/ response is ever served from the cache, and a new build waits behind an
// "Update ready" affordance that never interrupts a Question and sweeps the old cache on activation.
import { chromium, expect } from "@playwright/test";
import lesson from "../../fixtures/lessons/browser-http-cache.json" with {
  type: "json",
};
import { createApp, fixtureDependencies } from "../../src/app.ts";
import { RejectingAuthenticator } from "../../src/server/auth.ts";
import {
  type Build,
  computeBuild,
  readShellFiles,
} from "../../src/server/build.ts";
import { FixtureLessonRepository } from "../../src/server/repositories/lessons.ts";
import { page as shell } from "../../src/server/views/page.ts";

const origin = "http://127.0.0.1:8003";

Deno.test({
  name:
    "phone reopens a cached lesson offline and takes an update between Questions",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const disk = await computeBuild(
      await readShellFiles(),
      shell(null, { signedIn: false, displayName: null }),
    );
    let build: Build = disk;
    const app = createApp({
      ...await fixtureDependencies(),
      lessons: new FixtureLessonRepository(lesson),
      auth: new RejectingAuthenticator(),
      build: () => Promise.resolve(build),
    });
    const server = Deno.serve({ port: 8003 }, app);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    try {
      await page.goto(`${origin}/`);
      await page.waitForFunction(() =>
        navigator.serviceWorker.controller !== null
      );
      // Chromium's own manifest parser accepts the manifest with the fields installation needs.
      // (Page.getInstallabilityErrors is always empty in headless Chromium, so it proves nothing here.)
      const cdp = await context.newCDPSession(page);
      const parsed = await cdp.send("Page.getAppManifest") as {
        url: string;
        errors: unknown[];
        manifest: any;
      };
      await cdp.detach();
      expect(parsed.url).toBe(`${origin}/manifest.webmanifest`);
      expect(parsed.errors).toEqual([]);
      expect(parsed.manifest.name).toBe("learn");
      expect(parsed.manifest.display).toBe("kStandalone");
      expect(parsed.manifest.startUrl).toBe(`${origin}/`);
      expect(parsed.manifest.themeColor).toBe("rgba(234,226,211,1)");
      const iconSizes = parsed.manifest.icons.map((icon: { sizes: string }) =>
        icon.sizes
      );
      expect(iconSizes).toContain("192x192");
      expect(iconSizes).toContain("512x512");
      const cachesAfterInstall = await page.evaluate(() => caches.keys());
      expect(cachesAfterInstall).toEqual([`learn-shell-${disk.hash}`]);

      // Every precached shell asset is in the versioned cache; no /api/ response ever is.
      await page.evaluate(() =>
        fetch("/api/v1/schemas/lesson/v1").then((response) => response.text())
      );
      const cachedPaths: string[] = await page.evaluate(async () => {
        const [name] = await caches.keys();
        const cache = await caches.open(name);
        return (await cache.keys()).map((request) =>
          new URL(request.url).pathname
        ).sort();
      });
      expect(cachedPaths).toEqual([...disk.precache].sort());
      expect(cachedPaths.some((path) => path.startsWith("/api/"))).toBe(false);

      // Reach Card 2 once while online.
      await page.getByRole("button", { name: /How browser HTTP caching works/ })
        .click();
      await page.getByRole("button", { name: "Start lesson" }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".cardbody h2")).toHaveText(
        "Age measures stored time",
      );
      await page.waitForTimeout(100);

      // Airplane mode: reload from the icon's start URL and from the lesson URL, and see Card 2 again.
      await context.setOffline(true);
      await page.reload();
      await expect(page.locator(".cardbody h2")).toHaveText(
        "Age measures stored time",
      );
      expect(await page.evaluate(() => "__LESSON__" in window)).toBe(false);
      const fromIcon = await context.newPage();
      fromIcon.setDefaultTimeout(5000);
      await fromIcon.goto(`${origin}/`);
      await fromIcon.getByRole("button", {
        name: /How browser HTTP caching works/,
      }).click();
      await fromIcon.getByRole("button", { name: "Resume" }).click();
      await expect(fromIcon.locator(".cardbody h2")).toHaveText(
        "Age measures stored time",
      );
      const apiOffline = await fromIcon.evaluate(() =>
        fetch("/api/v1/schemas/lesson/v1").then(() => "served", () => "failed")
      );
      expect(apiOffline).toBe("failed");
      await fromIcon.close();
      await context.setOffline(false);

      // A new build is waiting. It must not surface over an unanswered Question.
      build = { ...disk, hash: "e2e000000001" };
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator(".qhead")).toBeVisible();
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        await registration.update();
      });
      await page.waitForFunction(async () =>
        (await navigator.serviceWorker.ready).waiting !== null
      );
      await page.waitForTimeout(300);
      expect(await page.getByText("Update ready").count()).toBe(0);

      // Answering the Question makes it a good moment; the affordance appears without a reload.
      if (await page.locator(".opt").count()) {
        await page.locator(".opt").first().click();
      } else {
        await page.locator("#answer").fill("60");
        await page.getByRole("button", { name: "Answer" }).click();
      }
      await expect(page.locator(".feedback")).toBeVisible();
      await expect(page.getByText("Update ready")).toBeVisible();
      await Promise.all([
        page.waitForEvent("load"),
        page.getByRole("button", { name: "Reload" }).click(),
      ]);
      await page.waitForFunction(() =>
        navigator.serviceWorker.controller !== null
      );
      await expect(page.locator(".feedback")).toBeVisible();
      await page.waitForFunction(() =>
        caches.keys().then((names) => names.length === 1)
      );
      expect(await page.evaluate(() => caches.keys())).toEqual([
        "learn-shell-e2e000000001",
      ]);
    } finally {
      await browser.close();
      await server.shutdown();
    }
  },
});
