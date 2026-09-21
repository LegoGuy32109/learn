import type { Client } from "./db.ts";
import { tokenHash } from "./tokens.ts";

export interface Principal {
  accountId: string;
  scopes: string[];
}

export class TokenAuthenticator {
  constructor(private db: Client) {}

  async authenticate(request: Request, requiredScope: string): Promise<Principal | null> {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) return null;
    const token = header.slice(7);
    if (!token.startsWith("learn_pat_")) return null;
    const hash = await tokenHash(token);
    const result = await this.db.execute({
      sql: "SELECT id, account_id, scopes_json, expires_at FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL",
      args: [hash],
    });
    if (!result.rows.length) return null;
    const row = result.rows[0];
    if (row.expires_at != null && Number(row.expires_at) <= Date.now()) return null;
    const scopes = JSON.parse(String(row.scopes_json));
    if (!Array.isArray(scopes) || !scopes.includes(requiredScope)) return null;
    await this.db.execute({ sql: "UPDATE api_tokens SET last_used_at = ? WHERE id = ?", args: [Date.now(), String(row.id)] });
    return { accountId: String(row.account_id), scopes };
  }
}

export interface Authenticator {
  authenticate(request: Request, requiredScope: string): Promise<Principal | null>;
}

export class RejectingAuthenticator implements Authenticator {
  async authenticate(): Promise<Principal | null> { return null; }
}

