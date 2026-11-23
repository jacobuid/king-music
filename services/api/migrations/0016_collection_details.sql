CREATE TABLE collection_details (
 user_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('artist','album')),
 artist TEXT NOT NULL,
 album TEXT NOT NULL DEFAULT '',
 description TEXT,
 year TEXT,
 source_url TEXT,
 status TEXT NOT NULL CHECK(status IN ('ready','missing','unavailable')),
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,kind,artist,album)
);
