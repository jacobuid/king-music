CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  object_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  track_number INTEGER NOT NULL,
  kids_allowed INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX uploads_expiry ON uploads(expires);
