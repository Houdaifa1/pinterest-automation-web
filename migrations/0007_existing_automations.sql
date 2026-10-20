ALTER TABLE automations ADD COLUMN workspace_id TEXT;
CREATE TABLE flow_bindings (
 project_id TEXT NOT NULL,
 flow_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 automation_id TEXT NOT NULL UNIQUE REFERENCES automations(id) ON DELETE CASCADE,
 PRIMARY KEY(project_id,flow_id)
);
INSERT OR IGNORE INTO flow_bindings
SELECT i.project_id,a.flow_id,a.user_id,a.id FROM automations a JOIN integrations i ON i.id=a.integration_id WHERE a.flow_id IS NOT NULL;
ALTER TABLE automations ADD COLUMN resume_after_apply INTEGER NOT NULL DEFAULT 1;
CREATE TABLE telegram_recipients (
 automation_id TEXT PRIMARY KEY REFERENCES automations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 connection_id TEXT NOT NULL,
 google_id TEXT NOT NULL,
 sheet_id TEXT NOT NULL
);
