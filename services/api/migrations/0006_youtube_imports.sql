ALTER TABLE media ADD COLUMN user_id TEXT;
UPDATE media SET user_id=(SELECT MIN(user_id) FROM profiles) WHERE (SELECT COUNT(DISTINCT user_id) FROM profiles)=1;
CREATE INDEX media_owner ON media(user_id);
ALTER TABLE media ADD COLUMN youtube_video_id TEXT;
ALTER TABLE media ADD COLUMN thumbnail_url TEXT;
CREATE UNIQUE INDEX media_youtube_video ON media(user_id,youtube_video_id) WHERE youtube_video_id IS NOT NULL;
CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  user_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  album TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','failed')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,video_id)
);
CREATE TABLE import_playlist_tracks (
  job_id TEXT NOT NULL REFERENCES import_jobs(id),
  playlist_id TEXT NOT NULL REFERENCES playlists(id),
  position INTEGER NOT NULL,
  PRIMARY KEY(job_id,playlist_id)
);
CREATE TABLE import_search_limits (user_id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL);
