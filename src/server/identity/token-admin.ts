// Personal-token administration: mint, list, revoke and rotate.
// Only a prefix and a SHA-256 hash of the secret are ever stored.
// The full token exists in memory once, in the result of mint or rotate.

import type { Client } from "../db.ts";
import { newPersonalToken, tokenHash } from "../tokens.ts";

/** `account:owner` lets a token mint one-time sign-in invites for its own account. */
export const KNOWN_SCOPES = ["lessons:read", "lessons:write", "account:owner"] as const;
export type Scope = typeof KNOWN_SCOPES[number];

/** Metadata that is safe to show. It never carries a hash or a secret. */
export interface TokenMetadata {
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
}

export interface MintRequest {
  accountId: string;
  name: string;
  scopes: string[];
  expiresAt?: number | null;
}

/** The one place the full token is available. Callers show it once and drop it. */
export interface MintedToken {
  token: string;
  metadata: TokenMetadata;
}

export interface RotatedToken extends MintedToken {
  replacedPrefix: string;
}

export class TokenAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenAdminError";
  }
}

function metadata(row: Record<string, unknown>): TokenMetadata {
  const optional = (value: unknown) => value == null ? null : Number(value);
  return {
    name: String(row.name),
    prefix: String(row.token_prefix),
    scopes: JSON.parse(String(row.scopes_json)),
    createdAt: Number(row.created_at),
    lastUsedAt: optional(row.last_used_at),
    expiresAt: optional(row.expires_at),
    revokedAt: optional(row.revoked_at),
  };
}

export function validateScopes(scopes: string[]): string[] {
  const unique = Array.from(new Set(scopes.map((scope) => scope.trim()).filter(Boolean)));
  if (!unique.length) throw new TokenAdminError("At least one scope is required.");
  const unknown = unique.filter((scope) => !(KNOWN_SCOPES as readonly string[]).includes(scope));
  if (unknown.length) throw new TokenAdminError(`Unknown scope: ${unknown.join(", ")}. Known scopes: ${KNOWN_SCOPES.join(", ")}.`);
  return unique;
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new TokenAdminError("A token name is required.");
  if (trimmed.length > 64) throw new TokenAdminError("A token name is limited to 64 characters.");
  return trimmed;
}

function validateExpiry(expiresAt: number | null | undefined, now: number): number | null {
  if (expiresAt == null) return null;
  if (!Number.isSafeInteger(expiresAt)) throw new TokenAdminError("Expiry must be a millisecond timestamp.");
  if (expiresAt <= now) throw new TokenAdminError("Expiry must be in the future.");
  return expiresAt;
}

const COLUMNS = "name, token_prefix, scopes_json, created_at, last_used_at, expires_at, revoked_at";

export class TokenAdmin {
  constructor(private db: Client, private clock: () => number = Date.now) {}

  /** Create a token. The returned `token` is the only copy of the secret. */
  async mint(request: MintRequest): Promise<MintedToken> {
    const now = this.clock();
    const name = validateName(request.name);
    const scopes = validateScopes(request.scopes);
    const expiresAt = validateExpiry(request.expiresAt, now);
    await this.requireAccount(request.accountId);
    const active = await this.db.execute({
      sql: "SELECT id FROM api_tokens WHERE account_id = ? AND name = ? AND revoked_at IS NULL",
      args: [request.accountId, name],
    });
    if (active.rows.length) throw new TokenAdminError(`An active token named "${name}" already exists. Revoke it or choose another name.`);
    const created = newPersonalToken();
    const hash = await tokenHash(created.token);
    await this.db.execute({
      sql: "INSERT INTO api_tokens(id, account_id, name, token_prefix, token_hash, scopes_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [crypto.randomUUID(), request.accountId, name, created.prefix, hash, JSON.stringify(scopes), now, expiresAt],
    });
    return {
      token: created.token,
      metadata: { name, prefix: created.prefix, scopes, createdAt: now, lastUsedAt: null, expiresAt, revokedAt: null },
    };
  }

  /** List token metadata for one account. Never selects the hash. */
  async list(accountId: string): Promise<TokenMetadata[]> {
    const result = await this.db.execute({
      sql: `SELECT ${COLUMNS} FROM api_tokens WHERE account_id = ? ORDER BY created_at ASC, token_prefix ASC`,
      args: [accountId],
    });
    return result.rows.map((row) => metadata(row as Record<string, unknown>));
  }

