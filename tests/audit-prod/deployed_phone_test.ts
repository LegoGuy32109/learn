// Ticket 14 audit: the deployed site, driven the way Josh's phone will drive it. Mobile-emulated
// Chromium against LEARN_BASE_URL (default: the production Deno Deploy URL), the owner token from
// .env.prod, a virtual platform authenticator for the passkey, and the ticket 12 learning-loop walk
// run against production. Every check records a pass or fail line with the response or screenshot
// that proves it; failures are collected, not thrown, so one defect never hides the next. The
// audit creates only lessons whose title starts with `audit-`, deletes nothing, and lists what it
// created in tests/audit-prod/last-run.md.
//
// Run: deno task audit:prod            (LEARN_BASE_URL optional; token from .env.prod)
import { chromium, expect } from "@playwright/test";
import { attachListeners, observations, report, results, setScreenshotDirectory } from "../audit/support.ts";
import { answer, tap } from "../audit/support.ts";
import { drillFromFresh, fullWalk } from "../audit/walk.ts";
import {
  BASE,
  HOST,
  PHONE,
  REPORT_PATH,
  REVISION_HEADER,
  SCREENSHOTS,
  auditTitle,
  bodies,
  check,
  cookieAttributes,
  created,
  describe,
  lessonDocument,
  looksLikeStackTrace,
  mintInviteWithTask,
  observe,
  probe,
  productionSecrets,
  readStore,
  recordBody,
  recordPageBodies,
  redact,
  revisionsSeen,
  scanBodies,
  snap,
} from "./support.ts";

const DAY = 24 * 60 * 60 * 1000;
const errors: string[] = [];
const consoleMessages: string[] = [];

Deno.test({ name: "audit: the deployed phone experience", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  if (!BASE.startsWith("https://")) throw new Error(`LEARN_BASE_URL must use https, got ${BASE}`);
  setScreenshotDirectory(SCREENSHOTS);
  const secrets = await productionSecrets();
  observe("token source", `The owner token came from the ${secrets.source === "file" ? ".env.prod file" : "LEARN_OWNER_TOKEN environment variable"}.`);
  const started = new Date();
  const browser = await chromium.launch({ headless: true });
  try {
    await transportAndSecurity();
    await manifestAndWorker(browser);
    const signedIn = await signIn(browser);
    await shelf(browser, signedIn);
    await learningLoop(browser);
    await secretScan();
    await check("listeners · no pageerror during the whole run", () => {
      expect(errors).toEqual([]);
    });
    const workerFetch = consoleMessages.filter((message) => /bad HTTP response code \(404\) was received when fetching the script/.test(message));
    const deliberate410 = consoleMessages.filter((message) => /status of 410/.test(message));
    const other = consoleMessages.filter((message) => !workerFetch.includes(message) && !deliberate410.includes(message));
    observe("console", `${workerFetch.length} messages were the failed /sw.js fetch (see the worker checks); ${deliberate410.length} came from deliberately reopening the used invite (410).`);
    await check("listeners · no console error or warning beyond the failed worker fetch and the deliberate 410", () => {
      expect(other.map(redact)).toEqual([]);
    });
    await check("listeners · the browser logged no failed service-worker script fetch", () => {
      expect(workerFetch.length, `${workerFetch.length} page loads logged: ${redact(workerFetch[0] ?? "")}`).toBe(0);
    });
  } finally {
    await browser.close();
    const text = [
      report("Deployed phone experience"),
      "",
      "### Run",
      "",
      `- Base URL: ${BASE}`,
      `- Started: ${started.toISOString()}`,
      `- Served by revision(s): ${revisionsSeen.size ? [...revisionsSeen].join(", ") : "(none seen)"}`,
      `- Response bodies scanned for secrets: ${bodies.length}`,
      "",
      "### Created on production (nothing was deleted)",
      "",
      ...(created.length ? created.map((item) => `- ${item}`) : ["- nothing"]),
      "",
    ].join("\n");
    await Deno.writeTextFile(REPORT_PATH, redact(text) + "\n");
    console.log("\n" + redact(text) + "\n");
  }
  const failed = results.filter((result) => !result.ok);
  if (failed.length) throw new Error(`${failed.length} audit checks failed; see ${REPORT_PATH}`);
} });

// ---------------------------------------------------------------------------------------------
// Security and transport, without a browser.

