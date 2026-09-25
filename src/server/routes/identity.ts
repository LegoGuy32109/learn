// Identity routes: owner-minted invite links, passkey registration and sign-in
// ceremonies, and the browser session they issue. Agents keep using bearer tokens;
// these routes give a browser the same account through a signed cookie.
import type { Dependencies } from "../dependencies.ts";
import { json, jsonBody, problem } from "../http.ts";
import { INVITE_PATH_PREFIX, PasskeyError } from "../identity/passkeys.ts";
import {
  type RelyingParty,
  relyingPartyFor,
} from "../identity/relying-party.ts";
import { invitePage } from "../views/invite.ts";
import { type Route, route } from "./route.ts";

export const INVITE_SCOPE = "account:owner";

function fromPasskeyError(error: unknown): Response {
  if (error instanceof PasskeyError) {
    return problem(error.status, error.title, error.message);
  }
  throw error;
}

/** The relying party for this request, or the problem to send when passkeys cannot work on this origin. */
function relyingParty(
  request: Request,
  dependencies: Dependencies,
): RelyingParty | Response {
  const rp = relyingPartyFor(request, dependencies.relyingParty);
  if (rp) return rp;
  return problem(
    501,
    "Passkeys unavailable",
    "Passkeys work only on the configured origin. Open the site at its canonical address.",
  );
}

/** A state-changing request from another site is refused even before the cookie is consulted. */
function crossSite(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return problem(
      403,
      "Cross-site request",
      "This request must come from the site itself.",
    );
  }
  return null;
}

function body(parsed: unknown): Record<string, unknown> {
  return parsed && typeof parsed === "object"
    ? parsed as Record<string, unknown>
    : {};
}

export function identityRoutes(dependencies: Dependencies): Route[] {
  const { passkeys, sessions } = dependencies;

  const signIn = async (
    request: Request,
    accountId: string,
    displayName: string,
  ): Promise<Response> => {
    const cookie = await sessions.issue(request, { accountId, displayName });
    return json({ signedIn: true, displayName }, 200, {
      "set-cookie": cookie,
      "cache-control": "private, no-store",
    });
  };

  return [
    route("POST", "/api/v1/sign-in-invites", async (request) => {
      const result = await dependencies.auth.authenticate(
        request,
        INVITE_SCOPE,
      );
      if (!result.ok) {
        if (result.reason === "forbidden") {
          return problem(
            403,
            "Insufficient scope",
            `Minting an invite needs the ${INVITE_SCOPE} scope.`,
          );
        }
        return problem(
          401,
          "Authentication required",
          "Use a valid, unexpired, unrevoked bearer token.",
        );
      }
      try {
        const minted = await passkeys.mintInvite(
          result.principal.accountId,
          result.principal.tokenPrefix ?? null,
        );
        const url = new URL(minted.path, request.url).href;
        return json(
          { url, path: minted.path, expiresAt: minted.expiresAt },
          201,
          { "cache-control": "private, no-store" },
        );
      } catch (error) {
        return fromPasskeyError(error);
      }
    }),

    route("GET", `${INVITE_PATH_PREFIX}:token`, async (_request, params) => {
      const lookup = await passkeys.lookupInvite(params.token);
      const status = lookup.state === "valid"
        ? 200
        : lookup.state === "unknown"
        ? 404
        : 410;
      return new Response(invitePage(lookup, params.token), {
        status,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "private, no-store",
        },
      });
    }),

    route("POST", "/api/v1/passkeys/registration-options", async (request) => {
      const refused = crossSite(request);
      if (refused) return refused;
      const rp = relyingParty(request, dependencies);
      if (rp instanceof Response) return rp;
      const parsed = await jsonBody(request);
      if (parsed instanceof Response) return parsed;
      try {
        const options = await passkeys.registrationOptions(
          rp,
          String(body(parsed).invite ?? ""),
        );
        return json({ options }, 200, { "cache-control": "private, no-store" });
      } catch (error) {
        return fromPasskeyError(error);
      }
    }),

    route("POST", "/api/v1/passkeys/registrations", async (request) => {
      const refused = crossSite(request);
      if (refused) return refused;
      const rp = relyingParty(request, dependencies);
      if (rp instanceof Response) return rp;
      const parsed = await jsonBody(request);
      if (parsed instanceof Response) return parsed;
      try {
        const signedIn = await passkeys.register(
          rp,
          String(body(parsed).invite ?? ""),
          body(parsed).credential,
        );
        return await signIn(
          request,
          signedIn.account.id,
          signedIn.account.displayName,
        );
      } catch (error) {
        return fromPasskeyError(error);
      }
    }),

    route(
      "POST",
      "/api/v1/passkeys/authentication-options",
      async (request) => {
        const refused = crossSite(request);
        if (refused) return refused;
        const rp = relyingParty(request, dependencies);
        if (rp instanceof Response) return rp;
        const options = await passkeys.authenticationOptions(rp);
        return json({ options }, 200, { "cache-control": "private, no-store" });
      },
    ),

    route("POST", "/api/v1/passkeys/authentications", async (request) => {
      const refused = crossSite(request);
      if (refused) return refused;
      const rp = relyingParty(request, dependencies);
      if (rp instanceof Response) return rp;
      const parsed = await jsonBody(request);
      if (parsed instanceof Response) return parsed;
      try {
        const signedIn = await passkeys.authenticate(
          rp,
          body(parsed).credential,
        );
        return await signIn(
          request,
          signedIn.account.id,
          signedIn.account.displayName,
        );
      } catch (error) {
        return fromPasskeyError(error);
      }
    }),

    route("GET", "/api/v1/session", async (request) => {
      const session = await sessions.read(request);
      return json(
        {
          signedIn: session != null,
          displayName: session?.displayName ?? null,
        },
        200,
        { "cache-control": "private, no-store" },
      );
    }),

    route("DELETE", "/api/v1/session", async (request) => {
      const refused = crossSite(request);
      if (refused) return refused;
      return json({ signedIn: false, displayName: null }, 200, {
        "set-cookie": sessions.clear(request),
        "cache-control": "private, no-store",
      });
    }),
  ];
}
