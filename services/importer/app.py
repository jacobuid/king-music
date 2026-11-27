from enrichment import prepare_artwork, lyrics_for_song
"""King Music private importer. Cloud Tasks owns the lifetime of every import."""
import hmac
import json
import logging
import os
import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

import requests
from fastapi import Depends, FastAPI, Header, HTTPException
from google.cloud import tasks_v2
from google.protobuf import duration_pb2
from pydantic import BaseModel, Field
from ytmusicapi import YTMusic
from ytmusicapi.exceptions import YTMusicError

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
VIDEO = re.compile(r"^[A-Za-z0-9_-]{11}$")
UUID = re.compile(r"^[a-f0-9-]{36}$")


def authenticated(authorization: str = Header(default="")):
    token = os.environ.get("MUSIC_SERVICE_TOKEN", "")
    if not token or not hmac.compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(401, "Unauthorized")


def run(arguments, timeout=120):
    # Never run a shell or accept user-supplied yt-dlp flags/URLs.
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        diagnostic = result.stderr[-2000:]
        if "--cookies" in arguments:
            # Parser errors can echo a cookie row. Keep authenticated stderr private.
            diagnostic = "Authenticated download failed; detailed output withheld"
            for needle, message in (("challenge solving failed", "YouTube JavaScript challenge could not be solved"), ("requested format is not available", "Requested source format is unavailable"), ("only images are available", "Source exposes images but no playable streams"), ("not a bot", "YouTube still requires sign-in verification"), ("http error 403", "Source returned HTTP 403"), ("po token", "Source requires an additional playback token"), ("cookies are no longer valid", "YouTube session cookies are no longer valid")):
                if needle in result.stderr.lower():
                    diagnostic = message
                    break
        logging.getLogger('king_sports.music').warning('Media command failed (%s): %s', arguments[0], diagnostic)
        raise RuntimeError("Media processing failed")
    return result.stdout


def downloader(*args):
    return ["yt-dlp", "--ignore-config", "--js-runtimes", "node", "--no-playlist", "--socket-timeout", "20", *args]


def youtube_cookie_arguments(directory):
    configured = os.environ.get("YOUTUBE_COOKIES_FILE")
    if not configured:
        return []
    source = Path(configured)
    if source.stat().st_size > 65536:
        raise RuntimeError("YouTube cookie file exceeds the secret size limit")
    lines = source.read_text(encoding="utf-8-sig").splitlines()
    if not lines or lines[0].strip() not in ("# Netscape HTTP Cookie File", "# HTTP Cookie File"):
        raise RuntimeError("YouTube cookies must use Netscape cookies.txt format")
    selected = ["# Netscape HTTP Cookie File"]
    for line in lines[1:]:
        if not line.strip() or (line.startswith("#") and not line.startswith("#HttpOnly_")):
            continue
        fields = line.split("\t")
        if len(fields) != 7:
            raise RuntimeError("Invalid YouTube cookie file format")
        domain = fields[0].removeprefix("#HttpOnly_").lstrip(".").lower()
        # An accidental whole-browser export must not send other account cookies.
        if domain == "youtube.com" or domain.endswith(".youtube.com"):
            selected.append(line)
    if len(selected) == 1:
        raise RuntimeError("Cookie file contains no YouTube cookies")
    # yt-dlp rewrites its cookie jar. Never write back to the read-only secret mount
    # or share a mutable jar between simultaneous requests.
    cookie_copy = directory / "youtube-cookies.txt"
    cookie_copy.touch(mode=0o600, exist_ok=False)
    cookie_copy.write_text("\n".join(selected) + "\n", encoding="utf-8")
    return ["--cookies", str(cookie_copy)]


class Search(BaseModel):
    query: str = Field(min_length=3, max_length=100)


class MusicSession(requests.Session):
    def request(self, method, url, **kwargs):
        kwargs.setdefault("timeout", 15)
        return super().request(method, url, **kwargs)


