// Passkey sign-in against an ephemeral learn-test-<uuid> database: migration 002,
// owner-scoped invite minting through real tokens, a registration and sign-in
// ceremony run by the software authenticator, and the rows they leave behind.
// The database is deleted in `finally`. Nothing here prints a token.

import type {
  AuthenticationOptionsReply,
  InviteReply,
  Problem,
  RegistrationOptionsReply,
  SessionReply,
} from "../../src/shared/api/v1.d.ts";
import { readJson } from "../support/json.ts";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../../src/app.ts";
import { TokenAdmin } from "../../src/server/identity/token-admin.ts";
import {
  INVITE_TTL_MS,
  PasskeyService,
} from "../../src/server/identity/passkeys.ts";
import { redactBearerTokens } from "../../src/server/identity/redaction.ts";
import { TursoIdentityRepository } from "../../src/server/repositories/identity.ts";
import { SoftwareAuthenticator } from "../support/software-authenticator.ts";
import { tursoDependencies } from "./support/dependencies.ts";
import { createAccount, createEphemeralDatabase } from "./support/ephemeral.ts";

const ORIGIN = "http://localhost";
const RP = { origin: ORIGIN, rpId: "localhost" };

Deno.test("passkey sign-in in an ephemeral database", async (t) => {
  const ephemeral = await createEphemeralDatabase();
  const { db } = ephemeral;
  try {
    let now = Date.now();
    const clock = () => now;
    const accountId = await createAccount(db, "Josh Hale");
    const admin = new TokenAdmin(db, clock);
    const repository = new TursoIdentityRepository(db);
    const app = createApp({
      ...tursoDependencies(db, clock),
      passkeys: new PasskeyService(repository, clock),
    });
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
    const mint = (token: string) =>
      call("/api/v1/sign-in-invites", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    const owner = await admin.mint({
      accountId,
      name: "owner",
      scopes: ["lessons:read", "account:owner"],
    });
    const reader = await admin.mint({
      accountId,
      name: "reader",
      scopes: ["lessons:read", "lessons:write"],
    });
    const authenticator = await SoftwareAuthenticator.create();
    let inviteToken = "";
    let cookie = "";

    await t.step("migration 002 applied and 001 is untouched", async () => {
      const versions = await db.execute(
        "SELECT version FROM schema_migrations ORDER BY version",
      );
      assertEquals(
        versions.rows.map((row) => String(row.version)).slice(0, 2),
        ["001_initial.sql", "002_passkeys_and_invites.sql"],
      );
      const tables = await db.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('passkey_credentials', 'sign_in_invites', 'webauthn_challenges') ORDER BY name",
      );
      assertEquals(tables.rows.map((row) => String(row.name)), [
        "passkey_credentials",
        "sign_in_invites",
        "webauthn_challenges",
      ]);
    });

    await t.step(
      "only an owner-scoped token mints an invite; 403 without the scope, 401 for an invalid token",
      async () => {
        const forbidden = await mint(reader.token);
        assertEquals(forbidden.status, 403);
        assert(!(await forbidden.text()).includes(reader.token));
        const invalid = await mint("learn_pat_0000000000_" + "A".repeat(43));
        assertEquals(invalid.status, 401);
        await invalid.body?.cancel();
        const minted = await mint(owner.token);
        assertEquals(minted.status, 201);
        const body = await readJson<InviteReply>(minted);
        inviteToken = String(body.path).slice("/sign-in/".length);
        assertEquals(body.expiresAt, now + INVITE_TTL_MS);
        const row = await db.execute(
          "SELECT account_id, minted_by_token_prefix, consumed_at, token_hash FROM sign_in_invites",
        );
        assertEquals(row.rows.length, 1);
        assertEquals(String(row.rows[0].account_id), accountId);
        assertEquals(
          String(row.rows[0].minted_by_token_prefix),
          owner.metadata.prefix,
        );
        assertEquals(row.rows[0].consumed_at, null);
        assert(
          !String(row.rows[0].token_hash).includes(inviteToken),
          "the invite token is stored in the clear",
        );
      },
    );

    await t.step(
      "a replayed registration challenge and a wrong origin are rejected",
      async () => {
        const options = await post("/api/v1/passkeys/registration-options", {
          invite: inviteToken,
        });
        assertEquals(options.status, 200);
        const { options: creation } = await readJson<RegistrationOptionsReply>(
          options,
        );
        const wrongOrigin = await authenticator.register(creation, {
          origin: "https://evil.example",
          rpId: "localhost",
        });
        const rejected = await post("/api/v1/passkeys/registrations", {
          invite: inviteToken,
          credential: wrongOrigin,
        });
        assertEquals(rejected.status, 400);
        await rejected.body?.cancel();
        const replayed = await post("/api/v1/passkeys/registrations", {
          invite: inviteToken,
          credential: await authenticator.register(creation, RP),
        });
        assertEquals(replayed.status, 401);
        assertStringIncludes(
          (await readJson<Problem>(replayed)).detail,
          "challenge",
        );
        assertEquals(
          (await db.execute("SELECT COUNT(*) AS n FROM passkey_credentials"))
            .rows[0].n,
          0,
        );
      },
    );

    await t.step(
      "registration stores id, public key, sign count and creation time, consumes the invite and signs in",
      async () => {
        const options = await post("/api/v1/passkeys/registration-options", {
          invite: inviteToken,
        });
        const { options: creation } = await readJson<RegistrationOptionsReply>(
          options,
        );
        const registered = await post("/api/v1/passkeys/registrations", {
          invite: inviteToken,
          credential: await authenticator.register(creation, RP),
        });
        assertEquals(registered.status, 200);
        assertEquals(
          (await readJson<SessionReply>(registered)).displayName,
          "Josh Hale",
        );
        const setCookie = registered.headers.get("set-cookie") ?? "";
        assertStringIncludes(setCookie, "HttpOnly");
        assertStringIncludes(setCookie, "SameSite=Lax");
        cookie = setCookie.split(";")[0];

        const row = (await db.execute("SELECT * FROM passkey_credentials"))
          .rows[0] as Record<string, unknown>;
        assertEquals(String(row.id), authenticator.id);
        assertEquals(String(row.account_id), accountId);
        assertEquals(Number(row.sign_count), 0);
        assertEquals(Number(row.created_at), now);
        assertEquals(row.last_used_at, null);
        const stored = await repository.credential(authenticator.id);
        assert(stored && stored.publicKey.byteLength > 0);
        assertEquals(
          Number(
            (await db.execute("SELECT consumed_at FROM sign_in_invites"))
              .rows[0].consumed_at,
          ),
          now,
        );

        const session = await call("/api/v1/session", { headers: { cookie } });
        assertEquals(await readJson<SessionReply>(session), {
          signedIn: true,
          displayName: "Josh Hale",
        });
      },
    );

    await t.step(
      "a second use and a late invite get a clear page",
      async () => {
        const used = await call(`/sign-in/${inviteToken}`);
        assertEquals(used.status, 410);
        assertStringIncludes(await used.text(), "already used");
        const late = await readJson<InviteReply>(await mint(owner.token));
        now += INVITE_TTL_MS;
        const expired = await call(late.path);
        assertEquals(expired.status, 410);
        assertStringIncludes(await expired.text(), "expired");
      },
    );

    await t.step(
      "sign-in with the passkey advances the sign count and a replayed assertion fails",
      async () => {
        const options = await post(
          "/api/v1/passkeys/authentication-options",
          {},
        );
        const { options: request } = await readJson<AuthenticationOptionsReply>(
          options,
        );
        const credential = await authenticator.assert(request, RP);
        const signedIn = await post("/api/v1/passkeys/authentications", {
          credential,
        });
        assertEquals(signedIn.status, 200);
        assert(
          (signedIn.headers.get("set-cookie") ?? "").includes(
            "learn_session=v1.",
          ),
        );
        await signedIn.body?.cancel();
        const row = (await db.execute(
          "SELECT sign_count, last_used_at FROM passkey_credentials",
        )).rows[0];
        assertEquals(Number(row.sign_count), authenticator.signCount);
        assertEquals(Number(row.last_used_at), now);
        const replayed = await post("/api/v1/passkeys/authentications", {
          credential,
        });
        assertEquals(replayed.status, 401);
        await replayed.body?.cancel();
        assertEquals(
          (await db.execute("SELECT COUNT(*) AS n FROM webauthn_challenges"))
            .rows[0].n,
          0,
        );
      },
    );

    await t.step(
      "a tampered cookie is a guest; sign-out clears the cookie",
      async () => {
        const tampered = await call("/api/v1/session", {
          headers: { cookie: cookie.slice(0, -3) + "xyz" },
        });
        assertEquals(await readJson<SessionReply>(tampered), {
          signedIn: false,
          displayName: null,
        });
        const intact = await call("/api/v1/session", { headers: { cookie } });
        assertEquals((await readJson<SessionReply>(intact)).signedIn, true);
        const signedOut = await call("/api/v1/session", {
          method: "DELETE",
          headers: { cookie, origin: ORIGIN },
        });
        assertStringIncludes(
          signedOut.headers.get("set-cookie") ?? "",
          "Max-Age=0",
        );
        await signedOut.body?.cancel();
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
    await ephemeral.destroy();
  }
});
