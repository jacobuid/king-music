CREATE TABLE song_request_playlists (
 request_id TEXT NOT NULL REFERENCES song_requests(id) ON DELETE CASCADE,
 playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
 PRIMARY KEY(request_id,playlist_id)
);
