# King Music importer

Separate Cloud Run service and Cloud Tasks queue for account-shared music imports. Uses ytmusicapi for catalog search and playlist discovery, yt-dlp for source audio, and FFmpeg for AAC/M4A preparation. Cloudflare authenticates users, checks password-confirmed management sessions, and stores progress in D1. Only expiring B2 upload URLs are sent to the importer; no B2 keys or Cloudflare account credentials are sent to it.

Adults can search/preview/import a song, paste a song URL, or preview and import a public/unlisted YouTube playlist (up to 100 source entries). Available entries retain their source order; unavailable and repeated entries are skipped with a count. One durable task processes each song, so closing the app does not stop imports. Songs already imported on that KingAuth account are reused. Failed songs can be retried. Imports are limited to 100 new jobs/account/day, 20 minutes/song and 50 MiB output/song. Newly imported songs are unavailable to kids until an adult enables the flag in Manage Music.

## Deployment

Run `npm run deploy:importer` after `gcloud auth login`. The script defaults to the existing King Sports Google project, creates separate King Music service-account/queue/token resources, deploys at min=0/max=1 with one queue dispatch at a time, installs the service URL/token in the King Music Worker, and saves those values as repository secrets. Override `GCP_PROJECT_ID`, `GCP_REGION`, `GCLOUD_PATH`, `API_ORIGIN`, or `GITHUB_REPOSITORY` if needed. The deployed service, queue and runtime account use the name `king-music-music` inside the existing KingSports project; this is a separate service, not a second Google project. It reads existing bootstrap credentials from ignored `.env.bootstrap` and never prints token values. Run the API migrations/deployment before using the service.

The service is reachable at the network level but every endpoint requires its private token. Callback origins and storage hosts are restricted to operator-configured origins. The browser receives neither this service token nor storage credentials. Cloud Tasks has three attempts with a 15-minute deadline. Source/codec failures are terminal until explicitly retried; transient network/storage errors retry automatically.

The importer uses the owner-authorized `king-sports-youtube-cookies` Google Secret Manager session secret. King Music has its own read permission and mounts the secret directly; it does not copy or print the cookie contents. The deployment script detects it without printing its contents, mounts it read-only, and the service filters to YouTube domains and makes a temporary private copy per job. Set `YOUTUBE_COOKIES_SECRET` explicitly to use a different authorized secret. This is optional and does not guarantee source availability. No browser-cookie extraction is performed. Set `YOUTUBE_COOKIES_SECRET=king-music-youtube-cookies` to switch to a separately configured session later.

## Verification

`PYTHONPATH=services/importer python -m unittest discover -s services/importer/tests -v`

Tests mock external services and send no production requests. A successful deployment/search does not establish that YouTube downloads work from Cloud Run; test an actual permitted source after deploying. yt-dlp can encounter source availability or verification errors, which appear as failed jobs.

## Stored artwork and lyrics

New YouTube imports retain M4A/AAC audio in B2. The importer tries the original artwork URL, fresh source thumbnails, and YouTube image CDN fallbacks; it downloads, validates and converts the selected image into a bounded JPEG, then uploads it to `music/<media-id>/cover.jpg` in B2. The Worker checks object type/size before saving `media.thumbnail_key`. The external URL is retained only as a source reference.

Lyrics are stored as text in D1's `song_enrichment` table, including plain text, timed LRC text, source/attribution URL, duration, and separate artwork/lyrics statuses. LRCLIB is queried with track, artist, album and duration; mismatched results are rejected. YouTube Music's video-specific lyrics are the fallback. Missing or failed lyrics and missing artwork do not prevent the M4A import from completing.

Manage Music → **Repair artwork & lyrics** queues up to 25 existing imported songs per click. Repairs use the existing durable Cloud Tasks queue and never re-download or overwrite the audio. Pending repairs are not queued twice; jobs abandoned for two hours can be queued again. Run repair again to cover additional songs or retry missing sources. This repair currently targets songs imported through YouTube, which have an import-job/source reference.

Deployment requires D1 migration `0013_song_enrichment.sql`, the updated API Worker, the updated Cloud Run image (which now includes `enrichment.py`), and the updated web app. Apply the migration before deploying the updated Worker. No production migration, backfill or deployment is performed by a local build.

Provider references: https://lrclib.net/docs and https://ytmusicapi.readthedocs.io/en/stable/reference/browsing.html
## YouTube extraction failures

Use yt-dlp 2026.11.23 or newer. The previously deployed 2026.10.26 build failed YouTube JavaScript challenges from Cloud Run and exposed only storyboard images, producing a misleading requested-format error for otherwise playable songs. A same-image, same-session Cloud Run comparison restored AAC format 140 for both affected sources after upgrading only yt-dlp. See the [upstream release](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.11.23), including updated YouTube player handling. Rebuild and redeploy the importer to update its installed package; deploying only the frontend or Worker does not rebuild Cloud Run.

Downloader warnings are captured so the logger can classify challenge failures, missing formats, and verification problems. Authenticated stderr remains private; only fixed, recognized diagnostic messages are logged.

Song search prefers structured YouTube Music metadata. If the Music API returns a blocked HTML/non-JSON response, metadata-only YouTube search supplies results through the existing authenticated importer session. Successful Music song results are retained if only its video query fails. Fallback results use the same ID, duration, artwork-host validation, deduplication, and relevance ranking; no audio is imported until the listener chooses Download.
