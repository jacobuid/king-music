import json
import re
import subprocess
import unicodedata
from urllib.parse import urlparse
import requests

CLIENT = "KingMusic/1.0 (https://github.com/jacobuid/king-music)"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_LYRICS_CHARS = 100000


def trusted_image_url(value):
    try:
        parsed = urlparse(value)
        return parsed.scheme == "https" and not parsed.username and not parsed.password and parsed.port in (None, 443) and any((parsed.hostname or "") == host or (parsed.hostname or "").endswith("." + host) for host in ("ytimg.com", "googleusercontent.com", "ggpht.com"))
    except (TypeError, ValueError):
        return False


def prepare_artwork(directory, video_id, original, info, run):
    candidates = [original, info.get("thumbnail")]
    candidates.extend(item.get("url") for item in list(reversed(info.get("thumbnails") or []))[:3] if isinstance(item, dict))
    candidates.extend(f"https://i.ytimg.com/vi/{video_id}/{quality}.jpg" for quality in ("maxresdefault", "hqdefault", "mqdefault"))
    seen = set()
    failed = False
    for url in candidates:
        if not isinstance(url, str) or url in seen or not trusted_image_url(url):
            continue
        seen.add(url)
        if len(seen) > 10:
            break
        try:
            # Follow only redirects to another approved image host.
            for _ in range(3):
                response = requests.get(url, stream=True, timeout=(3, 8), allow_redirects=False)
                if response.status_code in (301, 302, 303, 307, 308):
                    location = response.headers.get("Location", "")
                    response.close()
                    if not trusted_image_url(location):
                        break
                    url = location
                    continue
                break
            else:
                continue
            try:
                if response.status_code != 200:
                    failed = failed or response.status_code >= 500 or response.status_code == 429
                    continue
                if not response.headers.get("Content-Type", "").lower().startswith("image/"):
                    continue
                raw = directory / "cover-source.image"
                size = 0
                with raw.open("wb") as stream:
                    for chunk in response.iter_content(65536):
                        size += len(chunk)
                        if size > MAX_IMAGE_BYTES:
                            raise ValueError("Artwork is too large")
                        stream.write(chunk)
                dimensions = json.loads(run(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "stream=width,height", "-of", "json", str(raw)], 15))["streams"][0]
                width, height = dimensions["width"], dimensions["height"]
                if min(width, height) < 100 or max(width, height) > 8192 or width * height > 20000000:
                    continue
                output = directory / "cover.jpg"
                run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-i", str(raw), "-frames:v", "1", "-vf", "scale=800:800:force_original_aspect_ratio=decrease", "-map_metadata", "-1", "-q:v", "3", str(output)], 30)
                if 0 < output.stat().st_size <= 2 * 1024 * 1024:
                    return output, "ready"
            finally:
                response.close()
        except (requests.RequestException, RuntimeError, ValueError, KeyError, IndexError, OSError, subprocess.TimeoutExpired):
            failed = True
    return None, "failed" if failed else "missing"


def normalized(value):
    return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower())


def lyrics_for_song(metadata, video_id, youtube_lyrics):
    failed = False
    title, artist, album = (str(metadata.get(key) or "") for key in ("title", "artist", "album"))
    duration = metadata.get("duration")
    if title and artist and isinstance(duration, (int, float)) and 0 < duration <= 1200:
        try:
            response = requests.get("https://lrclib.net/api/get", params={"track_name": title, "artist_name": artist, "album_name": album, "duration": round(duration)}, headers={"User-Agent": CLIENT}, timeout=(3, 12))
            if response.status_code == 200:
                record = response.json()
                # Do not attach lyrics from a different artist, song or recording.
                matches = normalized(record.get("trackName")) == normalized(title) and normalized(record.get("artistName")) == normalized(artist) and abs(float(record.get("duration", 0)) - duration) <= 3
                if album:
                    matches = matches and normalized(record.get("albumName")) == normalized(album)
                if matches:
                    plain, synced = record.get("plainLyrics"), record.get("syncedLyrics")
                    plain = plain if isinstance(plain, str) and len(plain) <= MAX_LYRICS_CHARS else None
                    synced = synced if isinstance(synced, str) and len(synced) <= MAX_LYRICS_CHARS else None
                    instrumental = record.get("instrumental") is True
                    if plain or synced or instrumental:
                        record_id = record.get("id")
                        return {"lyricsStatus": "instrumental" if instrumental else "ready", "plainLyrics": plain, "syncedLyrics": synced, "lyricsSource": "LRCLIB", "lyricsSourceUrl": f"https://lrclib.net/api/get/{record_id}" if isinstance(record_id, int) else "https://lrclib.net"}
            elif response.status_code != 404:
                failed = True
        except (requests.RequestException, ValueError, TypeError):
            failed = True
    try:
        result = youtube_lyrics(video_id)
        text = result.get("lyrics") if isinstance(result, dict) else None
        if isinstance(text, str) and text.strip() and len(text) <= MAX_LYRICS_CHARS:
            attribution = str(result.get("source") or "YouTube Music")[:200]
            return {"lyricsStatus": "ready", "plainLyrics": text, "syncedLyrics": None, "lyricsSource": attribution, "lyricsSourceUrl": f"https://music.youtube.com/watch?v={video_id}"}
    except (requests.RequestException, RuntimeError, ValueError, KeyError, IndexError, TypeError):
        failed = True
    return {"lyricsStatus": "failed" if failed else "missing"}
