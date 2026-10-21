ALTER TABLE automations ADD COLUMN day_slots_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE schedule_jobs ADD COLUMN origin TEXT NOT NULL DEFAULT 'scheduled' CHECK(origin IN ('scheduled','manual','sync'));
UPDATE schedule_jobs SET origin='manual' WHERE detail='manual';
UPDATE schedule_jobs SET origin='sync' WHERE account_id='_sync';