  /** Find one token of the account by prefix or by active name. */
  async find(accountId: string, selector: { prefix?: string; name?: string }): Promise<TokenMetadata | null> {
    const result = selector.prefix
      ? await this.db.execute({ sql: `SELECT ${COLUMNS} FROM api_tokens WHERE account_id = ? AND token_prefix = ?`, args: [accountId, selector.prefix] })
      : selector.name
      ? await this.db.execute({ sql: `SELECT ${COLUMNS} FROM api_tokens WHERE account_id = ? AND name = ? AND revoked_at IS NULL`, args: [accountId, selector.name] })
      : null;
    if (!result || !result.rows.length) return null;
    if (result.rows.length > 1) throw new TokenAdminError("The selector matches more than one token. Use --prefix.");
    return metadata(result.rows[0] as Record<string, unknown>);
  }

  /** Revoke one token now. Revoking an already revoked token is an error. */
  async revoke(accountId: string, prefix: string): Promise<TokenMetadata> {
    const existing = await this.find(accountId, { prefix });
    if (!existing) throw new TokenAdminError(`No token with prefix ${prefix} belongs to this account.`);
    if (existing.revokedAt != null) throw new TokenAdminError(`Token ${prefix} was already revoked.`);
    const now = this.clock();
    await this.db.execute({
      sql: "UPDATE api_tokens SET revoked_at = ? WHERE account_id = ? AND token_prefix = ? AND revoked_at IS NULL",
      args: [now, accountId, prefix],
    });
    return { ...existing, revokedAt: now };
  }

  /**
   * Replace one token with a fresh secret that keeps its name, scopes and expiry.
   * The new token is inserted first and confirmed present by hash. Only after that
   * confirmation is the old token revoked, so a failed mint leaves the old token alive
   * and a successful one never leaves both usable.
   */
  async rotate(accountId: string, prefix: string): Promise<RotatedToken> {
    const existing = await this.find(accountId, { prefix });
    if (!existing) throw new TokenAdminError(`No token with prefix ${prefix} belongs to this account.`);
    if (existing.revokedAt != null) throw new TokenAdminError(`Token ${prefix} was already revoked and cannot be rotated. Mint a new token instead.`);
    const now = this.clock();
    if (existing.expiresAt != null && existing.expiresAt <= now) throw new TokenAdminError(`Token ${prefix} has expired and cannot be rotated. Mint a new token instead.`);
    const created = newPersonalToken();
    const hash = await tokenHash(created.token);
    await this.db.execute({
      sql: "INSERT INTO api_tokens(id, account_id, name, token_prefix, token_hash, scopes_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [crypto.randomUUID(), accountId, existing.name, created.prefix, hash, JSON.stringify(existing.scopes), now, existing.expiresAt],
    });
    const confirmed = await this.db.execute({ sql: "SELECT 1 FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL", args: [hash] });
    if (!confirmed.rows.length) throw new TokenAdminError(`The replacement for ${prefix} was not confirmed. The old token is still active.`);
    await this.db.execute({
      sql: "UPDATE api_tokens SET revoked_at = ? WHERE account_id = ? AND token_prefix = ? AND revoked_at IS NULL",
      args: [now, accountId, prefix],
    });
    return {
      token: created.token,
      replacedPrefix: prefix,
      metadata: { name: existing.name, prefix: created.prefix, scopes: existing.scopes, createdAt: now, lastUsedAt: null, expiresAt: existing.expiresAt, revokedAt: null },
    };
  }

  /** Resolve the account to operate on: an explicit id, or the only account in the database. */
  async resolveAccount(accountId?: string): Promise<{ id: string; displayName: string }> {
    if (accountId) {
      const result = await this.db.execute({ sql: "SELECT id, display_name FROM accounts WHERE id = ?", args: [accountId] });
      if (!result.rows.length) throw new TokenAdminError(`Account ${accountId} does not exist.`);
      return { id: String(result.rows[0].id), displayName: String(result.rows[0].display_name) };
    }
    const result = await this.db.execute("SELECT id, display_name FROM accounts ORDER BY created_at ASC LIMIT 2");
    if (!result.rows.length) throw new TokenAdminError("No account exists. Run deno task db:owner first.");
    if (result.rows.length > 1) throw new TokenAdminError("More than one account exists. Pass --account <id>.");
    return { id: String(result.rows[0].id), displayName: String(result.rows[0].display_name) };
  }

  private async requireAccount(accountId: string): Promise<void> {
    const result = await this.db.execute({ sql: "SELECT id FROM accounts WHERE id = ?", args: [accountId] });
    if (!result.rows.length) throw new TokenAdminError(`Account ${accountId} does not exist.`);
  }
}
