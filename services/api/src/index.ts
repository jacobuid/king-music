import {songRequestRoutes} from './song-requests'
import {collectionDetailsRoute} from './collection-details'
import { homeActivityRoutes } from './home-activity'
import { managementRoute, managementAccess } from './management'
import { importRoutes, importCallback } from './imports'
import { musicRoutes } from './music'
import { authorize } from './auth'
import { profileAccess, profileRoutes } from './profiles'
import { allowedKey, playbackUrl as b2Url, downloadUrl } from './storage'
import { uploadRoutes } from './uploads'

export interface Env { DB: D1Database; APP_SIGNING_SECRET: string; B2_KEY_ID: string; B2_APPLICATION_KEY: string; B2_ENDPOINT: string; B2_BUCKET: string; WEB_ORIGIN: string; WEB_ORIGINS?: string; MUSIC_SERVICE_URL?: string; MUSIC_SERVICE_TOKEN?: string }
type Media = { id: string; title: string; description: string; category: string; video_key: string; thumbnail_key: string | null; mime_type: string; created_at: string; artist: string; album: string; track_number: number; kids_allowed: number; thumbnail_url: string | null; artwork_status?: string; lyrics_status?: string; youtube_video_id?: string; duration_seconds?: number; play_count?:number }

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const allowedOrigins = (env.WEB_ORIGINS || env.WEB_ORIGIN).split(',').map(value => value.trim())
    const cors = { 'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : env.WEB_ORIGIN, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Profile-Token, X-Manage-Token, X-Reauthentication-Proof', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Vary': 'Origin' }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })
    try {
      if (new URL(request.url).pathname === '/api/health' && request.method === 'GET') {
        await env.DB.prepare('SELECT id FROM uploads LIMIT 1').all()
        return withCors(json({ ok: true, service: 'king-music-api' }), cors)
      }
      if (new URL(request.url).pathname.startsWith('/api/internal/music/')) return withCors(await importCallback(request, env), cors)
      const userId = await authorize(request, env)
      if (!userId) return withCors(json({ error: 'Unauthorized' }, 401), cors)
      const url = new URL(request.url)
      const path = url.pathname
      const manageResponse = await managementRoute(request,env,userId)
      if(manageResponse)return withCors(manageResponse,cors)
      const profileResponse = await profileRoutes(request, env, userId)
      if (profileResponse) return withCors(profileResponse, cors)
      const manager = await managementAccess(request,env,userId)
      const active = await profileAccess(request, env, userId) || manager
      if (/^\/api\/admin\/(catalog|uploads|imports)(\/|$)/.test(path) && active?.role!=='adult') return withCors(json({error:'Adult profile required'},403),cors)
      if (!active) return withCors(json({ error: 'Unlock a profile first' }, 403), cors)
      const requestResponse=await songRequestRoutes(request,env,active)
      if(requestResponse)return withCors(requestResponse,cors)
      const importResponse = await importRoutes(request, env, active)
      if (importResponse) return withCors(importResponse, cors)
      const uploadResponse = await uploadRoutes(request, env, active)
      if (uploadResponse) return withCors(uploadResponse, cors)
      const activityResponse=await homeActivityRoutes(request,env,active)
      if(activityResponse)return withCors(activityResponse,cors)
      const detailsResponse=await collectionDetailsRoute(request,env,active)
      if(detailsResponse)return withCors(detailsResponse,cors)
      const musicResponse = await musicRoutes(request, env, active)
      if (musicResponse) return withCors(musicResponse, cors)
      if (path === '/api/admin/profiles' && request.method === 'GET') {
        if (active.role !== 'adult') return withCors(json({ error: 'Adult profile required' }, 403), cors)
        return withCors(json((await env.DB.prepare('SELECT id,name,role FROM profiles WHERE user_id=?').bind(userId).all()).results), cors)
      }
      if ((path === '/api/library' || path === '/api/home' || path === '/api/search') && request.method === 'GET') {
        const search = (url.searchParams.get('q') || '').slice(0,100)
        const rows = await env.DB.prepare('SELECT m.*,e.artwork_status,e.lyrics_status,e.duration_seconds,COALESCE(c.play_count,0) AS play_count FROM media m LEFT JOIN song_enrichment e ON e.media_id=m.id LEFT JOIN (SELECT media_id,SUM(play_count) AS play_count FROM profile_song_history GROUP BY media_id) c ON c.media_id=m.id WHERE m.user_id=? AND m.title LIKE ? AND (?=1 OR m.kids_allowed=1) ORDER BY m.album,m.track_number,m.title').bind(userId,`%${search}%`,active.role==='adult'?1:0).all<Media>()
        const result = await Promise.all(rows.results.map(async m => ({ id:m.id,title:m.title,artist:m.artist,album:m.album,trackNumber:m.track_number,durationSeconds:m.duration_seconds||null,playCount:m.play_count||0,kidsAllowed:Boolean(m.kids_allowed),description:m.description,category:m.category,mimeType:m.mime_type,createdAt:m.created_at,artworkStatus:m.artwork_status||'pending',lyricsStatus:m.lyrics_status||'pending',youtubeVideoId:m.youtube_video_id,thumbnailUrl:m.thumbnail_key && allowedKey(m.thumbnail_key) ? await b2Url(env,m.thumbnail_key) : m.thumbnail_url })))
        return withCors(json(result), cors)
      }
      const mediaMatch = path.match(/^\/api\/media\/([^/]+)(\/(?:play|download))?$/)
      if (mediaMatch) {
        const m = await env.DB.prepare('SELECT * FROM media WHERE id = ? AND user_id=?').bind(mediaMatch[1],userId).first<Media>()
        if (!m || (active.role === 'kids' && !m.kids_allowed)) return withCors(json({ error:'Not found' },404),cors)
        if (!mediaMatch[2] && request.method === 'GET') return withCors(json({ id:m.id,title:m.title,description:m.description,category:m.category }),cors)
        if (mediaMatch[2] && request.method === 'POST') {
          if (!allowedKey(m.video_key)) return withCors(json({ error:'Invalid media key' },500),cors)
          const body = await request.json() as { profileId?: string }
          const profile = body.profileId === active.id ? active : null
          if (!profile) return withCors(json({ error:'Forbidden' },403),cors)
                    if(mediaMatch[2]==='/download') {
            const extension:Record<string,string>={'audio/mp4':'m4a','audio/mpeg':'mp3','audio/aac':'aac','audio/flac':'flac','audio/ogg':'ogg','audio/wav':'wav','audio/opus':'opus'}
            const name=m.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim().slice(0,140)||'song'
            const filename=`${name}.${extension[m.mime_type]||'m4a'}`
            return withCors(json({url:await downloadUrl(env,m.video_key,filename),filename,mimeType:m.mime_type}),cors)
          }
          const lyrics=await env.DB.prepare('SELECT lyrics_plain,lyrics_synced,lyrics_status,lyrics_source,lyrics_source_url FROM song_enrichment WHERE media_id=?').bind(m.id).first<{lyrics_plain:string|null;lyrics_synced:string|null;lyrics_status:string;lyrics_source:string|null;lyrics_source_url:string|null}>()
          return withCors(json({url:await b2Url(env,m.video_key),mimeType:m.mime_type,thumbnailUrl:m.thumbnail_key&&allowedKey(m.thumbnail_key)?await b2Url(env,m.thumbnail_key):m.thumbnail_url,lyrics:lyrics?.lyrics_plain||null,syncedLyrics:lyrics?.lyrics_synced||null,lyricsStatus:lyrics?.lyrics_status||'pending',lyricsSource:lyrics?.lyrics_source||null,lyricsSourceUrl:lyrics?.lyrics_source_url||null}),cors)
        }
      }
      if (path === '/api/progress' && request.method === 'POST') {
        const body = await request.json() as { profileId?: string; mediaId?: string; positionSeconds?: number }
        if (!Number.isInteger(body.positionSeconds) || body.positionSeconds! < 0) return withCors(json({error:'Invalid position'},400),cors)
        const profile = body.profileId === active.id ? active : null
        if (!profile) return withCors(json({error:'Forbidden'},403),cors)
        await env.DB.prepare('INSERT INTO progress(profile_id,media_id,position_seconds) VALUES(?,?,?) ON CONFLICT(profile_id,media_id) DO UPDATE SET position_seconds=excluded.position_seconds, updated_at=CURRENT_TIMESTAMP').bind(body.profileId,body.mediaId,body.positionSeconds).run()
        return withCors(json({ok:true}),cors)
      }
      if (path === '/api/progress' && request.method === 'GET') {
        const profileId = url.searchParams.get('profileId')
        const profile = profileId === active.id ? active : null
        if (!profile) return withCors(json({error:'Forbidden'},403),cors)
        const rows = await env.DB.prepare('SELECT media_id AS mediaId, position_seconds AS positionSeconds FROM progress WHERE profile_id = ?').bind(profileId).all()
        return withCors(json(rows.results),cors)
      }
      return withCors(json({error:'Not found'},404),cors)
    } catch (error) {
      console.error(error)
      return withCors(json({error:'Internal error'},500),cors)
    }
  }
} satisfies ExportedHandler<Env>
function withCors(response: Response, headers: Record<string,string>) { for (const [key,value] of Object.entries(headers)) response.headers.set(key,value); return response }
