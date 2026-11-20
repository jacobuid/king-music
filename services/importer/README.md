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
