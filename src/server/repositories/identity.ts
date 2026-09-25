// Identity storage for phone sign-in: passkey credentials, one-time invites and
// WebAuthn challenges. Values are domain-shaped; row shapes stay inside this file.
// The Turso adapter is used by main.ts; the memory adapter backs browser and server tests.

import type { Client } from "../db.ts";

export interface Account {
  id: string;
  displayName: string;
}

export interface PasskeyCredential {
  id: string;
  accountId: string;
  publicKey: Uint8Array;
  signCount: number;
  transports: string[] | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface Invite {
  id: string;
  accountId: string;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
}

export type ChallengePurpose = "register" | "authenticate";

export interface Challenge {
  challenge: string;
  accountId: string | null;
  purpose: ChallengePurpose;
  expiresAt: number;
}

export interface IdentityRepository {
  account(id: string): Promise<Account | null>;
  credentials(accountId: string): Promise<PasskeyCredential[]>;
  credential(id: string): Promise<PasskeyCredential | null>;
  insertCredential(credential: PasskeyCredential): Promise<void>;
  /** Record a successful assertion: the new sign count and the time. */
  recordCredentialUse(
    id: string,
    signCount: number,
    usedAt: number,
  ): Promise<void>;
  insertInvite(
    invite: Invite,
    tokenHash: string,
    mintedByPrefix: string | null,
  ): Promise<void>;
  inviteByHash(tokenHash: string): Promise<Invite | null>;
  /** Mark the invite consumed. Returns false when it was already consumed or has expired at `now`. */
  consumeInvite(id: string, now: number): Promise<boolean>;
  insertChallenge(challenge: Challenge): Promise<void>;
  /** Remove one challenge and return it. Returns null when it is unknown, expired at `now`, or for another purpose. */
  consumeChallenge(
    challenge: string,
    purpose: ChallengePurpose,
    now: number,
  ): Promise<Challenge | null>;
}

function optionalNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function rowCredential(row: Record<string, unknown>): PasskeyCredential {
  const key = row.public_key;
  const publicKey = key instanceof Uint8Array
    ? key
    : key instanceof ArrayBuffer
    ? new Uint8Array(key)
    : new Uint8Array(key as ArrayLike<number>);
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    publicKey,
    signCount: Number(row.sign_count),
    transports: row.transports_json == null
      ? null
      : JSON.parse(String(row.transports_json)),
    createdAt: Number(row.created_at),
    lastUsedAt: optionalNumber(row.last_used_at),
  };
}

function rowInvite(row: Record<string, unknown>): Invite {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    consumedAt: optionalNumber(row.consumed_at),
  };
}

export class TursoIdentityRepository implements IdentityRepository {
  constructor(private db: Client) {}

  async account(id: string): Promise<Account | null> {
    const result = await this.db.execute({
      sql: "SELECT id, display_name FROM accounts WHERE id = ?",
      args: [id],
    });
    if (!result.rows.length) return null;
    return {
      id: String(result.rows[0].id),
      displayName: String(result.rows[0].display_name),
    };
  }

  async credentials(accountId: string): Promise<PasskeyCredential[]> {
    const result = await this.db.execute({
      sql:
        "SELECT * FROM passkey_credentials WHERE account_id = ? ORDER BY created_at ASC",
      args: [accountId],
    });
    return result.rows.map((row) =>
      rowCredential(row as Record<string, unknown>)
    );
  }

  async credential(id: string): Promise<PasskeyCredential | null> {
    const result = await this.db.execute({
      sql: "SELECT * FROM passkey_credentials WHERE id = ?",
      args: [id],
    });
    if (!result.rows.length) return null;
    return rowCredential(result.rows[0] as Record<string, unknown>);
  }

