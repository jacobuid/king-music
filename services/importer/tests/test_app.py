import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, call, patch

from fastapi.testclient import TestClient
import requests
import app as service


class MusicTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {
            "MUSIC_SERVICE_TOKEN": "private-test-token", "API_ORIGIN": "https://api.example",
            "GOOGLE_CLOUD_PROJECT": "test-project", "TASKS_LOCATION": "us-central1",
            "SERVICE_URL": "https://service.example", "B2_ENDPOINT": "https://s3.example",
        })
        self.environment.start()
        self.client = TestClient(service.app, raise_server_exceptions=False)
        self.headers = {"Authorization": "Bearer private-test-token"}
        self.job = {"id": "11111111-1111-4111-8111-111111111111", "videoId": "abcdefghijk", "callbackUrl": "https://api.example/api/internal/music/11111111-1111-4111-8111-111111111111"}

    def tearDown(self):
        self.environment.stop()

    @patch.object(service, "YTMusic")
    def test_playlist_preserves_order_skips_unavailable_and_deduplicates(self, client):
        def song(video, title):
            return {"videoId": video, "title": title, "duration_seconds": 120, "artists": [{"name": "Artist"}]}
        client.return_value.get_playlist.return_value = {"title": "Mix", "trackCount": 4, "tracks": [song("abcdefghij1", "First"), {"videoId": None}, song("abcdefghij2", "Second"), song("abcdefghij1", "Duplicate")]}
        response = self.client.post("/playlist", json={"playlistId": "PLabcdefghijk"}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([song["title"] for song in response.json()["tracks"]], ["First", "Second"])
        self.assertEqual(response.json()["skipped"], 2)

    @patch.object(service, "YTMusic")
    def test_large_playlists_are_rejected_instead_of_silently_truncated(self, client):
        client.return_value.get_playlist.return_value = {"title": "Mix", "trackCount": 101, "tracks": []}
        self.assertEqual(self.client.post("/playlist", json={"playlistId": "PLabcdefghijk"}, headers=self.headers).status_code, 400)
        self.assertEqual(self.client.post("/playlist", json={"playlistId": "https://attacker.example"}, headers=self.headers).status_code, 422)

    @patch.object(service, "enqueue")
    def test_batch_validates_all_jobs_before_queueing(self, enqueue):
        invalid = {**self.job, "callbackUrl": "https://attacker.example"}
        response = self.client.post("/jobs/batch", json={"jobs": [self.job, invalid]}, headers=self.headers)
        self.assertEqual(response.status_code, 400)
        enqueue.assert_not_called()
        response = self.client.post("/jobs/batch", json={"jobs": [self.job]}, headers=self.headers)
        self.assertEqual(response.status_code, 202)
        enqueue.assert_called_once()

    def test_auth_and_callback_validation(self):
        self.assertEqual(self.client.post("/search", json={"query": "song"}).status_code, 401)
        self.assertEqual(self.client.post("/jobs", json={**self.job, "callbackUrl": "https://attacker.example"}, headers=self.headers).status_code, 400)
        self.assertEqual(self.client.post("/jobs", json={**self.job, "videoId": "--exec rm"}, headers=self.headers).status_code, 400)

    def test_cookie_secret_is_copied_per_job_and_only_youtube_domains_are_used(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            source = directory / "mounted-secret.txt"
            original = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\ttest-youtube-session\n#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tOTHER\ttest-http-only\n.google.com\tTRUE\t/\tTRUE\t0\tSID\tunrelated-google-session\nnotyoutube.com\tFALSE\t/\tTRUE\t0\tSID\tunrelated-site\n"
            source.write_text(original)
            for name in ("job-one", "job-two"):
                job = directory / name
                job.mkdir()
                with patch.dict(os.environ, {"YOUTUBE_COOKIES_FILE": str(source)}):
                    arguments = service.youtube_cookie_arguments(job)
                self.assertEqual(arguments[0], "--cookies")
                cookie_copy = Path(arguments[1])
                self.assertNotEqual(cookie_copy, source)
                self.assertIn("test-youtube-session", cookie_copy.read_text())
                self.assertIn("test-http-only", cookie_copy.read_text())
                self.assertNotIn("unrelated", cookie_copy.read_text())
                cookie_copy.write_text("changed by downloader")
            self.assertEqual(source.read_text(), original)

    def test_missing_or_invalid_cookie_secrets_never_enter_downloader_arguments(self):
        with patch.dict(os.environ, {"YOUTUBE_COOKIES_FILE": ""}):
            self.assertEqual(service.youtube_cookie_arguments(Path("unused")), [])
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            source = directory / "secret.txt"
            for content in ("{\"cookies\":[]}", "# Netscape HTTP Cookie File\nmalformed-secret-value", "# Netscape HTTP Cookie File\n.google.com\tTRUE\t/\tTRUE\t0\tSID\tprivate-value", "x" * 65537):
                source.write_text(content)
                with patch.dict(os.environ, {"YOUTUBE_COOKIES_FILE": str(source)}):
                    with self.assertRaises(RuntimeError) as caught:
                        service.youtube_cookie_arguments(directory)
                self.assertNotIn("private-value", str(caught.exception))
                self.assertNotIn("malformed-secret-value", str(caught.exception))

    @patch.object(service.subprocess, "run")
    def test_authenticated_failures_never_log_cookie_values(self, run):
        run.return_value = Mock(returncode=1, stderr="Invalid cookie line: very-private-cookie-value")
        with self.assertLogs('king_sports.music', level='WARNING') as logs:
            with self.assertRaises(RuntimeError):
                service.run(["yt-dlp", "--cookies", "/tmp/private-cookie-jar"])
        self.assertNotIn("very-private-cookie-value", "".join(logs.output))

    @patch.object(service, "YTMusic")
    def test_music_search_maps_metadata_and_excludes_unavailable_and_long_tracks(self, client):
        client.return_value.search.side_effect = [[
            {"videoId": "abcdefghijk", "title": "Song", "duration_seconds": 120, "artists": [{"name": "Artist"}], "album": {"name": "Album"}, "isExplicit": True, "thumbnails": [{"url": "https://lh3.googleusercontent.com/artwork"}]},
            {"videoId": "abcdefghijk", "duration_seconds": 120},
            {"videoId": "ABCDEFGHIJK", "duration_seconds": 9000},
            {"videoId": "01234567890", "duration_seconds": 120, "isAvailable": False},
            {"videoId": "invalid", "duration_seconds": 120},
        ], [{"videoId": "abcdefghijk", "title": "Duplicate video", "duration_seconds": 120}]]
        response = self.client.post("/search", json={"query": "--exec evil"}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["results"], [{"videoId": "abcdefghijk", "title": "Song", "artist": "Artist", "album": "Album", "isExplicit": True, "duration": 120, "thumbnail": "https://lh3.googleusercontent.com/artwork"}])
        self.assertEqual(client.return_value.search.call_args_list, [call("--exec evil", filter="songs", limit=12), call("--exec evil", filter="videos", limit=12)])
        self.assertNotIn("auth", client.call_args.kwargs)

    @patch.object(service, "YTMusic")
    def test_combined_search_includes_video_results_with_missing_metadata(self, client):
        client.return_value.search.side_effect = [[], [{"videoId": "abcdefghijk", "duration_seconds": 120, "thumbnails": [{"url": "https://unrelated.example/image"}]}]]
        response = self.client.post("/search", json={"query": "song"}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["results"][0]["thumbnail"], "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg")
        self.assertIsNone(response.json()["results"][0]["isExplicit"])
        self.assertEqual(client.return_value.search.call_args_list, [call("song", filter="songs", limit=12), call("song", filter="videos", limit=12)])

    def test_search_ranking_favors_exact_official_match_and_penalizes_unrequested_variants(self):
        songs = [
            {"videoId": "aaaaaaaaaaa", "title": "Thunder Cover", "duration_seconds": 180, "artists": [{"name": "Other"}]},
            {"videoId": "bbbbbbbbbbb", "title": "Thunder", "duration_seconds": 180, "artists": [{"name": "Imagine Dragons"}], "videoType": "MUSIC_VIDEO_TYPE_ATV"},
        ]
        videos = [
            {"videoId": "ccccccccccc", "title": "Thunder Live", "duration_seconds": 190, "artists": [{"name": "Imagine Dragons"}]},
            {"videoId": "ddddddddddd", "title": "Thunder", "duration_seconds": 185, "artists": [{"name": "Imagine Dragons"}], "videoType": "MUSIC_VIDEO_TYPE_OMV"},
        ]
        results = service.ranked_music_results("Imagine Dragons Thunder", songs, videos)
        self.assertEqual([result["videoId"] for result in results[:2]], ["bbbbbbbbbbb", "ddddddddddd"])
        self.assertEqual(results[-1]["videoId"], "aaaaaaaaaaa")

    def test_search_ranking_keeps_both_song_and_video_results(self):
        songs = [{"videoId": f"songid{i:05d}"[:11], "title": f"Song {i}", "duration_seconds": 120, "artists": [{"name": "Artist"}]} for i in range(12)]
        videos = [{"videoId": f"videoid{i:04d}"[:11], "title": f"Song video {i}", "duration_seconds": 120, "artists": [{"name": "Artist"}]} for i in range(12)]
        results = service.ranked_music_results("Artist Song", songs, videos)
        ids = {result["videoId"] for result in results}
        self.assertEqual(len(results), 12)
        self.assertTrue(any(video["videoId"] in ids for video in videos))
        self.assertTrue(any(song["videoId"] in ids for song in songs))

    @patch.object(service, "youtube_page_search", side_effect=ValueError("unavailable"))
    @patch.object(service, "youtube_search", side_effect=RuntimeError("unavailable"))
    @patch.object(service, "YTMusic")
    def test_upstream_music_search_failure_is_reported(self, client, fallback, page):
        client.return_value.search.side_effect = requests.Timeout("upstream timeout")
        self.assertEqual(self.client.post("/search", json={"query": "song"}, headers=self.headers).status_code, 502)

    @patch.object(service.tasks_v2, "CloudTasksClient")
    def test_import_is_queued_not_run_in_background_thread(self, client):
        response = self.client.post("/jobs", json=self.job, headers=self.headers)
        self.assertEqual(response.status_code, 202)
        task = client.return_value.create_task.call_args.kwargs["task"]
        self.assertEqual(task.http_request.url, "https://service.example/process")
        self.assertEqual(task.dispatch_deadline.seconds, 900)
        self.assertEqual(task.http_request.headers["Authorization"], self.headers["Authorization"])

    @patch.object(service, "prepare_audio")
    @patch.object(service, "callback")
    def test_duplicate_completed_task_does_not_download(self, callback, prepare):
        callback.return_value = {"status": "ready"}
        response = self.client.post("/process", json=self.job, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        prepare.assert_not_called()

    @patch.object(service, "prepare_audio", side_effect=RuntimeError("unavailable"))
    @patch.object(service, "callback")
    def test_source_failure_is_reported(self, callback, prepare):
        callback.return_value = {"status": "queued"}
        self.assertEqual(self.client.post("/process", json=self.job, headers=self.headers).status_code, 200)
        self.assertEqual(callback.call_args.args[2], {"status": "failed"})

    @patch.object(service, "prepare_audio", side_effect=requests.ConnectionError("offline"))
    @patch.object(service, "callback")
    def test_network_failure_retries_then_reports_failed(self, callback, prepare):
        callback.return_value = {"status": "queued"}
        self.assertEqual(self.client.post("/process", json=self.job, headers=self.headers).status_code, 500)
        self.assertEqual(self.client.post("/process", json=self.job, headers={**self.headers, "X-CloudTasks-TaskRetryCount": "2"}).status_code, 200)
        self.assertEqual(callback.call_args.args[2], {"status": "failed"})

    def test_native_aac_is_copied_and_other_codecs_are_converted(self):
        for codec, expected in [("aac", "copy"), ("opus", "aac")]:
            with self.subTest(codec=codec), tempfile.TemporaryDirectory() as tmp:
                directory = Path(tmp)
                (directory / "source.webm").write_bytes(b"audio")
                (directory / "source.info.json").write_text('{"title":"Song","uploader":"Artist"}')
                def run(arguments, *args, **kwargs):
                    if arguments[0] == "ffprobe":
                        return '{"format":{"duration":"120"},"streams":[{"codec_type":"audio","codec_name":"' + codec + '"}]}'
                    if arguments[0] == "ffmpeg":
                        self.assertEqual(arguments[arguments.index("-c:a") + 1], expected)
                        Path(arguments[-1]).write_bytes(b"finished")
                    return ""
                with patch.object(service, "run", side_effect=run):
                    output, metadata = service.prepare_audio(directory, "abcdefghijk")
                    self.assertEqual(output.suffix, ".m4a")
                    self.assertEqual(metadata["duration"], 120)


if __name__ == "__main__":
    unittest.main()
