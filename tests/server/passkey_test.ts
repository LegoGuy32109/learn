// Invite, registration, sign-in and session-cookie behaviour against the in-memory
// identity repository. A software authenticator runs the ceremonies so the tests can
// choose the origin, the relying-party ID and the challenge they present.

import type {
  AuthenticationOptionsReply,
  InviteReply,
  Problem,
  RegistrationOptionsReply,
  SessionReply,
} from "../../src/shared/api/v1.d.ts";
import { readJson } from "../support/json.ts";
import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";
import {
  createApp,
  FIXTURE_ACCOUNT,
  fixtureDependencies,
} from "../../src/app.ts";
import {
  INVITE_TTL_MS,
  PasskeyService,
} from "../../src/server/identity/passkeys.ts";
import {
  HmacSessionCookies,
  randomSessionKey,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "../../src/server/identity/sessions.ts";
import {
  configuredRelyingParty,
  relyingPartyFor,
} from "../../src/server/identity/relying-party.ts";
import { redactBearerTokens } from "../../src/server/identity/redaction.ts";
import { MemoryIdentityRepository } from "../../src/server/repositories/identity.ts";
import { SoftwareAuthenticator } from "../support/software-authenticator.ts";
import { stubAuthenticator } from "../support/stub-auth.ts";

const ORIGIN = "http://localhost";
const RP = { origin: ORIGIN, rpId: "localhost" };
const OWNER = "owner-token";
const READER = "reader-token";

async function harness(
  relyingParty: ReturnType<typeof configuredRelyingParty> = null,
) {
  let now = Date.parse("2026-09-21T12:00:00Z");
  const clock = () => now;
  const repository = new MemoryIdentityRepository([FIXTURE_ACCOUNT]);
  const dependencies = {
    ...await fixtureDependencies(),
    auth: stubAuthenticator({
      [OWNER]: {
        accountId: FIXTURE_ACCOUNT.id,
        scopes: ["lessons:read", "account:owner"],
        prefix: "ownerpref1",
      },
      [READER]: { accountId: FIXTURE_ACCOUNT.id, scopes: ["lessons:read"] },
    }),
    sessions: new HmacSessionCookies(randomSessionKey(), clock),
    passkeys: new PasskeyService(repository, clock),
    relyingParty,
  };
  const app = createApp(dependencies);
  const call = (path: string, init: RequestInit = {}) =>
    app(new Request(`${ORIGIN}${path}`, init));
  const post = (
    path: string,
    payload: unknown,
    headers: Record<string, string> = {},
  ) =>
    call(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...headers,
      },
      body: JSON.stringify(payload),
    });
  /** Mint an invite. The body is what the caller expects: the invite by default, or a problem. */
  const mint = async <T = InviteReply>(token = OWNER) => {
    const response = await call("/api/v1/sign-in-invites", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    return { status: response.status, body: await readJson<T>(response) };
  };
  return {
    app,
    call,
    post,
    mint,
    repository,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function cookieHeader(setCookie: string | null): Record<string, string> {
  assert(setCookie, "no Set-Cookie header");
  return { cookie: setCookie.split(";")[0] };
}

async function registerThrough(
  h: Awaited<ReturnType<typeof harness>>,
  invite: string,
  authenticator: SoftwareAuthenticator,
  ceremony = RP,
) {
  const options = await h.post("/api/v1/passkeys/registration-options", {
    invite,
  });
  assertEquals(options.status, 200);
  const { options: creation } = await readJson<RegistrationOptionsReply>(
    options,
  );
  const credential = await authenticator.register(creation, ceremony);
  return h.post("/api/v1/passkeys/registrations", { invite, credential });
}

async function signInThrough(
  h: Awaited<ReturnType<typeof harness>>,
  authenticator: SoftwareAuthenticator,
  ceremony = RP,
  signCount?: number,
) {
  const options = await h.post("/api/v1/passkeys/authentication-options", {});
  assertEquals(options.status, 200);
  const { options: request } = await readJson<AuthenticationOptionsReply>(
    options,
  );
  const credential = await authenticator.assert(request, ceremony, signCount);
  return h.post("/api/v1/passkeys/authentications", { credential });
}

Deno.test("minting an invite needs an owner-scoped token: 401 invalid, 403 without the scope", async () => {
  const h = await harness();
  assertEquals((await h.mint("not-a-token")).status, 401);
  const anonymous = await h.call("/api/v1/sign-in-invites", { method: "POST" });
  assertEquals(anonymous.status, 401);
  await anonymous.body?.cancel();
  const forbidden = await h.mint<Problem>(READER);
  assertEquals(forbidden.status, 403);
  assertStringIncludes(forbidden.body.detail, "account:owner");
  const minted = await h.mint();
  assertEquals(minted.status, 201);
  assertMatch(minted.body.path, /^\/sign-in\/[A-Za-z0-9_-]{43}$/);
  assertEquals(minted.body.url, `${ORIGIN}${minted.body.path}`);
  assertEquals(
    minted.body.expiresAt,
    Date.parse("2026-09-21T12:00:00Z") + INVITE_TTL_MS,
  );
});

Deno.test("an invite page registers once, then reports used, expired or unknown as a plain page", async () => {
  const h = await harness();
  const { body: minted } = await h.mint();
  const valid = await h.call(minted.path);
  assertEquals(valid.status, 200);
  const validPage = await valid.text();
  assertStringIncludes(validPage, "Register a passkey");
  assertStringIncludes(validPage, "Invite for Josh");

  const unknown = await h.call("/sign-in/" + "x".repeat(43));
  assertEquals(unknown.status, 404);
  assertStringIncludes(await unknown.text(), "not valid");
  const garbage = await h.call("/sign-in/short");
  assertEquals(garbage.status, 404);
  await garbage.body?.cancel();

  const registered = await registerThrough(
    h,
    minted.path.slice("/sign-in/".length),
    await SoftwareAuthenticator.create(),
  );
  assertEquals(registered.status, 200);
  await registered.body?.cancel();
  const used = await h.call(minted.path);
  assertEquals(used.status, 410);
  const usedPage = await used.text();
  assertStringIncludes(usedPage, "already used");
  assert(!/at .*\.ts:\d+/.test(usedPage), "page contains a stack frame");
  const usedApi = await h.post("/api/v1/passkeys/registration-options", {
    invite: minted.path.slice("/sign-in/".length),
  });
  assertEquals(usedApi.status, 410);
  await usedApi.body?.cancel();

  const { body: late } = await h.mint();
  h.advance(INVITE_TTL_MS);
  const expired = await h.call(late.path);
  assertEquals(expired.status, 410);
  assertStringIncludes(await expired.text(), "expired");
  const expiredApi = await h.post("/api/v1/passkeys/registration-options", {
    invite: late.path.slice("/sign-in/".length),
  });
  assertEquals(expiredApi.status, 410);
  assertStringIncludes((await readJson<Problem>(expiredApi)).detail, "expired");
});

Deno.test("registration then sign-in issue a signed HttpOnly SameSite=Lax cookie that the shell honours", async () => {
  const h = await harness();
  const authenticator = await SoftwareAuthenticator.create();
  const { body: minted } = await h.mint();
  const registered = await registerThrough(
    h,
    minted.path.slice("/sign-in/".length),
    authenticator,
  );
  assertEquals(registered.status, 200);
  assertEquals((await readJson<SessionReply>(registered)).displayName, "Josh");
  const setCookie = registered.headers.get("set-cookie");
  assert(setCookie);
  assertStringIncludes(setCookie, `${SESSION_COOKIE}=v1.`);
  assertStringIncludes(setCookie, "HttpOnly");
  assertStringIncludes(setCookie, "SameSite=Lax");
  assertStringIncludes(setCookie, "Path=/");
  assert(!setCookie.includes("Secure"), "localhost cookie must not be Secure");

  const stored = await h.repository.credential(authenticator.id);
  assert(stored);
  assertEquals(stored.accountId, FIXTURE_ACCOUNT.id);
  assertEquals(stored.signCount, 0);
  assertEquals(stored.createdAt, Date.parse("2026-09-21T12:00:00Z"));
  assert(stored.publicKey.byteLength > 0);

  const shell = await h.call("/", { headers: cookieHeader(setCookie) });
  assertStringIncludes(
    await shell.text(),
    '"signedIn":true,"displayName":"Josh"',
  );
  const guest = await h.call("/");
  assertStringIncludes(await guest.text(), '"signedIn":false');

  const session = await h.call("/api/v1/session", {
    headers: cookieHeader(setCookie),
  });
  assertEquals(await readJson<SessionReply>(session), {
    signedIn: true,
    displayName: "Josh",
  });

  const signedOut = await h.call("/api/v1/session", {
    method: "DELETE",
    headers: { ...cookieHeader(setCookie), origin: ORIGIN },
  });
  assertEquals(signedOut.status, 200);
  assertStringIncludes(signedOut.headers.get("set-cookie") ?? "", "Max-Age=0");
  await signedOut.body?.cancel();

  const signedIn = await signInThrough(h, authenticator);
  assertEquals(signedIn.status, 200);
  assertEquals((await readJson<SessionReply>(signedIn)).displayName, "Josh");
  const after = await h.repository.credential(authenticator.id);
  assertEquals(after?.signCount, 1);
  assertEquals(after?.lastUsedAt, Date.parse("2026-09-21T12:00:00Z"));
});

Deno.test("a tampered or expired cookie signs the browser out", async () => {
  const h = await harness();
  const authenticator = await SoftwareAuthenticator.create();
  const { body: minted } = await h.mint();
  const registered = await registerThrough(
    h,
    minted.path.slice("/sign-in/".length),
    authenticator,
  );
  const setCookie = registered.headers.get("set-cookie")!;
  await registered.body?.cancel();
  const value = setCookie.split(";")[0].slice(SESSION_COOKIE.length + 1);
  const [version, payload, signature] = value.split(".");

  const forgedPayload = btoa(
    JSON.stringify({
      accountId: "someone-else",
      displayName: "Mallory",
      issuedAt: 0,
      expiresAt: Date.parse("2099-01-01"),
    }),
  )
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const tampered = [
    `${version}.${forgedPayload}.${signature}`,
    `${version}.${payload}.${signature.slice(0, -2)}AA`,
    `${version}.${payload}`,
    "garbage",
  ];
  for (const candidate of tampered) {
    const response = await h.call("/api/v1/session", {
      headers: { cookie: `${SESSION_COOKIE}=${candidate}` },
    });
    assertEquals(
      await readJson<SessionReply>(response),
      { signedIn: false, displayName: null },
      `accepted ${candidate.slice(0, 20)}`,
    );
  }
  const intact = await h.call("/api/v1/session", {
    headers: cookieHeader(setCookie),
  });
  assertEquals((await readJson<SessionReply>(intact)).signedIn, true);
  h.advance(SESSION_TTL_MS);
  const expired = await h.call("/api/v1/session", {
    headers: cookieHeader(setCookie),
  });
  assertEquals((await readJson<SessionReply>(expired)).signedIn, false);
});

Deno.test("cookies are Secure everywhere except plain localhost", async () => {
  const h = await harness();
  const remote = await h.app(
    new Request("https://learn.joshhale.me/api/v1/session", {
      method: "DELETE",
      headers: { origin: "https://learn.joshhale.me" },
    }),
  );
  assertStringIncludes(remote.headers.get("set-cookie") ?? "", "Secure");
  await remote.body?.cancel();
  const lan = await h.app(
    new Request("http://192.168.1.20:8000/api/v1/session", {
      method: "DELETE",
    }),
  );
  assertStringIncludes(lan.headers.get("set-cookie") ?? "", "Secure");
  await lan.body?.cancel();
  const local = await h.call("/api/v1/session", { method: "DELETE" });
  assert(!(local.headers.get("set-cookie") ?? "").includes("Secure"));
  await local.body?.cancel();
});

Deno.test("a replayed challenge is rejected for registration and for sign-in", async () => {
  const h = await harness();
  const authenticator = await SoftwareAuthenticator.create();
  const { body: minted } = await h.mint();
  const options = await h.post("/api/v1/passkeys/registration-options", {
    invite: minted.path.slice("/sign-in/".length),
  });
  const { options: creation } = await readJson<RegistrationOptionsReply>(
    options,
  );
  const wrongOrigin = await authenticator.register(creation, {
    origin: "https://evil.example",
    rpId: "localhost",
  });
  const first = await h.post("/api/v1/passkeys/registrations", {
    invite: minted.path.slice("/sign-in/".length),
    credential: wrongOrigin,
  });
  assertEquals(first.status, 400);
  await first.body?.cancel();
  const replayed = await authenticator.register(creation, RP);
  const second = await h.post("/api/v1/passkeys/registrations", {
    invite: minted.path.slice("/sign-in/".length),
    credential: replayed,
  });
  assertEquals(second.status, 401);
  assertStringIncludes((await readJson<Problem>(second)).detail, "challenge");
  assertEquals(
    (await h.call(minted.path)).status,
    200,
    "the invite survives a failed ceremony",
  );

  const registered = await registerThrough(
    h,
    minted.path.slice("/sign-in/".length),
    authenticator,
  );
  assertEquals(registered.status, 200);
  await registered.body?.cancel();

  const request = await h.post("/api/v1/passkeys/authentication-options", {});
  const { options: assertion } = await readJson<AuthenticationOptionsReply>(
    request,
  );
  const credential = await authenticator.assert(assertion, RP);
  const ok = await h.post("/api/v1/passkeys/authentications", { credential });
  assertEquals(ok.status, 200);
  await ok.body?.cancel();
  const again = await h.post("/api/v1/passkeys/authentications", {
    credential,
  });
  assertEquals(again.status, 401);
  assertStringIncludes((await readJson<Problem>(again)).detail, "challenge");
  assert(!again.headers.get("set-cookie"));
});

Deno.test("a wrong origin or relying-party ID fails verification, and the sign count must advance", async () => {
  const h = await harness();
  const authenticator = await SoftwareAuthenticator.create();
  const { body: minted } = await h.mint();
  const badRp = await registerThrough(
    h,
    minted.path.slice("/sign-in/".length),
    authenticator,
    { origin: ORIGIN, rpId: "evil.example" },
  );
  assertEquals(badRp.status, 400);
  await badRp.body?.cancel();
  const registered = await registerThrough(
    h,
    minted.path.slice("/sign-in/".length),
    authenticator,
  );
  assertEquals(registered.status, 200);
  await registered.body?.cancel();

  const wrongOrigin = await signInThrough(h, authenticator, {
    origin: "https://evil.example",
    rpId: "localhost",
  });
  assertEquals(wrongOrigin.status, 400);
  assert(!wrongOrigin.headers.get("set-cookie"));
  await wrongOrigin.body?.cancel();
  const wrongRp = await signInThrough(h, authenticator, {
    origin: ORIGIN,
    rpId: "evil.example",
  });
  assertEquals(wrongRp.status, 400);
  await wrongRp.body?.cancel();

  const good = await signInThrough(h, authenticator);
  assertEquals(good.status, 200);
  await good.body?.cancel();
  const stale = await signInThrough(h, authenticator, RP, 1);
  assertEquals(stale.status, 400);
  await stale.body?.cancel();
  assertEquals(
    (await h.repository.credential(authenticator.id))?.signCount,
    authenticator.signCount,
  );

  const stranger = await SoftwareAuthenticator.create();
  const unknown = await signInThrough(h, stranger);
  assertEquals(unknown.status, 401);
  await unknown.body?.cancel();
});

Deno.test("passkeys are refused off the configured origin, and cross-site posts are refused", async () => {
  const unconfigured = await harness();
  const lan = await unconfigured.app(
    new Request(
      "http://192.168.1.20:8000/api/v1/passkeys/authentication-options",
      { method: "POST" },
    ),
  );
  assertEquals(lan.status, 501);
  await lan.body?.cancel();
  const crossSite = await unconfigured.post(
    "/api/v1/passkeys/authentication-options",
    {},
    { origin: "https://evil.example" },
  );
  assertEquals(crossSite.status, 403);
  await crossSite.body?.cancel();

  const pinned = configuredRelyingParty({
    rpId: "learn.joshhale.me",
    origins: "https://learn.joshhale.me, https://learn-dev.deno.dev",
  });
  assertEquals(pinned?.expectedOrigins, [
    "https://learn.joshhale.me",
    "https://learn-dev.deno.dev",
  ]);
  assertEquals(configuredRelyingParty({ rpId: "learn.joshhale.me" }), null);
  assertEquals(
    configuredRelyingParty({ origins: "https://learn.joshhale.me" }),
    null,
  );
  assertEquals(
    relyingPartyFor(
      new Request("https://learn.joshhale.me/x", {
        headers: { origin: "https://learn.joshhale.me" },
      }),
      pinned,
    )?.rpId,
    "learn.joshhale.me",
  );
  assertEquals(
    relyingPartyFor(
      new Request("https://other.example/x", {
        headers: { origin: "https://other.example" },
      }),
      pinned,
    ),
    null,
  );
  assertEquals(
    relyingPartyFor(new Request("http://localhost:8000/x"), pinned),
    null,
  );
  assertEquals(
    relyingPartyFor(new Request("http://localhost:8000/x"), null)
      ?.expectedOrigins,
    ["http://localhost:8000"],
  );
  assertEquals(
    relyingPartyFor(new Request("http://127.0.0.1:8000/x"), null),
    null,
  );

  const configured = await harness(pinned);
  const wrongHost = await configured.post(
    "/api/v1/passkeys/authentication-options",
    {},
  );
  assertEquals(wrongHost.status, 501);
  await wrongHost.body?.cancel();
});

Deno.test("redaction hides invite links and session cookies", () => {
  const token = "A".repeat(43);
  const redacted = redactBearerTokens(
    `open http://localhost/sign-in/${token} cookie learn_session=v1.abc.def; Path=/`,
  );
  assert(!redacted.includes(token));
  assertStringIncludes(redacted, "/sign-in/[redacted]");
  assertStringIncludes(redacted, "learn_session=[redacted]; Path=/");
});
