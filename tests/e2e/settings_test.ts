// Phone-sized theme settings through a real Chromium on a dark-mode device: choose olive and light,
// see the page repaint light at once, keep the choice across a reload with no dark first paint, and
// hand the mode back to the device.
import { chromium, expect } from "@playwright/test";
import { app } from "../../src/app.ts";

Deno.test({
  name:
    "the settings page overrides a dark device with olive and light, keeps it across reloads, and returns to the device",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const server = Deno.serve({ port: 0, onListen() {} }, app);
    const ORIGIN = `http://127.0.0.1:${server.addr.port}`;
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
      });
      page.setDefaultTimeout(5000);
      const html = page.locator("html");
      const background = () =>
        page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const statusBar = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('meta[name="theme-color"]')].map((
            meta,
          ) => meta.getAttribute("content"))
        );

      await page.goto(`${ORIGIN}/`);
      await expect(html).toHaveAttribute("data-accent", "bronze");
      const dark = await background();

      await page.getByRole("button", { name: "Settings" }).click();
      await page.waitForURL(`${ORIGIN}/settings`);
      await expect(page.getByRole("heading", { name: "Appearance" }))
        .toBeVisible();
      await page.getByRole("button", { name: "Olive" }).click();
      await page.getByRole("button", { name: "Light" }).click();
      await expect(html).toHaveAttribute("data-accent", "olive");
      await expect(html).toHaveAttribute("data-theme", "light");
      await expect(page.getByRole("button", { name: "Olive" }))
        .toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("button", { name: "Light" }))
        .toHaveAttribute("aria-pressed", "true");
      const light = await background();
      expect(light).not.toBe(dark);
      expect(await statusBar()).toEqual(["#eae2d3", "#eae2d3"]);

      // The boot script applies the saved theme before any module runs.
      await page.route("**/js/app.js", (route) => route.abort());
      await page.reload();
      await expect(html).toHaveAttribute("data-accent", "olive");
      await expect(html).toHaveAttribute("data-theme", "light");
      expect(await background()).toBe(light);
      await page.unroute("**/js/app.js");

      await page.reload();
      await page.getByRole("button", { name: "Device" }).click();
      await expect(html).not.toHaveAttribute("data-theme", /.+/);
      expect(await background()).toBe(dark);
      expect(await statusBar()).toEqual(["#eae2d3", "#1c1812"]);
      await page.getByRole("button", { name: "Back to shelf" }).click();
      await page.waitForURL(`${ORIGIN}/`);
      await expect(html).toHaveAttribute("data-accent", "olive");
    } finally {
      await browser.close();
      await server.shutdown();
    }
  },
});