async function transportAndSecurity() {
  const { ownerToken } = await productionSecrets();
  const bearer = { authorization: `Bearer ${ownerToken}` };

  await check("https · plain http redirects to https", async () => {
    const response = await fetch(`http://${HOST}/`, { redirect: "manual" });
    await response.body?.cancel();
    const location = response.headers.get("location") ?? "";
    expect([301, 302, 307, 308]).toContain(response.status);
    expect(location.startsWith("https://")).toBe(true);
    return describe("GET", `http://${HOST}/`, response);
  });

  const shell = await probe("/");
  await check("https · the shell is served over HTTPS with the revision header", () => {
    expect(shell.response.status).toBe(200);
    expect(shell.response.headers.get("content-type") ?? "").toMatch(/^text\/html/);
    expect(shell.response.headers.get(REVISION_HEADER)).toBeTruthy();
    return shell.evidence;
  });
  await check("hsts · Strict-Transport-Security is present on the shell", () => {
    const hsts = shell.response.headers.get("strict-transport-security");
    expect(hsts, "no strict-transport-security header").toBeTruthy();
    expect(Number(hsts!.match(/max-age=(\d+)/)?.[1] ?? 0)).toBeGreaterThanOrEqual(15552000);
    return shell.evidence;
  });
  const capabilities = await probe("/api/v1/capabilities");
  await check("hsts · Strict-Transport-Security is present on an API response", () => {
    expect(capabilities.response.headers.get("strict-transport-security"), "no strict-transport-security header").toBeTruthy();
    return capabilities.evidence;
  });
  for (const name of ["content-security-policy", "x-content-type-options", "referrer-policy", "x-frame-options", "permissions-policy"]) {
    observe(`header · ${name}`, shell.response.headers.has(name) ? `present: ${shell.response.headers.get(name)}` : "absent on the shell (not required by the ticket)");
  }

  await check("content types · capability document is application/json with the v1 contract", () => {
    expect(capabilities.response.status).toBe(200);
    expect(capabilities.response.headers.get("content-type") ?? "").toMatch(/^application\/json/);
    const body = JSON.parse(capabilities.text);
    expect(body.apiVersion).toBe("v1");
    expect(body.links.validator).toBe(`${BASE}/tools/lesson-validator.js`);
    return capabilities.evidence;
  });
  const wellKnown = await probe("/.well-known/learn-joshhale.json");
  await check("content types · well-known capability document is the same JSON", () => {
    expect(wellKnown.response.status).toBe(200);
    expect(wellKnown.response.headers.get("content-type") ?? "").toMatch(/^application\/json/);
    expect(JSON.parse(wellKnown.text).links.self).toBe(`${BASE}/api/v1/capabilities`);
    return wellKnown.evidence;
  });
  const validator = await probe("/tools/lesson-validator.js");
  await check("content types · validator is text/javascript and exports resolveLesson", () => {
    expect(validator.response.status).toBe(200);
    expect(validator.response.headers.get("content-type") ?? "").toMatch(/^text\/javascript/);
    expect(validator.text).toMatch(/export/);
    expect(validator.text).toMatch(/resolveLesson/);
    return validator.evidence;
  });
  const types = await probe("/tools/lesson-validator.d.ts");
  observe("content types · validator declarations", redact(`${types.response.status} ${types.response.headers.get("content-type")} (text/plain is what the asset route gives .ts files)`));
  const schema = await probe("/api/v1/schemas/lesson/v1");
  await check("content types · lesson schema is application/json draft 2020-12", () => {
    expect(schema.response.status).toBe(200);
    expect(schema.response.headers.get("content-type") ?? "").toMatch(/^application\/json/);
    expect(JSON.parse(schema.text).$schema).toContain("2020-12");
    return schema.evidence;
  });
  const openapi = await probe("/openapi.json");
  await check("content types · OpenAPI document is application/json and names this origin", () => {
    expect(openapi.response.status).toBe(200);
    expect(openapi.response.headers.get("content-type") ?? "").toMatch(/^application\/json/);
    expect(JSON.stringify(JSON.parse(openapi.text).servers)).toContain(BASE);
    return openapi.evidence;
  });
  const manifest = await probe("/manifest.webmanifest");
  await check("content types · manifest is application/manifest+json", () => {
    expect(manifest.response.status).toBe(200);
    expect(manifest.response.headers.get("content-type") ?? "").toMatch(/^application\/manifest\+json/);
    return manifest.evidence;
  });
  const worker = await probe("/sw.js");
  await check("content types · /sw.js is served as text/javascript with the build hash substituted", () => {
    expect(worker.response.status, redact(worker.text.slice(0, 300))).toBe(200);
    expect(worker.response.headers.get("content-type") ?? "").toMatch(/^text\/javascript/);
    expect(worker.text).not.toContain("__BUILD_HASH__");
    expect(worker.text).toMatch(/learn-shell-|cacheName/);
    return worker.evidence;
  });

  for (const path of ["/api/v1/capabilities", "/api/v1/shelf", "/api/v1/session", "/openapi.json"]) {
    const headers: Record<string, string> = { origin: "https://evil.example" };
    if (path === "/api/v1/shelf") Object.assign(headers, bearer);
    const cors = await probe(path, { headers });
    await check(`cors · ${path} with a foreign Origin gets no wildcard or reflected Access-Control-Allow-Origin`, () => {
      const allow = cors.response.headers.get("access-control-allow-origin");
      expect(allow).not.toBe("*");
      expect(allow).not.toBe("https://evil.example");
      return cors.evidence;
    });
  }
  const preflight = await probe("/api/v1/shelf", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
  await check("cors · a preflight from a foreign origin is not granted", () => {
    expect(preflight.response.headers.get("access-control-allow-origin")).toBeNull();
    return preflight.evidence;
  });
  const crossSite = await probe("/api/v1/passkeys/authentication-options", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  await check("csrf · a passkey ceremony started from another site is refused with 403", () => {
    expect(crossSite.response.status).toBe(403);
    expect(JSON.parse(crossSite.text).title).toBe("Cross-site request");
    return crossSite.evidence;
  });
  const sameSite = await probe("/api/v1/passkeys/authentication-options", { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: "{}" });
  await check("passkeys · authentication options name this host as the relying party", () => {
    expect(sameSite.response.status).toBe(200);
    expect(JSON.parse(sameSite.text).options.rpId).toBe(HOST);
    return sameSite.evidence;
  });

  for (const path of ["/.env", "/.env.prod", "/deno.json", "/main.ts", "/src/server/auth.ts", "/src/server/db.ts", "/migrations/001_initial.sql", "/tests/audit/last-run.md"]) {
    const hidden = await probe(path);
    await check(`not served · ${path} answers 404`, () => {
      expect(hidden.response.status).toBe(404);
      expect(hidden.text).not.toMatch(/TURSO_|libsql:\/\//);
      return hidden.evidence;
    });
  }

  const unauthenticated = await probe("/api/v1/shelf");
  await check("auth · the shelf without a credential is a 401 problem document, not a page or a trace", () => {
    expect(unauthenticated.response.status).toBe(401);
    expect(unauthenticated.response.headers.get("content-type") ?? "").toMatch(/^application\/problem\+json/);
    expect(looksLikeStackTrace(unauthenticated.text)).toBe(false);
    return unauthenticated.evidence;
  });
  const badToken = await probe("/api/v1/sign-in-invites", { method: "POST", headers: { authorization: "Bearer learn_pat_audit_notarealsecretvalue0000000000" } });
  await check("auth · an invalid personal token cannot mint an invite (401)", () => {
    expect(badToken.response.status).toBe(401);
    return badToken.evidence;
  });
  const listed = await probe("/api/v1/shelf", { headers: bearer });
  await check("auth · the owner token lists the shelf and the read is private, no-store", () => {
    expect(listed.response.status).toBe(200);
    expect(listed.response.headers.get("cache-control")).toBe("private, no-store");
    expect(Array.isArray(JSON.parse(listed.text).lessons)).toBe(true);
    return listed.evidence;
  });
  const unknown = await probe("/api/v1/nothing-here");
  await check("errors · an unknown route is a 404 problem document without a stack trace", () => {
    expect(unknown.response.status).toBe(404);
    expect(looksLikeStackTrace(unknown.text)).toBe(false);
    return unknown.evidence;
  });
  const invalidInvite = await probe("/sign-in/not-a-real-invite-token");
  await check("invite · an unknown invite link is a plain 404 page, not a trace", () => {
    expect(invalidInvite.response.status).toBe(404);
    expect(invalidInvite.text).toContain("not valid");
    expect(looksLikeStackTrace(invalidInvite.text)).toBe(false);
    return invalidInvite.evidence;
  });
}

// ---------------------------------------------------------------------------------------------
// Manifest, service worker and offline shell.

async function manifestAndWorker(browser: any) {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  attachListeners(page, errors, consoleMessages);
  recordPageBodies(page, "pwa");
  try {
    await page.goto(`${BASE}/`);
    await page.waitForFunction(() => (document.querySelector("#app")?.textContent ?? "").trim().length > 0);
    const cdp = await context.newCDPSession(page);
    const parsed = await cdp.send("Page.getAppManifest") as { url: string; errors: unknown[]; manifest: any };
    let installability: unknown = "unavailable";
    try {
      installability = (await cdp.send("Page.getInstallabilityErrors") as any).installabilityErrors;
    } catch (error) {
      installability = `unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
    await cdp.detach();
    await check("manifest · Chromium parses the manifest with no errors: name, standalone, start URL, theme colour, 192 and 512 icons", () => {
      expect(parsed.url).toBe(`${BASE}/manifest.webmanifest`);
      expect(parsed.errors).toEqual([]);
      expect(parsed.manifest.name).toBe("learn");
      expect(parsed.manifest.display).toBe("kStandalone");
      expect(parsed.manifest.startUrl).toBe(`${BASE}/`);
      expect(parsed.manifest.themeColor).toBe("rgba(234,226,211,1)");
      const sizes = parsed.manifest.icons.map((icon: { sizes: string }) => icon.sizes);
      expect(sizes).toContain("192x192");
      expect(sizes).toContain("512x512");
      return `Page.getAppManifest: ${JSON.stringify({ url: parsed.url, errors: parsed.errors, name: parsed.manifest.name, display: parsed.manifest.display, startUrl: parsed.manifest.startUrl, icons: sizes })}`;
    });
    observe("manifest · Page.getInstallabilityErrors", `${JSON.stringify(installability)} (headless Chromium reports an empty list for every page, so this proves nothing on its own)`);
    for (const icon of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-512-maskable.png", "/icons/apple-touch-icon-180.png"]) {
      const response = await fetch(`${BASE}${icon}`);
      await response.body?.cancel();
      await check(`manifest · ${icon} is served as image/png`, () => {
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        return describe("GET", icon, response);
      });
    }

    // The worker: the page registers /sw.js at scope /. Give it time, then ask the browser what happened.
    const registration = await page.evaluate(async () => {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const found = await navigator.serviceWorker.getRegistration();
        if (found?.active && navigator.serviceWorker.controller) return { registered: true, controlled: true, scope: found.scope, scriptURL: found.active.scriptURL };
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const found = await navigator.serviceWorker.getRegistration();
      return { registered: found != null, controlled: navigator.serviceWorker.controller != null, scope: found?.scope ?? null, scriptURL: found?.active?.scriptURL ?? found?.installing?.scriptURL ?? null };
    });
    const workerScript = await fetch(`${BASE}/sw.js`);
    const workerText = await workerScript.text();
    recordBody("GET /sw.js", workerScript.status, workerText);
    await check("worker · the service worker registers and controls the page after the first visit", () => {
      expect(registration.registered, `no registration; GET /sw.js answered ${workerScript.status}: ${redact(workerText.slice(0, 200))}`).toBe(true);
      expect(registration.controlled).toBe(true);
      return `registration: ${JSON.stringify(registration)}\n${describe("GET", "/sw.js", workerScript)}`;
    });
    const cacheNames: string[] = await page.evaluate(() => caches.keys());
    const cachedPaths: string[] = await page.evaluate(async () => {
      const paths: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) paths.push(new URL(request.url).pathname);
      }
      return paths.sort();
    });
    await check("worker · one versioned shell cache holds the shell and no /api/ path", () => {
      expect(cacheNames.length, `caches: ${JSON.stringify(cacheNames)}`).toBe(1);
      expect(cacheNames[0]).toMatch(/^learn-shell-[0-9a-f]{12}$/);
      expect(cachedPaths).toContain("/shell");
      expect(cachedPaths.some((path) => path.startsWith("/api/"))).toBe(false);
      return `caches: ${JSON.stringify(cacheNames)}; ${cachedPaths.length} cached paths`;
    });
    // Fetch an API document through the page, then confirm the cache still holds no /api/ entry and the
    // second fetch was answered by the origin, not a cache.
    const apiFetch = await page.evaluate(async () => {
      const first = await fetch("/api/v1/session", { headers: { accept: "application/json" } });
      await first.text();
      const second = await fetch("/api/v1/session", { headers: { accept: "application/json" } });
      await second.text();
      return { status: second.status, age: second.headers.get("age"), cacheStatus: second.headers.get("cache-status"), cacheControl: second.headers.get("cache-control") };
    });
    const afterApi: string[] = await page.evaluate(async () => {
      const paths: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) paths.push(new URL(request.url).pathname);
      }
      return paths;
    });
    await check("worker · an /api/ response is never stored in or served from the worker cache", () => {
      expect(afterApi.some((path) => path.startsWith("/api/"))).toBe(false);
      expect(apiFetch.cacheControl).toBe("private, no-store");
      expect(apiFetch.cacheStatus ?? "").not.toMatch(/hit/);
      return `second GET /api/v1/session: ${JSON.stringify(apiFetch)}; /api/ entries in caches: 0 of ${afterApi.length}`;
    });

    // Airplane mode after one visit: the icon's start URL must still open the shelf.
    await context.setOffline(true);
    let offlineOutcome = "";
    try {
      await page.reload();
      await page.waitForFunction(() => (document.querySelector("#app")?.textContent ?? "").trim().length > 0, null, { timeout: 5000 });
      offlineOutcome = "shell rendered offline";
    } catch (error) {
      offlineOutcome = `reload offline failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
    }
    const offlineText = offlineOutcome === "shell rendered offline" ? await page.locator("#app").innerText() : "";
    await check("offline · after one visit the start URL opens the shelf with the network off", async () => {
      expect(offlineOutcome).toBe("shell rendered offline");
      expect(offlineText).toContain("Mine");
      return `${offlineOutcome}; ${await snap(page, "shelf offline")}`;
    });
    await context.setOffline(false);
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Sign-in: invite, passkey, cookie, restart, reuse.

interface SignedIn {
  storageState: any;
  credentialId: string | null;
  /** The account's display name as the invite page announced it. */
  displayName: string;
}

async function signIn(browser: any): Promise<SignedIn> {
  const outcome: SignedIn = { storageState: null, credentialId: null, displayName: "Josh" };
  let invite: { url: string; path: string; expiresAt: number } | null = null;
  await check("invite · deno task invite:mint pointed at production returns a ten-minute link", async () => {
    invite = await mintInviteWithTask();
    expect(invite.path.startsWith("/sign-in/")).toBe(true);
    expect(invite.expiresAt - Date.now()).toBeGreaterThan(9 * 60 * 1000);
    expect(invite.expiresAt - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000 + 5000);
    created.push(`sign-in invite ${invite.path.slice(0, 16)}… (consumed by this run's passkey registration)`);
    return `invite expires in ${Math.round((invite.expiresAt - Date.now()) / 1000)} s (link withheld)`;
  });
  if (!invite) return outcome;
  const minted = invite as { url: string; path: string; expiresAt: number };

  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  attachListeners(page, errors, consoleMessages);
  recordPageBodies(page, "sign-in");
  const cdp = await context.newCDPSession(page);
  let setCookieHeader: string | null = null;
  page.on("response", async (response: any) => {
    if (new URL(response.url()).pathname === "/api/v1/passkeys/registrations") {
      const header = (await response.headersArray()).find((entry: any) => entry.name.toLowerCase() === "set-cookie");
      if (header) setCookieHeader = header.value;
    }
  });
  try {
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
    });

    const landing = await page.goto(minted.url);
    await check("invite · the invite page opens for Josh's account with one Register a passkey button", async () => {
      expect(landing.status()).toBe(200);
      const notice = await page.locator(".notice strong").first().textContent();
      const named = notice?.match(/^Invite for (.+)\.$/);
      expect(named, `notice reads ${JSON.stringify(notice)}`).toBeTruthy();
      outcome.displayName = named![1];
      expect(outcome.displayName.startsWith("Josh")).toBe(true);
      await expect(page.getByRole("button", { name: "Register a passkey" })).toBeVisible();
      return `GET ${minted.path.slice(0, 16)}… -> ${landing.status()}; invite names ${JSON.stringify(outcome.displayName)}; ${await snap(page, "invite page")}`;
    });
    const signedInAs = () => `Signed in as ${outcome.displayName}`;
    await page.getByRole("button", { name: "Register a passkey" }).click();
    await check("passkey · registering with the platform authenticator lands on the shelf signed in", async () => {
      await page.waitForURL(`${BASE}/`);
      await expect(page.locator("#account-status")).toHaveText(signedInAs());
      return await snap(page, "shelf signed in after registration");
    });
    const credentials = (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials as any[];
    outcome.credentialId = credentials[0]?.credentialId ?? null;
    if (outcome.credentialId) created.push(`passkey credential ${outcome.credentialId.slice(0, 12)}… on Josh's production account (from this run's virtual authenticator; it cannot sign in from any real device)`);

    const cookie = (await context.cookies()).find((candidate: any) => candidate.name === "learn_session");
    await check("cookie · learn_session is HttpOnly, Secure, SameSite=Lax, Path=/, host-only and expires in about 30 days", () => {
      expect(cookie, "no learn_session cookie").toBeTruthy();
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.secure).toBe(true);
      expect(cookie.sameSite).toBe("Lax");
      expect(cookie.path).toBe("/");
      expect(cookie.domain.replace(/^\./, "")).toBe(HOST);
      const lifetime = cookie.expires * 1000 - Date.now();
      expect(lifetime).toBeGreaterThan(29 * DAY);
      expect(lifetime).toBeLessThan(31 * DAY);
      const attributes = setCookieHeader ? cookieAttributes(setCookieHeader) : "(Set-Cookie header not captured)";
      return `Set-Cookie: ${attributes}\nbrowser sees: httpOnly=${cookie.httpOnly} secure=${cookie.secure} sameSite=${cookie.sameSite} path=${cookie.path} domain=${cookie.domain} lifetime=${(lifetime / DAY).toFixed(1)} days`;
    });
    await check("cookie · the Set-Cookie header itself carries HttpOnly, Secure and SameSite=Lax", () => {
      expect(setCookieHeader, "Set-Cookie not observed on the registration response").toBeTruthy();
      const attributes = setCookieHeader!.toLowerCase();
      expect(attributes).toContain("httponly");
      expect(attributes).toContain("secure");
      expect(attributes).toContain("samesite=lax");
      return `Set-Cookie: ${cookieAttributes(setCookieHeader!)}`;
    });

    await check("passkey · sign out shows Guest and clears the cookie; Sign in with a passkey signs back in", async () => {
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page.locator("#account-status")).toHaveText("Guest");
      expect((await context.cookies()).some((candidate: any) => candidate.name === "learn_session")).toBe(false);
      await page.getByRole("button", { name: "Sign in with a passkey" }).click();
      await expect(page.locator("#account-status")).toHaveText(signedInAs());
      const after = (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials as any[];
      expect(after[0].signCount).toBeGreaterThan(0);
      return `sign count after sign-in: ${after[0].signCount}; ${await snap(page, "shelf signed in with passkey")}`;
    });

    // Reuse: the same link again, in the page and against the API.
    const reused = await page.goto(minted.url);
    await check("invite · opening the used invite again is a plain 410 page saying it was already used", async () => {
      expect(reused.status()).toBe(410);
      await expect(page.getByText("already used")).toBeVisible();
      expect(looksLikeStackTrace(await page.content())).toBe(false);
      return `GET ${minted.path.slice(0, 16)}… -> ${reused.status()}; ${await snap(page, "invite already used")}`;
    });
    const reusedOptions = await probe("/api/v1/passkeys/registration-options", { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ invite: minted.path.slice("/sign-in/".length) }) });
    await check("invite · registration options for the used invite are refused with a 410 problem document", () => {
      expect(reusedOptions.response.status).toBe(410);
      expect(JSON.parse(reusedOptions.text).title).toBe("Invite already used");
      return reusedOptions.evidence;
    });
    await page.goto(`${BASE}/`);
    await expect(page.locator("#account-status")).toHaveText(signedInAs());
    outcome.storageState = await context.storageState();
    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  } catch (error) {
    await check("passkey · the sign-in section ran to completion", () => {
      throw error;
    });
  } finally {
    await cdp.detach().catch(() => {});
    await context.close();
  }

  // The app is killed and reopened: a new browser context with only the stored cookies.
  if (outcome.storageState) {
    const reopened = await browser.newContext({ ...PHONE, storageState: outcome.storageState });
    const page = await reopened.newPage();
    page.setDefaultTimeout(10000);
    attachListeners(page, errors, consoleMessages);
    recordPageBodies(page, "restart");
    try {
      await page.goto(`${BASE}/`);
      await check("session · the session survives a context restart: the reopened app is still signed in", async () => {
        await expect(page.locator("#account-status")).toHaveText(`Signed in as ${outcome.displayName}`);
        const session = await page.evaluate(() => fetch("/api/v1/session").then((response) => response.json()));
        expect(session).toEqual({ signedIn: true, displayName: outcome.displayName });
        return `GET /api/v1/session -> ${JSON.stringify(session)}; ${await snap(page, "shelf after restart")}`;
      });
    } finally {
      await reopened.close();
    }
  }
  return outcome;
}

// ---------------------------------------------------------------------------------------------
// Shelf: a laptop-created draft, refresh, open, cache, offline, second revision, Outdated, discard.

async function shelf(browser: any, signedIn: SignedIn) {
  if (!signedIn.storageState) {
    await check("shelf · the shelf section needs a signed-in session", () => {
      throw new Error("Sign-in did not complete, so the shelf checks could not run.");
    });
    return;
  }
  const { ownerToken } = await productionSecrets();
  const agent = async (path: string, body: string) => {
    const response = await fetch(`${BASE}${path}`, { method: "POST", headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" }, body });
    const text = await response.text();
    recordBody(`agent: POST ${path}`, response.status, text);
    return { response, text, json: JSON.parse(text) };
  };
  const title = auditTitle("");
  const revisedTitle = `${title} (revision 2)`;

  const draft = await agent("/api/v1/lessons", lessonDocument(title));
  let lessonId = "";
  let revisionId = "";
  await check("shelf · the owner token creates a draft whose title starts with audit-", () => {
    expect(draft.response.status).toBe(201);
    expect(draft.json.revisionNumber).toBe(1);
    lessonId = draft.json.lessonId;
    revisionId = draft.json.revisionId;
    created.push(`lesson ${lessonId} "${title}" revision 1 ${revisionId}`);
    return describe("POST", "/api/v1/lessons", draft.response, [`lessonId ${lessonId}`, `revisionId ${revisionId}`]);
  });
  if (!lessonId) return;

  const context = await browser.newContext({ ...PHONE, storageState: signedIn.storageState });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  attachListeners(page, errors, consoleMessages);
  recordPageBodies(page, "shelf");
  const first = () => page.locator(".lesson").first();
  try {
    await page.goto(`${BASE}/`);
    await expect(page.locator("#account-status")).toHaveText(`Signed in as ${signedIn.displayName}`);
    await check("shelf · after a refresh the new draft is first on the shelf, Not started, not Outdated", async () => {
      await expect(first()).toContainText(title);
      await expect(first()).toContainText("Not started");
      await expect(first()).not.toContainText("Outdated");
      return await snap(page, "shelf with audit draft");
    });
    await check("shelf · the Refresh shelf control re-reads the server in place", async () => {
      await page.getByRole("button", { name: "Refresh shelf" }).click();
      await expect(first()).toContainText(title);
      return "Refresh shelf tapped; the draft stayed first";
    });
    await check("shelf · opening the draft shows its overview at the learning URL and caches the revision in IndexedDB", async () => {
      await page.getByRole("button", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
      await expect(page.locator(".overview h1")).toHaveText(title);
      await expect(page).toHaveURL(`${BASE}/learn/${lessonId}`);
      await expect(page.getByRole("button", { name: "Start lesson" })).toBeVisible();
      const cached = (await readStore(page, "lessons")).map((record) => record.id);
      expect(cached).toContain(revisionId);
      expect(await readStore(page, "progress_streams")).toEqual([{ id: lessonId, revisionId, epoch: 0 }]);
      return `IndexedDB lessons has ${revisionId}; progress_streams pins epoch 0; ${await snap(page, "audit draft overview")}`;
    });

    // Airplane mode from the learning URL. A reload needs the cached shell; completing the Concept needs only IndexedDB.
    await context.setOffline(true);
    let offlineReload = "";
    try {
      await page.reload();
      await expect(page.locator(".overview h1")).toHaveText(title, { timeout: 5000 });
      offlineReload = "ok";
    } catch (error) {
      offlineReload = error instanceof Error ? error.message.split("\n")[0] : String(error);
    }
    await check("offline · reloading the learning URL with the network off shows the cached overview", () => {
      expect(offlineReload).toBe("ok");
      return "reload offline rendered the overview from the cached shell and IndexedDB";
    });
    if (offlineReload !== "ok") {
      await context.setOffline(false);
      await page.goto(`${BASE}/learn/${lessonId}`);
      await expect(page.locator(".overview h1")).toHaveText(title);
      await context.setOffline(true);
    }
    await check("offline · with the network off the first Concept completes from IndexedDB", async () => {
      await tap(page, "Start lesson");
      await expect(page.locator(".cardbody h2")).toHaveText("A fresh response can be reused");
      await tap(page, "Continue");
      await tap(page, "Continue");
      await expect(page.locator(".qhead")).toBeVisible();
      await answer(page, true);
      await expect(page.locator(".verdict")).toHaveText("Correct");
      await tap(page, "Continue");
      await expect(page.locator(".cardbody h2")).toHaveText("Validators name a version");
      const events = await readStore(page, "learning_events");
      expect(events.length).toBeGreaterThanOrEqual(4);
      expect(events.every((event) => event.lessonRevisionId === revisionId && event.epoch === 0)).toBe(true);
      return `${events.length} learning events recorded offline against revision 1; ${await snap(page, "concept 2 reached offline")}`;
    });
    await context.setOffline(false);

    // The agent publishes a second revision. Back online, the shelf marks the lesson Outdated.
    const revised = await agent(`/api/v1/lessons/${lessonId}/revisions`, lessonDocument(revisedTitle));
    let revisedId = "";
    await check("shelf · the owner token creates a second revision of the audit lesson", () => {
      expect(revised.response.status).toBe(201);
      expect(revised.json.revisionNumber).toBe(2);
      revisedId = revised.json.revisionId;
      created.push(`lesson ${lessonId} "${revisedTitle}" revision 2 ${revisedId}`);
      return describe("POST", `/api/v1/lessons/${lessonId}/revisions`, revised.response, [`revisionId ${revisedId}`]);
    });
    await page.goto(`${BASE}/`);
    await check("outdated · the shelf marks the lesson In progress and Outdated once a newer revision exists", async () => {
      await expect(first()).toContainText(title);
      await expect(first()).toContainText("In progress");
      await expect(first()).toContainText("Outdated");
      return await snap(page, "shelf outdated");
    });
    await check("outdated · Resume this revision keeps the old revision and its checkpoint", async () => {
      await first().click();
      await expect(page.locator("#outdated-notice")).toBeVisible();
      await page.getByRole("button", { name: "Resume this revision" }).click();
      await expect(page.locator(".shellhead h1")).toHaveText(title);
      await expect(page.locator(".cardbody h2")).toHaveText("Validators name a version");
      await page.getByRole("button", { name: "Close lesson" }).click();
      await expect(first()).toContainText("Outdated");
      expect(await readStore(page, "progress_streams")).toEqual([{ id: lessonId, revisionId, epoch: 0 }]);
      return "resumed at Card 1 of Concept 2 on revision 1; stream still pinned to revision 1, epoch 0";
    });
    await check("discard · Discard asks for confirmation, and Keep my progress changes nothing", async () => {
      await first().click();
      await page.getByRole("button", { name: "Discard progress and start the new revision" }).click();
      await expect(page.locator("#discard-confirm")).toBeVisible();
      const shot = await snap(page, "discard confirmation");
      await page.getByRole("button", { name: "Keep my progress" }).click();
      await expect(page.locator("#discard-confirm")).toHaveCount(0);
      await expect(page.locator("#outdated-notice")).toBeVisible();
      expect(await readStore(page, "progress_streams")).toEqual([{ id: lessonId, revisionId, epoch: 0 }]);
      return shot;
    });
    await check("discard · confirming advances the epoch and opens the new revision from Not started, keeping the old evidence", async () => {
      const before = (await readStore(page, "learning_events")).length;
      await page.getByRole("button", { name: "Discard progress and start the new revision" }).click();
      await page.getByRole("button", { name: "Discard and start the new revision" }).click();
      await expect(page.locator(".overview h1")).toHaveText(revisedTitle);
      await expect(page.locator(".overview .state")).toHaveText("Not started");
      await expect(page.locator("#outdated-notice")).toHaveCount(0);
      expect(await readStore(page, "progress_streams")).toEqual([{ id: lessonId, revisionId: revisedId, epoch: 1 }]);
      expect((await readStore(page, "learning_events")).length).toBe(before);
      expect((await readStore(page, "lessons")).map((record) => record.id)).toContain(revisedId);
      return `stream now revision 2, epoch 1; ${before} old events kept; ${await snap(page, "new revision overview")}`;
    });
    await check("discard · back on the shelf the lesson shows the new title, Not started, without Outdated", async () => {
      await page.getByRole("button", { name: "Back to shelf" }).click();
      await expect(first()).toContainText(revisedTitle);
      await expect(first()).toContainText("Not started");
      await expect(first()).not.toContainText("Outdated");
      return await snap(page, "shelf after discard");
    });
  } finally {
    await context.close();
  }

  // The learning URL for someone who is not signed in.
  const guest = await browser.newContext(PHONE);
  const guestPage = await guest.newPage();
  guestPage.setDefaultTimeout(10000);
  attachListeners(guestPage, errors, consoleMessages);
  recordPageBodies(guestPage, "guest");
  try {
    await guestPage.goto(`${BASE}/learn/${lessonId}`);
    await check("guest · the learning URL of an owned lesson asks a guest to sign in and inlines only the featured demo", async () => {
      await expect(guestPage.locator("h1")).toHaveText("Sign in to open this lesson");
      await expect(guestPage.getByRole("button", { name: "Sign in with a passkey" })).toBeVisible();
      const inlined = await guestPage.evaluate(() => (window as any).__LESSON__?.title ?? null);
      expect(inlined).not.toBe(title);
      expect(inlined).not.toBe(revisedTitle);
      return `inlined lesson for the guest: ${JSON.stringify(inlined)}; ${await snap(guestPage, "guest sign-in prompt")}`;
    });
  } finally {
    await guest.close();
  }
}

// ---------------------------------------------------------------------------------------------
// The ticket 12 learning loop, against production, as a guest on the featured demo lesson.

async function learningLoop(browser: any) {
  const context = await browser.newContext(PHONE);
  const page = await context.newPage();
  let lessonPath = "";
  try {
    await page.goto(`${BASE}/`);
    const inlined = await page.evaluate(() => (window as any).__LESSON__ ?? null);
    await check("learning · the shell inlines the published demo lesson with the fixture's content", () => {
      expect(inlined?.title).toBe("How browser HTTP caching works");
      expect(inlined.concepts.length).toBe(3);
      lessonPath = `/learn/${inlined.lessonId}`;
      return `demo lessonId ${inlined.lessonId}, revisionId ${inlined.revisionId}`;
    });
  } finally {
    await context.close();
  }
  if (!lessonPath) return;
  const before = results.length;
  await fullWalk(browser, BASE, errors, consoleMessages, { lessonPath, timeout: 10000, context: PHONE });
  await drillFromFresh(browser, BASE, errors, consoleMessages, { lessonPath, timeout: 10000, context: PHONE });
  const walk = results.slice(before);
  observe("learning loop", `${walk.filter((result) => result.ok).length} walk checks passed and ${walk.filter((result) => !result.ok).length} failed against production; the walk is the ticket 12 script with the production lesson path.`);
}

// ---------------------------------------------------------------------------------------------
// No secret in any body the audit saw.

async function secretScan() {
  const { values } = await productionSecrets();
  await check("secrets · no value from .env.prod and no token-shaped string appears in any response body", () => {
    const problems = scanBodies(values);
    expect(problems).toEqual([]);
    return `${bodies.length} bodies scanned (${new Set(bodies.map((body) => body.source)).size} distinct requests)`;
  });
  void observations;
}
