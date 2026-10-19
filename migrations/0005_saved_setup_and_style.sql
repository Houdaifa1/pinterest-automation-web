ALTER TABLE automations ADD COLUMN setup_step INTEGER NOT NULL DEFAULT 0;
CREATE TABLE style_versions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL,
 signature TEXT NOT NULL,
 reference_ids TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(automation_id,account_id,signature)
);
CREATE INDEX style_history ON style_versions(user_id,automation_id,account_id,created_at);