  async insertCredential(credential: PasskeyCredential): Promise<void> {
    await this.db.execute({
      sql:
        "INSERT INTO passkey_credentials(id, account_id, public_key, sign_count, transports_json, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        credential.id,
        credential.accountId,
        credential.publicKey,
        credential.signCount,
        credential.transports == null
          ? null
          : JSON.stringify(credential.transports),
        credential.createdAt,
        credential.lastUsedAt,
      ],
    });
  }

  async recordCredentialUse(
    id: string,
    signCount: number,
    usedAt: number,
  ): Promise<void> {
    await this.db.execute({
      sql:
        "UPDATE passkey_credentials SET sign_count = ?, last_used_at = ? WHERE id = ?",
      args: [signCount, usedAt, id],
    });
  }

  async insertInvite(
    invite: Invite,
    tokenHash: string,
    mintedByPrefix: string | null,
  ): Promise<void> {
    await this.db.execute({
      sql:
        "INSERT INTO sign_in_invites(id, account_id, token_hash, minted_by_token_prefix, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        invite.id,
        invite.accountId,
        tokenHash,
        mintedByPrefix,
        invite.createdAt,
        invite.expiresAt,
        invite.consumedAt,
      ],
    });
  }

  async inviteByHash(tokenHash: string): Promise<Invite | null> {
    const result = await this.db.execute({
      sql: "SELECT * FROM sign_in_invites WHERE token_hash = ?",
      args: [tokenHash],
    });
    if (!result.rows.length) return null;
    return rowInvite(result.rows[0] as Record<string, unknown>);
  }

  async consumeInvite(id: string, now: number): Promise<boolean> {
    const result = await this.db.execute({
      sql:
        "UPDATE sign_in_invites SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > ?",
      args: [now, id, now],
    });
    return result.rowsAffected === 1;
  }

  async insertChallenge(challenge: Challenge): Promise<void> {
    await this.db.execute({
      sql: "DELETE FROM webauthn_challenges WHERE expires_at <= ?",
      args: [challenge.expiresAt - 1],
    });
    await this.db.execute({
      sql:
        "INSERT INTO webauthn_challenges(challenge, account_id, purpose, expires_at) VALUES (?, ?, ?, ?)",
      args: [
        challenge.challenge,
        challenge.accountId,
        challenge.purpose,
        challenge.expiresAt,
      ],
    });
  }

  async consumeChallenge(
    challenge: string,
    purpose: ChallengePurpose,
    now: number,
  ): Promise<Challenge | null> {
    const found = await this.db.execute({
      sql: "SELECT * FROM webauthn_challenges WHERE challenge = ?",
      args: [challenge],
    });
    const deleted = await this.db.execute({
      sql: "DELETE FROM webauthn_challenges WHERE challenge = ?",
      args: [challenge],
    });
    if (!found.rows.length || deleted.rowsAffected !== 1) return null;
    const row = found.rows[0] as Record<string, unknown>;
    if (String(row.purpose) !== purpose) return null;
    if (Number(row.expires_at) <= now) return null;
    return {
      challenge,
      accountId: row.account_id == null ? null : String(row.account_id),
      purpose,
      expiresAt: Number(row.expires_at),
    };
  }
}

/** In-memory adapter with the same semantics, for the database-free test application. */
export class MemoryIdentityRepository implements IdentityRepository {
  private accounts = new Map<string, Account>();
  private credentialRows = new Map<string, PasskeyCredential>();
  private invites = new Map<string, Invite>();
  private inviteHashes = new Map<string, string>();
  private challenges = new Map<string, Challenge>();

  constructor(accounts: Account[] = []) {
    for (const account of accounts) this.accounts.set(account.id, account);
  }

  async account(id: string): Promise<Account | null> {
    return this.accounts.get(id) ?? null;
  }

  async credentials(accountId: string): Promise<PasskeyCredential[]> {
    return Array.from(this.credentialRows.values()).filter((credential) =>
      credential.accountId === accountId
    );
  }

  async credential(id: string): Promise<PasskeyCredential | null> {
    return this.credentialRows.get(id) ?? null;
  }

  async insertCredential(credential: PasskeyCredential): Promise<void> {
    if (this.credentialRows.has(credential.id)) {
      throw new Error("credential already exists");
    }
    this.credentialRows.set(credential.id, { ...credential });
  }

  async recordCredentialUse(
    id: string,
    signCount: number,
    usedAt: number,
  ): Promise<void> {
    const credential = this.credentialRows.get(id);
    if (credential) {
      this.credentialRows.set(id, {
        ...credential,
        signCount,
        lastUsedAt: usedAt,
      });
    }
  }

  async insertInvite(invite: Invite, tokenHash: string): Promise<void> {
    this.invites.set(invite.id, { ...invite });
    this.inviteHashes.set(tokenHash, invite.id);
  }

  async inviteByHash(tokenHash: string): Promise<Invite | null> {
    const id = this.inviteHashes.get(tokenHash);
    return id ? this.invites.get(id) ?? null : null;
  }

  async consumeInvite(id: string, now: number): Promise<boolean> {
    const invite = this.invites.get(id);
    if (!invite || invite.consumedAt != null || invite.expiresAt <= now) {
      return false;
    }
    this.invites.set(id, { ...invite, consumedAt: now });
    return true;
  }

  async insertChallenge(challenge: Challenge): Promise<void> {
    this.challenges.set(challenge.challenge, { ...challenge });
  }

  async consumeChallenge(
    challenge: string,
    purpose: ChallengePurpose,
    now: number,
  ): Promise<Challenge | null> {
    const found = this.challenges.get(challenge);
    this.challenges.delete(challenge);
    if (!found || found.purpose !== purpose || found.expiresAt <= now) {
      return null;
    }
    return found;
  }
}
