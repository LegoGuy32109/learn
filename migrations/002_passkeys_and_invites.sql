-- Phone sign-in: passkey credentials, one-time invite links and the
-- short-lived WebAuthn challenges that bind a ceremony to one server call.
-- 001_initial.sql is immutable; this file only adds tables.

CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  public_key BLOB NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  transports_json TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE INDEX passkey_credentials_account_id_idx ON passkey_credentials(account_id);

CREATE TABLE sign_in_invites (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token_hash TEXT NOT NULL UNIQUE,
  minted_by_token_prefix TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX sign_in_invites_account_id_idx ON sign_in_invites(account_id);

CREATE TABLE webauthn_challenges (
  challenge TEXT PRIMARY KEY,
  account_id TEXT,
  purpose TEXT NOT NULL CHECK(purpose IN ('register', 'authenticate')),
  expires_at INTEGER NOT NULL
);
