// One-time invites and WebAuthn ceremonies. An invite is minted for an existing
// account by an owner-scoped bearer token, lives ten minutes and is consumed by the
// registration that succeeds with it. Registration and sign-in bind each ceremony to
// one server-issued challenge and verify origin and relying-party ID through
// @simplewebauthn/server. Only the credential id, public key, sign count and times
// are stored.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { Account, IdentityRepository, Invite } from "../repositories/identity.ts";
import { base64Url, fromBase64Url, sha256Hex } from "./encoding.ts";
import type { RelyingParty } from "./relying-party.ts";

export const INVITE_TTL_MS = 10 * 60 * 1000;
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const INVITE_PATH_PREFIX = "/sign-in/";

const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

type RegistrationResponse = Parameters<typeof verifyRegistrationResponse>[0]["response"];
type AuthenticationResponse = Parameters<typeof verifyAuthenticationResponse>[0]["response"];
type Transports = NonNullable<Parameters<typeof verifyAuthenticationResponse>[0]["credential"]["transports"]>;

/** A ceremony or invite failure the route maps to one problem response. Never carries a secret. */
export class PasskeyError extends Error {
  constructor(public status: number, public title: string, message: string) {
    super(message);
    this.name = "PasskeyError";
  }
}

export interface MintedInvite {
  token: string;
  path: string;
  expiresAt: number;
}

export type InviteLookup =
  | { state: "valid"; invite: Invite; account: Account }
  | { state: "unknown" | "expired" | "used" };

export interface SignedIn {
  account: Account;
  credentialId: string;
}

function decodeClientDataChallenge(clientDataJSON: unknown): string | null {
  if (typeof clientDataJSON !== "string") return null;
  const bytes = fromBase64Url(clientDataJSON);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return typeof parsed.challenge === "string" ? parsed.challenge : null;
  } catch {
    return null;
  }
}

function malformed(kind: string): PasskeyError {
  return new PasskeyError(400, "Malformed credential", `The ${kind} response is not a WebAuthn credential.`);
}

export class PasskeyService {
  constructor(private repository: IdentityRepository, private clock: () => number = Date.now) {}

  /** Mint a one-time invite for an existing account. The token exists only in the returned value. */
  async mintInvite(accountId: string, mintedByPrefix: string | null): Promise<MintedInvite> {
    const account = await this.repository.account(accountId);
    if (!account) throw new PasskeyError(404, "Account not found", "An invite can be minted only for an existing account.");
    const now = this.clock();
    const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const invite: Invite = { id: crypto.randomUUID(), accountId, createdAt: now, expiresAt: now + INVITE_TTL_MS, consumedAt: null };
    await this.repository.insertInvite(invite, await sha256Hex(token), mintedByPrefix);
    return { token, path: `${INVITE_PATH_PREFIX}${token}`, expiresAt: invite.expiresAt };
  }

  /** Classify an invite token without consuming it. */
  async lookupInvite(token: string): Promise<InviteLookup> {
    if (!INVITE_TOKEN.test(token)) return { state: "unknown" };
    const invite = await this.repository.inviteByHash(await sha256Hex(token));
    if (!invite) return { state: "unknown" };
    if (invite.consumedAt != null) return { state: "used" };
    if (invite.expiresAt <= this.clock()) return { state: "expired" };
    const account = await this.repository.account(invite.accountId);
    if (!account) return { state: "unknown" };
    return { state: "valid", invite, account };
  }

  private async requireInvite(token: string): Promise<{ invite: Invite; account: Account }> {
    const lookup = await this.lookupInvite(token);
    if (lookup.state === "valid") return lookup;
    if (lookup.state === "used") throw new PasskeyError(410, "Invite already used", "This invite link was already used. Ask for a new one.");
    if (lookup.state === "expired") throw new PasskeyError(410, "Invite expired", "This invite link has expired. Ask for a new one.");
    throw new PasskeyError(404, "Invite not found", "This invite link is not valid.");
  }

