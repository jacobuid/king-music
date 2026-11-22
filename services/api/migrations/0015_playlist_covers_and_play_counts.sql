ALTER TABLE profile_song_history ADD COLUMN play_count INTEGER NOT NULL DEFAULT 1 CHECK(play_count >= 0);
CREATE TABLE profile_play_events (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,event_id)
);
ALTER TABLE playlists ADD COLUMN cover_key TEXT;
CREATE TABLE playlist_cover_uploads (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
