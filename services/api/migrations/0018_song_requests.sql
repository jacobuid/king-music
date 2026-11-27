CREATE TABLE song_requests (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 song_key TEXT NOT NULL,
 media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
 video_id TEXT,
 title TEXT NOT NULL,
 artist TEXT NOT NULL DEFAULT '',
 album TEXT NOT NULL DEFAULT '',
 thumbnail_url TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,profile_id,song_key)
);
CREATE INDEX song_requests_queue ON song_requests(user_id,status);
CREATE INDEX song_requests_video ON song_requests(user_id,video_id,status);
