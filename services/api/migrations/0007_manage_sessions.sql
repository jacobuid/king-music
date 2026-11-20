CREATE TABLE manage_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX manage_sessions_expiry ON manage_sessions(expires);
