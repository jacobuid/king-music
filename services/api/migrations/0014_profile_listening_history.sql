CREATE TABLE profile_song_history (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  last_played_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,media_id)
);
CREATE INDEX profile_song_history_recent ON profile_song_history(profile_id,last_played_at DESC);
CREATE TABLE profile_album_history (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  album TEXT NOT NULL,
  artist TEXT NOT NULL,
  last_visited_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,album,artist)
);
CREATE INDEX profile_album_history_recent ON profile_album_history(profile_id,last_visited_at DESC);
