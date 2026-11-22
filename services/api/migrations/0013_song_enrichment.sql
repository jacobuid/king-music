CREATE TABLE song_enrichment (
  media_id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
  artwork_status TEXT NOT NULL DEFAULT 'pending' CHECK(artwork_status IN ('pending','ready','missing','failed')),
  lyrics_status TEXT NOT NULL DEFAULT 'pending' CHECK(lyrics_status IN ('pending','ready','missing','failed','instrumental')),
  lyrics_plain TEXT,
  lyrics_synced TEXT,
  lyrics_source TEXT,
  lyrics_source_url TEXT,
  duration_seconds REAL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
