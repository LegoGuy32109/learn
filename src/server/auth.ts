import type { Client } from "./db.ts";
import { tokenHash } from "./tokens.ts";

export interface Principal {
  accountId: string;
  scopes: string[];
}

/**
 * Authentication and authorization are reported separately.
 * `unauthenticated` covers a missing, malformed, unknown, expired or revoked
 * token and maps to 401. `forbidden` means the token is valid but lacks the
 * required scope and maps to 403.
 */
export type AuthResult =
  | { ok: true; principal: Principal }
  | { ok: false; reason: "unauthenticated" | "forbidden" };

export interface Authenticator {
  authenticate(request: Request, requiredScope: string): Promise<AuthResult>;
}

export const UNAUTHENTICATED: AuthResult = { ok: false, reason: "unauthenticated" };
export const FORBIDDEN: AuthResult = { ok: false, reason: "forbidden" };

const TOKEN_SHAPE = /^learn_pat_[A-Za-z0-9_-]{10}_[A-Za-z0-9_-]{43}$/;

export class TokenAuthenticator implements Authenticator {
  constructor(private db: Client, private clock: () => number = Date.now) {}

  async authenticate(request: Request, requiredScope: string): Promise<AuthResult> {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) return UNAUTHENTICATED;
    const token = header.slice(7).trim();
    if (!TOKEN_SHAPE.test(token)) return UNAUTHENTICATED;
    const hash = await tokenHash(token);
    const result = await this.db.execute({
      sql: "SELECT id, account_id, scopes_json, expires_at FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL",
      args: [hash],
    });
    if (!result.rows.length) return UNAUTHENTICATED;
    const row = result.rows[0];
    const now = this.clock();
    if (row.expires_at != null && Number(row.expires_at) <= now) return UNAUTHENTICATED;
    const scopes = JSON.parse(String(row.scopes_json));
    if (!Array.isArray(scopes)) return UNAUTHENTICATED;
    await this.db.execute({ sql: "UPDATE api_tokens SET last_used_at = ? WHERE id = ?", args: [now, String(row.id)] });
    if (!scopes.includes(requiredScope)) return FORBIDDEN;
    return { ok: true, principal: { accountId: String(row.account_id), scopes } };
  }
}

export class RejectingAuthenticator implements Authenticator {
  async authenticate(): Promise<AuthResult> { return UNAUTHENTICATED; }
}