def music_result(entry):
    video_id = entry.get("videoId", "")
    duration = entry.get("duration_seconds")
    if not isinstance(video_id, str) or not VIDEO.fullmatch(video_id) or entry.get("isAvailable") is False:
        return None
    if not isinstance(duration, (int, float)) or isinstance(duration, bool) or not 0 < duration <= 1200:
        return None
    artist = ", ".join(a["name"] for a in entry.get("artists", []) if isinstance(a, dict) and isinstance(a.get("name"), str))
    thumbnail = f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"
    for candidate in reversed(entry.get("thumbnails") or []):
        url = candidate.get("url", "") if isinstance(candidate, dict) else ""
        parsed = urlparse(url)
        host = parsed.hostname or ""
        if parsed.scheme == "https" and any(host == domain or host.endswith("." + domain) for domain in ("googleusercontent.com", "ytimg.com", "ggpht.com")):
            thumbnail = url
            break
    album = entry.get("album") or {}
    return {"videoId": video_id, "title": str(entry.get("title") or "Untitled")[:200], "artist": artist[:100], "album": str(album.get("name") or "")[:150] if isinstance(album, dict) else "", "duration": duration, "thumbnail": thumbnail, "isExplicit": entry.get("isExplicit") if isinstance(entry.get("isExplicit"), bool) else None}


def search_text(value):
    value = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()
    return " ".join(re.findall(r"[a-z0-9]+", value))


UNWANTED_VARIANTS = ("cover", "karaoke", "reaction", "remix", "live", "sped up", "slowed", "nightcore", "8d", "instrumental")
OFFICIAL_VIDEO_TYPES = {"MUSIC_VIDEO_TYPE_ATV", "MUSIC_VIDEO_TYPE_OMV"}


def search_score(query, entry, source, position):
    wanted = search_text(query)
    title = search_text(entry.get("title"))
    artists = " ".join(search_text(artist.get("name")) for artist in entry.get("artists", []) if isinstance(artist, dict))
    searchable = f"{title} {artists}".strip()
    tokens = wanted.split()
    score = 0
    if title == wanted:
        score += 120
    if searchable == wanted or f"{artists} {title}".strip() == wanted:
        score += 90
    if wanted and wanted in title:
        score += 45
    if tokens and all(token in searchable.split() for token in tokens):
        score += 55
    score += sum(9 for token in tokens if token in searchable.split())
    if source == "song":
        score += 14
    if entry.get("videoType") in OFFICIAL_VIDEO_TYPES:
        score += 18
    for variant in UNWANTED_VARIANTS:
        if variant in searchable and variant not in wanted:
            score -= 32
    return score - position * 1.5


def ranked_music_results(query, song_entries, video_entries, limit=12):
    candidates = {}
    for source, entries in (("song", song_entries), ("video", video_entries)):
        for position, entry in enumerate(entries):
            result = music_result(entry)
            if not result:
                continue
            candidate = (search_score(query, entry, source, position), source, result)
            previous = candidates.get(result["videoId"])
            if previous is None or candidate[0] > previous[0]:
                candidates[result["videoId"]] = candidate
    ranked = sorted(candidates.values(), key=lambda candidate: candidate[0], reverse=True)
    selected = []
    deferred = []
    source_counts = {"song": 0, "video": 0}
    source_cap = 7
    for candidate in ranked:
        _, source, result = candidate
        if source_counts[source] >= source_cap:
            deferred.append(result)
            continue
        selected.append(result)
        source_counts[source] += 1
        if len(selected) == limit:
            break
    selected.extend(deferred[:max(0, limit - len(selected))])
    return selected


class Job(BaseModel):
    id: str
    videoId: str
    callbackUrl: str
    enrichOnly: bool = False


def check_job(job):
    origin = os.environ["API_ORIGIN"].rstrip("/")
    if not UUID.fullmatch(job.id) or not VIDEO.fullmatch(job.videoId):
        raise HTTPException(400, "Invalid job")
    if job.callbackUrl != f"{origin}/api/internal/music/{job.id}":
        raise HTTPException(400, "Invalid callback")


