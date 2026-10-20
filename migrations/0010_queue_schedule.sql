ALTER TABLE automations ADD COLUMN scheduler_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automations ADD COLUMN planned_through TEXT;
CREATE TABLE schedule_jobs (
 id TEXT PRIMARY KEY,
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL,
 account_name TEXT NOT NULL,
 schedule_revision INTEGER NOT NULL,
 planned_at INTEGER NOT NULL,
 local_day TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 lease_token TEXT,
 started_at INTEGER,
 finished_at INTEGER,
 remote_run_id TEXT,
 detail TEXT,
 UNIQUE(automation_id,account_id,planned_at)
);
CREATE INDEX schedule_due ON schedule_jobs(status,planned_at);
CREATE TABLE queue_snapshots (
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL,
 data TEXT NOT NULL,
 synced_at INTEGER NOT NULL,
 complete INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(automation_id,account_id)
);
CREATE TABLE queue_commands (
 id TEXT PRIMARY KEY,
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL,
 pin_id TEXT NOT NULL,
 expected TEXT NOT NULL,
 patch TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 created_at INTEGER NOT NULL,
 finished_at INTEGER,
 started_at INTEGER,
 detail TEXT
);
CREATE INDEX queue_commands_automation ON queue_commands(automation_id,status);
