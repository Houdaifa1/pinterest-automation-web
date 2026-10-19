CREATE TABLE media (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL, content_hash TEXT NOT NULL, content BLOB NOT NULL,
 bytes INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
 active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
 UNIQUE(automation_id,account_id,content_hash)
);
CREATE INDEX media_owner ON media(user_id,automation_id,account_id);
CREATE TABLE batches (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL, fingerprint TEXT NOT NULL, snapshot TEXT NOT NULL,
 reference_ids TEXT NOT NULL, prompt TEXT NOT NULL, total INTEGER NOT NULL,
 copies INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, copied_at INTEGER, sent_at INTEGER,
 capability_hash TEXT, capability_expires INTEGER,
 UNIQUE(automation_id,fingerprint)
);
CREATE INDEX batches_owner ON batches(user_id,automation_id);