@app.post("/search", dependencies=[Depends(authenticated)])
def search(body: Search):
    try:
        # Each request has an anonymous client/session; no account cookies are used.
        with MusicSession() as session:
            client = YTMusic(requests_session=session)
            songs = client.search(body.query.strip(), filter="songs", limit=12)
            videos = client.search(body.query.strip(), filter="videos", limit=12)
        return {"results": ranked_music_results(body.query, songs, videos)}
    except (YTMusicError, requests.RequestException, ValueError, KeyError, IndexError):
        raise HTTPException(502, "Search unavailable")


@app.post("/jobs", status_code=202, dependencies=[Depends(authenticated)])
def enqueue(job: Job):
    check_job(job)
    client = tasks_v2.CloudTasksClient()
    parent = client.queue_path(os.environ["GOOGLE_CLOUD_PROJECT"], os.environ["TASKS_LOCATION"], os.environ.get("TASKS_QUEUE", "king-music-music"))
    task = tasks_v2.Task(http_request=tasks_v2.HttpRequest(
        http_method=tasks_v2.HttpMethod.POST,
        url=f"{os.environ['SERVICE_URL'].rstrip('/')}/process",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {os.environ['MUSIC_SERVICE_TOKEN']}"},
        body=job.model_dump_json().encode(),
    ), dispatch_deadline=duration_pb2.Duration(seconds=900))
    client.create_task(parent=parent, task=task)
    return {"queued": True}


def callback(job, method="GET", data=None, suffix=""):
    response = requests.request(method, job.callbackUrl + suffix, headers={"Authorization": f"Bearer {os.environ['MUSIC_SERVICE_TOKEN']}"}, json=data, timeout=30)
    if not response.ok:
        # Log only known validation messages, never arbitrary response text or credentials.
        try:
            detail = response.json().get("error")
        except (ValueError, AttributeError):
            detail = None
        allowed = {"Audio upload is missing or invalid", "Artwork or lyrics data is invalid", "Song is not ready", "Artwork upload is missing or invalid"}
        logging.warning("Import callback rejected: status=%s reason=%s", response.status_code, detail if detail in allowed else "request rejected")
    response.raise_for_status()
    return response.json()


def prepare_audio(directory, video_id):
    source = f"https://www.youtube.com/watch?v={video_id}"
    # Prefer native AAC/M4A for broad iPhone/Android support, avoiding re-encoding.
    run(downloader(*youtube_cookie_arguments(directory), "--max-filesize", "50M", "--match-filters", "!is_live & duration <= 1200", "--write-info-json", "--no-write-thumbnail", "-f", "bestaudio[ext=m4a]/bestaudio", "-o", str(directory / "source.%(ext)s"), "--", source), timeout=540)
    candidates = [p for p in directory.glob("source.*") if p.suffix in (".m4a", ".webm", ".opus", ".ogg", ".mp4")]
    if len(candidates) != 1 or candidates[0].stat().st_size > 50 * 1024 * 1024:
        raise RuntimeError("No suitable audio stream")
    original = candidates[0]
    metadata = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(original)], 30))
    duration = float(metadata["format"]["duration"])
    if not 0 < duration <= 1200:
        raise RuntimeError("Track duration exceeds limit")
    audio = next(s for s in metadata["streams"] if s["codec_type"] == "audio")
    output = directory / "track.m4a"
    codec = ["-c:a", "copy"] if audio["codec_name"] == "aac" else ["-c:a", "aac", "-b:a", "192k"]
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(original), "-map", "0:a:0", "-vn", *codec, "-movflags", "+faststart", str(output)], 120)
    if output.stat().st_size > 50 * 1024 * 1024:
        raise RuntimeError("Audio exceeds size limit")
    info = json.loads((directory / "source.info.json").read_text())
    return output, {"status": "ready", "title": str(info.get("track") or info.get("title") or "Untitled")[:200], "artist": str(info.get("artist") or info.get("uploader") or "")[:100], "duration": duration, "album": str(info.get("album") or "")[:200]}


