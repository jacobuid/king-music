import type { Env } from './index'
import { inspectObject } from './storage'
export type EnrichmentInput = { artworkUploaded?: boolean; artworkStatus?: string; lyricsStatus?: string; plainLyrics?: string | null; syncedLyrics?: string | null; lyricsSource?: string; lyricsSourceUrl?: string; duration?: number }
export async function enrichmentStatements(env: Env, mediaId: string, data?: EnrichmentInput) {
  if (!data) return { coverKey: null, statements: [] as D1PreparedStatement[] }
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid enrichment')
  const text = (value: unknown, max: number) => { if (value == null) return null; if (typeof value !== 'string' || value.length > max) throw new Error('Invalid enrichment text'); return value.trim() || null }
  let artwork = ['ready','missing','failed'].includes(data.artworkStatus || '') ? data.artworkStatus! : 'missing'
  let lyrics = ['ready','missing','failed','instrumental'].includes(data.lyricsStatus || '') ? data.lyricsStatus! : 'missing'
  const plain = text(data.plainLyrics,100000), synced = text(data.syncedLyrics,100000), source = text(data.lyricsSource,200)
  const sourceUrl = text(data.lyricsSourceUrl,1000)
  if (sourceUrl) { const url = new URL(sourceUrl); if (url.protocol !== 'https:' || url.username || url.password || !['lrclib.net','music.youtube.com'].includes(url.hostname)) throw new Error('Invalid lyrics source') }
  if (lyrics === 'ready' && !plain && !synced) lyrics = 'missing'
  let coverKey: string | null = null
  if (data.artworkUploaded === true) {
    coverKey = `music/${mediaId}/cover.jpg`
    const object = await inspectObject(env,coverKey)
    if (!object || object.mime !== 'image/jpeg' || !Number.isFinite(object.size) || object.size <= 0 || object.size > 2*1024*1024) throw new Error('Artwork upload is missing or invalid')
    artwork = 'ready'
  } else if (artwork === 'ready') { const existing=await env.DB.prepare('SELECT thumbnail_key FROM media WHERE id=?').bind(mediaId).first<{thumbnail_key:string|null}>();artwork=existing?.thumbnail_key?'ready':'missing' }
  const duration = typeof data.duration === 'number' && Number.isFinite(data.duration) && data.duration > 0 && data.duration <= 1200 ? data.duration : null
  const statements = [env.DB.prepare(`INSERT INTO song_enrichment(media_id,artwork_status,lyrics_status,lyrics_plain,lyrics_synced,lyrics_source,lyrics_source_url,duration_seconds) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(media_id) DO UPDATE SET
    artwork_status=CASE WHEN song_enrichment.artwork_status='ready' THEN 'ready' ELSE excluded.artwork_status END,
    lyrics_status=CASE WHEN excluded.lyrics_status IN ('ready','instrumental') THEN excluded.lyrics_status WHEN song_enrichment.lyrics_status IN ('ready','instrumental') THEN song_enrichment.lyrics_status ELSE excluded.lyrics_status END,
    lyrics_plain=CASE WHEN excluded.lyrics_status IN ('ready','instrumental') THEN excluded.lyrics_plain ELSE song_enrichment.lyrics_plain END,
    lyrics_synced=CASE WHEN excluded.lyrics_status IN ('ready','instrumental') THEN excluded.lyrics_synced ELSE song_enrichment.lyrics_synced END,
    lyrics_source=COALESCE(excluded.lyrics_source,song_enrichment.lyrics_source),lyrics_source_url=COALESCE(excluded.lyrics_source_url,song_enrichment.lyrics_source_url),
    duration_seconds=COALESCE(excluded.duration_seconds,song_enrichment.duration_seconds),updated_at=CURRENT_TIMESTAMP`).bind(mediaId,artwork,lyrics,lyrics==='ready'?plain:null,lyrics==='ready'?synced:null,source,sourceUrl,duration)]
  return { coverKey, statements }
}
