CREATE TABLE batch_schedules (
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL, batch_id TEXT NOT NULL,
 pins_per_day INTEGER NOT NULL, schedule TEXT NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(automation_id,account_id,batch_id)
);
ALTER TABLE automations ADD COLUMN batch_schedule_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automations ADD COLUMN plan_scope TEXT NOT NULL DEFAULT '';
ALTER TABLE schedule_jobs ADD COLUMN batch_id TEXT NOT NULL DEFAULT '';
ALTER TABLE schedule_jobs ADD COLUMN plan_key TEXT NOT NULL DEFAULT '';
CREATE TABLE schedule_day_plans (
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL, local_day TEXT NOT NULL, plan_key TEXT NOT NULL, token TEXT NOT NULL, plan TEXT NOT NULL,
 PRIMARY KEY(automation_id,account_id,local_day,plan_key)
);
CREATE TABLE account_batch_state (
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 account_id TEXT NOT NULL, batch_id TEXT NOT NULL,
 PRIMARY KEY(automation_id,account_id)
);
