CREATE TABLE bot_setups (
 automation_id TEXT PRIMARY KEY REFERENCES automations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 encrypted_value TEXT NOT NULL,
 username TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 tested_at INTEGER
);
