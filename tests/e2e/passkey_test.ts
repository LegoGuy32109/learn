// Phone-sized passkey flow through a real Chromium with a virtual platform authenticator:
// open a one-time invite, register a passkey, land on the shelf signed in, reload and stay
// signed in, sign out to the guest shelf, and sign back in with the passkey.
import { chromium, expect } from "@playwright/test";
import { createApp, FIXTURE_ACCOUNT, fixtureDependencies } from "../../src/app.ts";
import { stubAuthenticator } from "../support/stub-auth.ts";

const PORT = 8003;
// The relying-party ID for an unconfigured server is "localhost", so the browser must use that host, not 127.0.0.1.
const BASE = `http://localhost:${PORT}`;
const OWNER = "e2e-owner-token";

Deno.test({ name: "phone registers a passkey from an invite, stays signed in across reloads, signs out and back in", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const dependencies = await fixtureDependencies();
  dependencies.auth = stubAuthenticator({ [OWNER]: { accountId: FIXTURE_ACCOUNT.id, scopes: ["account:owner"] } });
  const server = Deno.serve({ port: PORT }, createApp(dependencies));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
    });

    const minted = await fetch(`${BASE}/api/v1/sign-in-invites`, { method: "POST", headers: { authorization: `Bearer ${OWNER}` } });
    expect(minted.status).toBe(201);
    const invite = await minted.json();
    expect(invite.url.startsWith(`${BASE}/sign-in/`)).toBe(true);

    await page.goto(invite.url);
    await expect(page.getByText("Invite for Josh")).toBeVisible();
    await page.getByRole("button", { name: "Register a passkey" }).click();
    await page.waitForURL(`${BASE}/`);
    await expect(page.locator("#account-status")).toHaveText("Signed in as Josh");
    const cookie = (await context.cookies()).find((candidate) => candidate.name === "learn_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.secure).toBe(false);

    await page.reload();
    await expect(page.locator("#account-status")).toHaveText("Signed in as Josh");

    await page.goto(invite.url);
    await expect(page.getByText("already used")).toBeVisible();
    await page.goto(`${BASE}/`);
    await expect(page.locator("#account-status")).toHaveText("Signed in as Josh");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.locator("#account-status")).toHaveText("Guest");
    await page.reload();
    await expect(page.locator("#account-status")).toHaveText("Guest");
    expect((await context.cookies()).some((candidate) => candidate.name === "learn_session")).toBe(false);

    await page.getByRole("button", { name: "Sign in with a passkey" }).click();
    await expect(page.locator("#account-status")).toHaveText("Signed in as Josh");
    await page.reload();
    await expect(page.locator("#account-status")).toHaveText("Signed in as Josh");
    const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
    expect(credentials.length).toBe(1);
    expect(credentials[0].signCount).toBeGreaterThan(0);

    await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  } finally {
    await browser.close();
    await server.shutdown();
  }
} });
