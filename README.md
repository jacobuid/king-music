# King Music

A music playlist PWA using React, KingAuth, Cloudflare Workers/D1, and private Backblaze B2 storage.

Users sign in with one KingAuth account, then select one of their profiles and enter its four-digit PIN. Profiles are **adult** or **kids**. The first profile is adult. Creating any profile requires a fresh KingAuth password confirmation. Manage Music is available from an unlocked adult profile without an additional password prompt. It is hidden from kids, and the API rejects their management requests. Kids can listen and create their own playlists, but cannot access Admin. Songs must be explicitly marked available to kids to appear or play in a kids profile.

The Library supports songs, albums in track order, and playlists owned by each profile. Songs use the `music/` object prefix, with artist, album, track number and kids availability stored in D1. The music library belongs to the KingAuth account and is shared by all its profiles. Playlists remain personal to a profile. Adults can edit song metadata and bulk-update kids availability from Manage Music. Adults can upload MP3, M4A, AAC, FLAC, OGG, OPUS, or WAV audio up to 100 MiB from Admin. The Worker issues an expiring, object-specific B2 PUT URL, then verifies the stored size and content type before adding the song to D1. Files remain in a private bucket; playback uses expiring signed URLs and supports seeking.

## Development

Use Node.js 24+ and Git. Run `npm ci`, copy `apps/web/.env.example` to `apps/web/.env`, and leave `VITE_API_URL` blank for local development. Vite forwards `/api` to the local Worker on port 8787; run both development servers. For a hosted frontend, set `VITE_API_URL` to the real Worker URL before building. Configure the API's `WEB_ORIGIN` to the exact frontend origin (`http://localhost:5173` locally). Set `APP_SIGNING_SECRET` to a random secret of at least 32 bytes in ignored `services/api/.dev.vars`, alongside B2 runtime credentials. KingAuth uses its shared production service by default; no publishable key or auth adapter is needed. Store ownership using its permanent user UUID.

Apply migrations with `npx wrangler d1 migrations apply DB --local --config services/api/wrangler.jsonc`, then run `npm run dev:api` and `npm run dev:web`. Run `npm run check` and `npm test` before committing.

PINs use salted, secret-keyed HMAC hashes and five failed attempts lock a profile for five minutes. Random profile session tokens expire after 24 hours and are checked against account ownership on every request. Profile tokens remain in memory, so reloading asks for the PIN again. PIN reset and profile editing are not yet exposed.

The PWA caches its public app shell. Authentication, private API responses and audio are fetched online; offline music downloads are not implemented. Install from a supported browser over HTTPS or localhost.

## Deployment

Set repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `APP_SIGNING_SECRET`, `B2_BOOTSTRAP_KEY_ID`, `B2_BOOTSTRAP_APPLICATION_KEY`. Copy `.env.bootstrap.example` to ignored `.env.bootstrap` and use `scripts/bootstrap-secrets.ps1` to configure these. Run **Provision infrastructure**, set the `VITE_API_URL` repository variable to the Worker URL, enable GitHub Pages with GitHub Actions, and run **Web**. Workflows apply migrations and install runtime secrets before deploying the Worker. D1 is provisioned directly through Cloudflare; the legacy Pulumi directory is not used by this workflow.

Existing starter profiles retain their IDs but need a PIN and an adult designation provisioned before use. Existing authentication-provider IDs are not automatically mapped to KingAuth UUIDs; migrate ownership explicitly before using an existing production database.

## Provisioned King Music backend

- API: https://king-music-api.jacobuid-king-videos.workers.dev
- Health: https://king-music-api.jacobuid-king-videos.workers.dev/api/health
- D1 database: `king-music-prod`
- Private encrypted B2 bucket: `jacobuid-king-music`

The Worker URL uses the existing account's workers.dev namespace. The Worker, database, bucket, and bucket-scoped runtime key are separate King Music resources. Local and GitHub Pages frontend origins are allowed. No storage keys are sent to the browser.

To provision or repair this repository, run `node scripts/setup-backend.mjs` using ignored `.env.bootstrap`, or pass a credential file path explicitly. The setup preserves King Music's signing secret, creates or reuses D1 and the bucket, applies migrations, installs Worker and GitHub secrets, sets the GitHub `VITE_API_URL` variable, and writes ignored local environment files. Do not delete the saved signing secret: existing PIN hashes depend on it.

Run `node scripts/verify-storage.mjs` for a real upload/range-playback/private-access check. It requires the ignored bootstrap and runtime configuration files and removes its temporary audio object afterward. No account or profile is fabricated for this check. Catalog and upload authorization are covered by `npm test`.

Incomplete uploads do not appear in the library. An interrupted or expired upload may leave an unlisted B2 object; lifecycle cleanup and catalog editing are not implemented yet. Reprovisioning retains previous runtime keys so existing deployments keep working; retire old King Music keys manually after confirming the replacement is healthy.

## Album-folder imports

Run `node scripts/import-songs.mjs "C:/path/to/Songs" <MusicBrainz-release-ID>` to match MP3 filenames to a release, fetch Cover Art Archive artwork, store files privately in B2, and add ordered catalog entries. The importer verifies every filename before uploading, uses content hashes to avoid duplicate objects on reruns, verifies byte-range playback, and preserves existing kids visibility. It never edits the source files. Runtime and Cloudflare credentials are read from the existing ignored setup files. Newly imported songs start with kids availability off.

The initial library contains the 17-track Church Music album by David Crowder Band, matched to MusicBrainz release `59b8f823-ea0a-4c36-ba43-1af06e28c814`.

## YouTube imports

The Songs page searches the visible library for everyone. Adults also receive YouTube Music matches, ranked together with library songs by relevance (exact song titles first, imported songs preferred only for ties). Download controls import missing songs with circular activity indicators, then become Play controls. Kids never request or see external discovery. Manage Music keeps song-URL import, playlist-URL preview/import, embedded previews, per-track progress, and retries. The separate Cloud Run service uses ytmusicapi, yt-dlp, and FFmpeg with Cloud Tasks. Imports reuse songs already in the same account and keep playlist order. New imports are unavailable to kids until an adult enables the flag. See [importer operations](services/importer/README.md) for deployment, limits, and source-availability checks.

Manage Music uses the active adult profile session. Profile management still requires account-password confirmation; its management sessions expire after 30 minutes and stay in memory. Profile creation consumes a separate single-use password proof. Music files, metadata, and import history are isolated by KingAuth user UUID; a kids profile never receives adult-only songs through library, playlist, or playback endpoints.
