ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'kids' CHECK(role IN ('adult','kids'));
ALTER TABLE profiles ADD COLUMN pin_hash TEXT;
ALTER TABLE profiles ADD COLUMN pin_salt TEXT;
ALTER TABLE profiles ADD COLUMN pin_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN locked_until INTEGER;
CREATE TABLE profile_sessions (token TEXT PRIMARY KEY, profile_id TEXT NOT NULL, user_id TEXT NOT NULL, version INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX profile_sessions_expiry ON profile_sessions(expires);
CREATE TABLE profile_bootstrap (user_id TEXT PRIMARY KEY);
