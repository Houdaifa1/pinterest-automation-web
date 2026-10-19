ALTER TABLE automations ADD COLUMN target_revision INTEGER;
ALTER TABLE automations ADD COLUMN deploy_config TEXT;
ALTER TABLE automations ADD COLUMN flow_version_id TEXT;
ALTER TABLE automations ADD COLUMN last_run_id TEXT;
ALTER TABLE automations ADD COLUMN bootstrap INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automations ADD COLUMN error_code TEXT;
ALTER TABLE automations ADD COLUMN operation_started_at INTEGER;
ALTER TABLE automations ADD COLUMN callback_hash TEXT;
ALTER TABLE automations ADD COLUMN encrypted_callback TEXT;
CREATE TABLE operations (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, status TEXT NOT NULL, remote_id TEXT, created_at INTEGER NOT NULL,
 UNIQUE(automation_id,id)
);
