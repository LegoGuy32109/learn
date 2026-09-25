// WebAuthn relying-party configuration. A passkey is bound forever to the RP ID it
// was registered under, so the ID and the accepted origins are pinned per deployment
// through WEBAUTHN_RP_ID and WEBAUTHN_ORIGINS rather than derived from request headers.
// Without that configuration only plain `localhost` works, which keeps local
// development and the browser tests credential-free.

export const RP_NAME = "learn.joshhale.me";

export interface RelyingParty {
  rpId: string;
  rpName: string;
  /** The exact origins passkey ceremonies may come from. */
  expectedOrigins: string[];
}

export interface RelyingPartyEnvironment {
  rpId?: string;
  origins?: string;
}

/** Read the pinned configuration. Returns null when either variable is unset or empty. */
export function configuredRelyingParty(
  environment: RelyingPartyEnvironment,
): RelyingParty | null {
  const rpId = environment.rpId?.trim();
  const origins = (environment.origins ?? "").split(",").map((origin) =>
    origin.trim()
  ).filter(Boolean);
  if (!rpId || !origins.length) return null;
  return { rpId, rpName: RP_NAME, expectedOrigins: origins };
}

/**
 * Resolve the relying party for one request. A configured relying party is used as is.
 * Without configuration the request is accepted only when it targets `localhost`.
 * Returns null when the request origin is not allowed, and callers answer with a
 * clear problem instead of running a ceremony that could never verify.
 */
export function relyingPartyFor(
  request: Request,
  configured: RelyingParty | null,
): RelyingParty | null {
  const url = new URL(request.url);
  const requestOrigin = request.headers.get("origin") ?? url.origin;
  if (configured) {
    return configured.expectedOrigins.includes(requestOrigin)
      ? configured
      : null;
  }
  if (url.hostname !== "localhost") return null;
  if (new URL(requestOrigin).hostname !== "localhost") return null;
  return {
    rpId: "localhost",
    rpName: RP_NAME,
    expectedOrigins: [requestOrigin],
  };
}