def youtube_lyrics(video_id):
    try:
        with MusicSession() as session:
            client = YTMusic(requests_session=session)
            watch = client.get_watch_playlist(videoId=video_id, limit=1)
            return client.get_lyrics(watch["lyrics"]) if watch.get("lyrics") else {}
    except (YTMusicError, requests.RequestException, ValueError, KeyError, IndexError) as error:
        raise RuntimeError("Lyrics lookup failed") from error


def upload_file(job, path, suffix, mime):
    upload = callback(job, "POST", suffix=suffix)["url"]
    parsed = urlparse(upload)
    if parsed.scheme != "https" or parsed.hostname != urlparse(os.environ["B2_ENDPOINT"]).hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise RuntimeError("Invalid storage endpoint")
    with path.open("rb") as stream:
        response = requests.put(upload, data=stream, headers={"Content-Type": mime}, timeout=120)
        response.raise_for_status()


def enrich_song(directory, job, state, metadata, info):
    result = {"duration": metadata.get("duration")}
    if state.get("needArtwork", True):
        artwork, status = prepare_artwork(directory, job.videoId, state.get("thumbnail"), info, run)
        result["artworkStatus"] = status
        if artwork:
            try:
                upload_file(job, artwork, "/artwork-upload", "image/jpeg")
                result["artworkUploaded"] = True
            except (requests.RequestException, RuntimeError):
                result["artworkStatus"] = "failed"
    else:
        result["artworkStatus"] = "ready"
    if state.get("needLyrics", True):
        result.update(lyrics_for_song(metadata, job.videoId, youtube_lyrics))
    return result


@app.post("/process", dependencies=[Depends(authenticated)])
def process(job: Job, x_cloudtasks_taskretrycount: str = Header(default="0")):
    check_job(job)
    state = callback(job)
    if job.enrichOnly:
        if state["status"] != "ready" or (not state.get("needArtwork", True) and not state.get("needLyrics", True)):
            return {"ok": True}
    elif state["status"] in ("ready", "failed"):
        return {"ok": True}
    else:
        callback(job, "POST", {"status": "processing"})
    try:
        with tempfile.TemporaryDirectory(prefix="king-music-") as temporary:
            directory = Path(temporary)
            if job.enrichOnly:
                # Repairs fetch metadata and images, never download the audio again.
                try:
                    info = json.loads(run(downloader(*youtube_cookie_arguments(directory), "--skip-download", "--dump-single-json", "--", f"https://www.youtube.com/watch?v={job.videoId}"), 60))
                except (RuntimeError, ValueError, subprocess.TimeoutExpired):
                    info = {}
                metadata = {"title": state.get("title"), "artist": state.get("artist"), "album": state.get("album"), "duration": state.get("duration") or info.get("duration")}
            else:
                audio, metadata = prepare_audio(directory, job.videoId)
                info = json.loads((directory / "source.info.json").read_text())
                for key in ("title", "artist", "album"):
                    if state.get(key) and state[key] not in ("Importing song", "YouTube song"):
                        metadata[key] = state[key]
                upload_file(job, audio, "/upload", "audio/mp4")
            enriched = enrich_song(directory, job, state, metadata, info)
            if job.enrichOnly:
                callback(job, "POST", {"enrichment": enriched}, suffix="/enrichment")
            else:
                callback(job, "POST", {**metadata, "enrichment": enriched})
    except (RuntimeError, subprocess.TimeoutExpired, ValueError, KeyError, StopIteration, FileNotFoundError):
        if job.enrichOnly:
            callback(job, "POST", {"enrichment": {"artworkStatus": "failed", "lyricsStatus": "failed"}}, suffix="/enrichment")
        else:
            callback(job, "POST", {"status": "failed"})
    except requests.RequestException:
        if x_cloudtasks_taskretrycount.isdigit() and int(x_cloudtasks_taskretrycount) >= 2:
            if job.enrichOnly:
                callback(job, "POST", {"enrichment": {"artworkStatus": "failed", "lyricsStatus": "failed"}}, suffix="/enrichment")
            else:
                callback(job, "POST", {"status": "failed"})
        else:
            raise
    return {"ok": True}


