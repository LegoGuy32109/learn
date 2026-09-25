// Ticket 12 audit: the whole learning loop on a 390 by 844 viewport, driven from a fresh browser,
// with a projection-deleting reload at every distinct surface, the plugin's non-negotiable rules
// and the visual contract asserted everywhere, and drill mode end to end. Written independently
// of the implementers' e2e suite. Failing checks are collected and reported together; the test
// fails at the end when any check failed.
import { chromium, expect } from "@playwright/test";
import { app } from "../../src/app.ts";
import { check, report, results } from "./support.ts";
import { drillFromFresh, fullWalk } from "./walk.ts";

const REPORT_PATH = new URL("./last-run.md", import.meta.url).pathname;

Deno.test({
  name: "audit: learning loop on a phone viewport",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const server = Deno.serve({ port: 0, onListen() {} }, app);
    const ORIGIN = `http://127.0.0.1:${server.addr.port}`;
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    const consoleMessages: string[] = [];
    try {
      await fullWalk(browser, ORIGIN, errors, consoleMessages);
      await drillFromFresh(browser, ORIGIN, errors, consoleMessages);
      await check("listeners · no pageerror during the whole run", () => {
        expect(errors).toEqual([]);
      });
      await check(
        "listeners · no console error or warning during the whole run",
        () => {
          expect(consoleMessages).toEqual([]);
        },
      );
    } finally {
      await browser.close();
      await server.shutdown();
      const text = report("Learning loop walk");
      await Deno.writeTextFile(REPORT_PATH, text + "\n");
      console.log("\n" + text + "\n");
    }
    const failed = results.filter((result) => !result.ok);
    if (failed.length) {
      throw new Error(
        `${failed.length} audit checks failed; see ${REPORT_PATH}`,
      );
    }
  },
});
