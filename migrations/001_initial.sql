CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX api_tokens_account_id_idx ON api_tokens(account_id);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY,
  owner_account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX lessons_owner_account_id_idx ON lessons(owner_account_id);

CREATE TABLE lesson_revisions (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  author_account_id TEXT NOT NULL REFERENCES accounts(id),
  revision_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'published', 'superseded', 'withdrawn')),
  schema_version INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  instructional_title TEXT NOT NULL,
  assumed_knowledge TEXT NOT NULL,
  content_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  published_at INTEGER,
  UNIQUE(lesson_id, revision_number),
  UNIQUE(lesson_id, fingerprint),
  UNIQUE(author_account_id, fingerprint)
);

CREATE INDEX lesson_revisions_lesson_id_idx ON lesson_revisions(lesson_id);

CREATE TABLE lesson_sources (
  id TEXT PRIMARY KEY,
  lesson_revision_id TEXT NOT NULL REFERENCES lesson_revisions(id),
  source_order INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  locator TEXT NOT NULL,
  captured_text TEXT,
  UNIQUE(lesson_revision_id, source_order)
);

CREATE INDEX lesson_sources_revision_id_idx ON lesson_sources(lesson_revision_id);