  async registrationOptions(rp: RelyingParty, inviteToken: string) {
    const { account } = await this.requireInvite(inviteToken);
    const existing = await this.repository.credentials(account.id);
    const options = await generateRegistrationOptions({
      rpID: rp.rpId,
      rpName: rp.rpName,
      userID: new TextEncoder().encode(account.id),
      userName: account.displayName,
      userDisplayName: account.displayName,
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" },
      excludeCredentials: existing.map((credential) => ({ id: credential.id, transports: credential.transports as Transports | undefined })),
      supportedAlgorithmIDs: [-7, -257],
    });
    await this.repository.insertChallenge({ challenge: options.challenge, accountId: account.id, purpose: "register", expiresAt: this.clock() + CHALLENGE_TTL_MS });
    return options;
  }

  /** Verify a registration, consume the invite and store the credential. */
  async register(rp: RelyingParty, inviteToken: string, credential: unknown): Promise<SignedIn> {
    const { invite, account } = await this.requireInvite(inviteToken);
    const response = credential as RegistrationResponse;
    if (!response || typeof response !== "object" || typeof response.id !== "string") throw malformed("registration");
    const challenge = decodeClientDataChallenge(response.response?.clientDataJSON);
    if (!challenge) throw malformed("registration");
    const now = this.clock();
    const consumed = await this.repository.consumeChallenge(challenge, "register", now);
    if (!consumed || consumed.accountId !== account.id) {
      throw new PasskeyError(401, "Challenge rejected", "The registration challenge is missing, expired, or already used.");
    }
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: rp.expectedOrigins, expectedRPID: rp.rpId });
    } catch (error) {
      throw new PasskeyError(400, "Registration rejected", error instanceof Error ? error.message : "The passkey could not be verified.");
    }
    if (!verification.verified || !verification.registrationInfo) throw new PasskeyError(401, "Registration rejected", "The passkey could not be verified.");
    if (!await this.repository.consumeInvite(invite.id, now)) {
      throw new PasskeyError(410, "Invite already used", "This invite link was already used. Ask for a new one.");
    }
    const info = verification.registrationInfo.credential;
    await this.repository.insertCredential({
      id: info.id,
      accountId: account.id,
      publicKey: info.publicKey,
      signCount: info.counter,
      transports: info.transports ?? null,
      createdAt: now,
      lastUsedAt: null,
    });
    return { account, credentialId: info.id };
  }

  async authenticationOptions(rp: RelyingParty) {
    const options = await generateAuthenticationOptions({ rpID: rp.rpId, userVerification: "preferred" });
    await this.repository.insertChallenge({ challenge: options.challenge, accountId: null, purpose: "authenticate", expiresAt: this.clock() + CHALLENGE_TTL_MS });
    return options;
  }

  /** Verify an assertion against the stored credential and advance its sign count. */
  async authenticate(rp: RelyingParty, credential: unknown): Promise<SignedIn> {
    const response = credential as AuthenticationResponse;
    if (!response || typeof response !== "object" || typeof response.id !== "string") throw malformed("sign-in");
    const challenge = decodeClientDataChallenge(response.response?.clientDataJSON);
    if (!challenge) throw malformed("sign-in");
    const now = this.clock();
    const consumed = await this.repository.consumeChallenge(challenge, "authenticate", now);
    if (!consumed) throw new PasskeyError(401, "Challenge rejected", "The sign-in challenge is missing, expired, or already used.");
    const stored = await this.repository.credential(response.id);
    if (!stored) throw new PasskeyError(401, "Passkey not recognized", "No account has this passkey.");
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: rp.expectedOrigins,
        expectedRPID: rp.rpId,
        credential: { id: stored.id, publicKey: stored.publicKey as Uint8Array<ArrayBuffer>, counter: stored.signCount, transports: stored.transports as Transports | undefined },
      });
    } catch (error) {
      throw new PasskeyError(400, "Sign-in rejected", error instanceof Error ? error.message : "The passkey could not be verified.");
    }
    if (!verification.verified) throw new PasskeyError(401, "Sign-in rejected", "The passkey could not be verified.");
    await this.repository.recordCredentialUse(stored.id, verification.authenticationInfo.newCounter, now);
    const account = await this.repository.account(stored.accountId);
    if (!account) throw new PasskeyError(401, "Passkey not recognized", "No account has this passkey.");
    return { account, credentialId: stored.id };
  }
}
