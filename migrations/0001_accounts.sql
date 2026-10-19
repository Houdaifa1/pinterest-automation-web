PRAGMA foreign_keys = ON;
CREATE TABLE users (
 id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked','removed')),
 created_at INTEGER NOT NULL, last_active INTEGER NOT NULL
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE oauth_states (
 token_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE integrations (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 encrypted_key TEXT NOT NULL, project_id TEXT NOT NULL, platform_name TEXT NOT NULL,
 created_at INTEGER NOT NULL, UNIQUE(user_id, project_id)
);
CREATE TABLE connections (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
 remote_id TEXT NOT NULL, external_id TEXT NOT NULL, service TEXT NOT NULL,
 label TEXT NOT NULL, identity TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
 UNIQUE(integration_id, remote_id)
);
CREATE TABLE automations (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 integration_id TEXT REFERENCES integrations(id), name TEXT NOT NULL,
 config TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 1,
 applied_revision INTEGER NOT NULL DEFAULT 0, flow_id TEXT, seed_run_id TEXT,
 status TEXT NOT NULL DEFAULT 'draft', sheet_url TEXT, operation_id TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX automations_owner ON automations(user_id);
CREATE TABLE versions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, config TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(automation_id, revision)
);
CREATE TABLE audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL,
 action TEXT NOT NULL, created_at INTEGER NOT NULL
);