class PlaylistRequest(BaseModel):
    playlistId: str = Field(pattern=r"^[A-Za-z0-9_-]{10,150}$")


@app.get("/health", dependencies=[Depends(authenticated)])
def health():
    return {"ok": True}


@app.post("/playlist", dependencies=[Depends(authenticated)])
def playlist(body: PlaylistRequest):
    try:
        with MusicSession() as session:
            data = YTMusic(requests_session=session).get_playlist(body.playlistId, limit=101)
        entries = data.get("tracks") or []
        if len(entries) > 100 or int(data.get("trackCount") or len(entries)) > 100:
            raise HTTPException(400, "Playlists are limited to 100 tracks")
        results, seen, skipped = [], set(), 0
        for entry in entries:
            result = music_result(entry)
            if not result or result["videoId"] in seen:
                skipped += 1
                continue
            seen.add(result["videoId"])
            results.append(result)
        if not results:
            raise HTTPException(400, "No available songs in this playlist")
        return {"title": str(data.get("title") or "Imported playlist")[:80], "tracks": results, "skipped": skipped}
    except (YTMusicError, requests.RequestException, ValueError, KeyError, IndexError):
        raise HTTPException(502, "Playlist unavailable")


class Batch(BaseModel):
    jobs: list[Job] = Field(min_length=1, max_length=100)


@app.post("/jobs/batch", status_code=202, dependencies=[Depends(authenticated)])
def enqueue_batch(body: Batch):
    # Validate the entire batch before creating any task.
    for job in body.jobs:
        check_job(job)
    for job in body.jobs:
        enqueue(job)
    return {"queued": len(body.jobs)}

class CollectionDetailsRequest(BaseModel):
    kind: str = Field(pattern="^(artist|album)$")
    artist: str = Field(min_length=1, max_length=200)
    album: str = Field(default="", max_length=200)
    videoIds: list[str] = Field(min_length=1, max_length=3)


@app.post("/collection/details", dependencies=[Depends(authenticated)])
def collection_details(body: CollectionDetailsRequest):
    if any(not VIDEO.fullmatch(video) for video in body.videoIds):
        raise HTTPException(400, "Invalid video ID")
    wanted_artist = search_text(body.artist)
    failed = False
    with MusicSession() as session:
        client = YTMusic(requests_session=session)
        for video_id in body.videoIds:
            try:
                watch = client.get_watch_playlist(videoId=video_id, limit=1)
                track = next((track for track in watch.get("tracks", []) if track.get("videoId") == video_id), None)
                if not track:
                    continue
                artists = track.get("artists") or []
                artist = next((artist for artist in artists if search_text(artist.get("name")) == wanted_artist), None)
                if not artist:
                    continue
                if body.kind == "artist":
                    source_id = artist.get("id")
                    if not isinstance(source_id, str) or not re.fullmatch(r"UC[A-Za-z0-9_-]{10,64}", source_id):
                        continue
                    data = client.get_artist(source_id)
                    if search_text(data.get("name")) != wanted_artist:
                        continue
                    source_url = "https://music.youtube.com/channel/" + source_id
                else:
                    album = track.get("album") or {}
                    source_id = album.get("id")
                    if search_text(album.get("name")) != search_text(body.album) or not isinstance(source_id, str) or not re.fullmatch(r"MPRE[A-Za-z0-9_-]{3,100}", source_id):
                        continue
                    data = client.get_album(source_id)
                    if search_text(data.get("title")) != search_text(body.album) or not any(search_text(artist.get("name")) == wanted_artist for artist in data.get("artists", [])):
                        continue
                    source_url = "https://music.youtube.com/browse/" + source_id
                description = data.get("description")
                return {"description": description[:20000] if isinstance(description, str) else None, "year": str(data.get("year")) if body.kind == "album" and data.get("year") else None, "sourceUrl": source_url}
            except (YTMusicError, requests.RequestException, ValueError, KeyError, IndexError, TypeError):
                failed = True
    if failed:
        raise HTTPException(502, "Collection information unavailable")
    return {"description": None, "year": None, "sourceUrl": None}
