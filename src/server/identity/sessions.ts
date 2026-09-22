// Browser sessions are one signed, HttpOnly, SameSite=Lax cookie. The payload names the
// account and its expiry; an HMAC over the payload makes tampering detectable. Bearer
// tokens stay the agent credential; the cookie is the browser credential. Both resolve
// to the same account identity.

import { base64Url, fromBase64Url } from "./encoding.ts";

export const SESSION_COOKIE = "learn_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface BrowserSession {
  accountId: string;
  displayName: string;
  issuedAt: number;
  expiresAt: number;
}

export interface SessionCookies {
  read(request: Request): Promise<BrowserSession | null>;
  /** The Set-Cookie header value that signs `session` in for `request`'s origin. */
  issue(request: Request, session: Omit<BrowserSession, "issuedAt" | "expiresAt">): Promise<string>;
  /** The Set-Cookie header value that removes the session cookie. */
  clear(request: Request): string;
}

/** Decode a `LEARN_SESSION_KEY` value: 32 random bytes in base64url. */
export function sessionKeyFromEnv(value: string | undefined): Uint8Array | null {
  if (!value) return null;
  const bytes = fromBase64Url(value.trim());
  if (!bytes || bytes.byteLength !== 32) throw new Error("LEARN_SESSION_KEY must be 32 random bytes in base64url");
  return bytes;
}

export function randomSessionKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** Cookies are Secure everywhere except plain localhost, where browsers have no TLS. */
export function cookieIsSecure(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;
  return !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

export class HmacSessionCookies implements SessionCookies {
  private key: Promise<CryptoKey>;

  constructor(keyBytes: Uint8Array, private clock: () => number = Date.now) {
    const root = crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, "HKDF", false, ["deriveKey"]);
    this.key = root.then((imported) => crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("learn/v1/browser-session") },
      imported,
      { name: "HMAC", hash: "SHA-256", length: 256 },
      false,
      ["sign", "verify"],
    ));
  }

  async read(request: Request): Promise<BrowserSession | null> {
    const value = cookieValue(request, SESSION_COOKIE);
    if (!value) return null;
    const [version, payload, signature] = value.split(".");
    if (version !== "v1" || !payload || !signature) return null;
    const signatureBytes = fromBase64Url(signature);
    const payloadBytes = fromBase64Url(payload);
    if (!signatureBytes || !payloadBytes) return null;
    const valid = await crypto.subtle.verify("HMAC", await this.key, signatureBytes.buffer as ArrayBuffer, new TextEncoder().encode(payload));
    if (!valid) return null;
    let session: BrowserSession;
    try {
      session = JSON.parse(new TextDecoder().decode(payloadBytes));
    } catch {
      return null;
    }
    if (typeof session.accountId !== "string" || typeof session.displayName !== "string") return null;
    if (!Number.isSafeInteger(session.expiresAt) || session.expiresAt <= this.clock()) return null;
    return session;
  }

  async issue(request: Request, session: Omit<BrowserSession, "issuedAt" | "expiresAt">): Promise<string> {
    const issuedAt = this.clock();
    const full: BrowserSession = { ...session, issuedAt, expiresAt: issuedAt + SESSION_TTL_MS };
    const payload = base64Url(new TextEncoder().encode(JSON.stringify(full)));
    const signature = await crypto.subtle.sign("HMAC", await this.key, new TextEncoder().encode(payload));
    const value = `v1.${payload}.${base64Url(new Uint8Array(signature))}`;
    return `${SESSION_COOKIE}=${value}; ${attributes(request, Math.floor(SESSION_TTL_MS / 1000))}`;
  }

  clear(request: Request): string {
    return `${SESSION_COOKIE}=; ${attributes(request, 0)}`;
  }
}

function attributes(request: Request, maxAge: number): string {
  const parts = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (cookieIsSecure(request)) parts.push("Secure");
  return parts.join("; ");
}
