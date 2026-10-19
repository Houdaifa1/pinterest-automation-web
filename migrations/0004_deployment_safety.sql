ALTER TABLE automations ADD COLUMN applied_config TEXT;
CREATE TABLE profile_claims (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,connection_id)
);
CREATE INDEX profile_claim_automation ON profile_claims(automation_id);
