import { enrichmentStatements, type EnrichmentInput } from './song-enrichment'
import type { Env } from './index'
import { inspectObject, uploadUrl } from './storage'
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
const videoPattern = /^[A-Za-z0-9_-]{11}$/
const playlistPattern = /^[A-Za-z0-9_-]{10,150}$/
const uuidPattern = /^[a-f0-9-]{36}$/
type Song = { videoId: string; title: string; artist?: string; album?: string; thumbnail?: string }
type Job = { id: string; profile_id: string; user_id: string; video_id: string; title: string; artist: string; album: string; thumbnail_url: string | null; status: string; error: string | null; artwork_status?:string; lyrics_status?:string; progress:number; progress_stage:string }
const configured = (env: Env) => Boolean(env.MUSIC_SERVICE_URL && env.MUSIC_SERVICE_TOKEN)
const clean = (value: unknown, length: number) => typeof value === 'string' ? value.trim().slice(0, length) : ''
export function thumbnailUrl(value: unknown): string | null {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && ['ytimg.com','googleusercontent.com','ggpht.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null } catch { return null }
}
export function playlistId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (playlistPattern.test(value)) return value
  try { const url = new URL(value); const id = url.searchParams.get('list'); return url.protocol === 'https:' && ['youtube.com','www.youtube.com','music.youtube.com','youtu.be'].includes(url.hostname) && playlistPattern.test(id || '') ? id : null } catch { return null }
}
export function videoId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (videoPattern.test(value)) return value
  try { const url = new URL(value); if (url.protocol !== 'https:' || !['youtube.com','www.youtube.com','music.youtube.com','youtu.be'].includes(url.hostname)) return null; const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v'); return videoPattern.test(id || '') ? id : null } catch { return null }
}
async function service(env: Env, path: string, body: unknown) {
  if (!configured(env)) throw new Error('Importer is not configured')
  const response = await fetch(`${env.MUSIC_SERVICE_URL!.replace(/\/$/, '')}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${env.MUSIC_SERVICE_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error('Importer request failed')
  return response.json() as Promise<{ results?: Song[]; title?: string; tracks?: Song[]; skipped?: number }>
}
const publicJob = (j: Job) => {
  return {id:j.id,videoId:j.video_id,title:j.title,artist:j.artist,status:j.status,error:j.error,artworkStatus:j.artwork_status,lyricsStatus:j.lyrics_status,progress:j.status==='ready'?100:Math.min(99,j.progress||0),stage:j.status==='ready'?'ready':j.status==='failed'?'failed':j.progress_stage||j.status}
}
async function rateLimit(env: Env, profileId: string) {
  return env.DB.prepare('INSERT INTO import_search_limits(user_id,requested_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET requested_at=excluded.requested_at WHERE import_search_limits.requested_at<? RETURNING requested_at').bind(profileId, Date.now(), Date.now()-1500).first()
}
export async function importRoutes(request: Request, env: Env, profile: { id: string; role: string; user_id: string }): Promise<Response | null> {
  const url = new URL(request.url)
  let path=url.pathname
  if(path.startsWith('/api/discovery/')){
    const routes:Record<string,string>={'GET /api/discovery/search':'/api/admin/imports/search','GET /api/discovery/imports':'/api/admin/imports','POST /api/discovery/song':'/api/admin/imports/song'}
    const target=routes[request.method+' '+path]
    if(!target)return json({error:'Not found'},404)
    path=target
  }
  if (!path.startsWith('/api/admin/imports')) return null
  if (profile.role !== 'adult') return json({ error: 'Adult profile required' }, 403)
  if (path === '/api/admin/imports' && request.method === 'GET') {
    await env.DB.prepare("UPDATE import_jobs SET status='failed',progress_stage='failed',error='Import timed out. Please retry.' WHERE user_id=? AND status IN ('queued','processing') AND updated_at<datetime('now','-2 hours')").bind(profile.user_id).run()
    const ids=(url.searchParams.get('videoIds')||'').split(',').filter(id=>videoPattern.test(id)).slice(0,50)
    const jobs = await env.DB.prepare('SELECT j.*,e.artwork_status,e.lyrics_status FROM import_jobs j LEFT JOIN song_enrichment e ON e.media_id=j.id WHERE j.user_id=?'+(ids.length?' AND j.video_id IN ('+ids.map(()=>'?').join(',')+')':'')+' ORDER BY j.created_at DESC LIMIT 200').bind(profile.user_id,...ids).all<Job>()
    return json({ configured: configured(env), jobs: jobs.results.map(publicJob) })
  }
  if (!configured(env)) return json({ error: 'The YouTube importer is not connected yet.' }, 503)
  if (path === '/api/admin/imports/search' && request.method === 'GET') {
    const query = clean(url.searchParams.get('q'), 101)
    if (query.length < 3 || query.length > 100) return json({ error: 'Enter 3–100 characters' }, 400)
    if (!await rateLimit(env,profile.user_id)) return json({ error: 'Wait a moment before searching again.' }, 429)
    try { return json(await service(env,'/search',{ query })) } catch { return json({ error: 'Search is unavailable. Try again.' }, 502) }
  }
  if (request.method !== 'POST') return json({ error: 'Not found' }, 404)
  const raw = await request.text()
  if (raw.length > 4096) return json({ error: 'Request is too large' }, 413)
  let body: Record<string,unknown>
  try { body = JSON.parse(raw) } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({error:'Invalid request'},400)
  if (path === '/api/admin/imports/playlist/preview') {
    const id = playlistId(body.url)
    if (!id) return json({ error: 'Enter a YouTube playlist URL' }, 400)
    if (!await rateLimit(env,profile.id)) return json({ error: 'Wait a moment before loading another playlist.' }, 429)
    try { return json(await service(env,'/playlist',{ playlistId: id })) } catch { return json({ error: 'Could not read this playlist. It must be available publicly or by an unlisted link, with at most 100 tracks.' }, 502) }
  }
  if (path === '/api/admin/imports/repair') {
    const limit = typeof body.limit === 'number' ? Math.max(1,Math.min(50,Math.floor(body.limit))) : 25
    const rows = await env.DB.prepare(`SELECT j.* FROM import_jobs j JOIN media m ON m.id=j.id AND m.user_id=j.user_id LEFT JOIN song_enrichment e ON e.media_id=m.id
      WHERE j.user_id=? AND j.status='ready' AND (m.thumbnail_key IS NULL OR COALESCE(e.lyrics_status,'missing') NOT IN ('ready','instrumental'))
      AND (e.media_id IS NULL OR (e.artwork_status!='pending' AND e.lyrics_status!='pending') OR e.updated_at<datetime('now','-2 hours')) ORDER BY COALESCE(e.updated_at,'') ASC,j.created_at DESC LIMIT ?`).bind(profile.user_id,limit).all<Job>()
    const jobs=[]
    for (const job of rows.results) {
      const claimed=await env.DB.prepare(`INSERT INTO song_enrichment(media_id,artwork_status,lyrics_status) VALUES(?,'pending','pending') ON CONFLICT(media_id) DO UPDATE SET artwork_status=CASE WHEN artwork_status='ready' THEN 'ready' ELSE 'pending' END,lyrics_status=CASE WHEN lyrics_status IN ('ready','instrumental') THEN lyrics_status ELSE 'pending' END,updated_at=CURRENT_TIMESTAMP WHERE (artwork_status!='pending' AND lyrics_status!='pending') OR updated_at<datetime('now','-2 hours') RETURNING media_id`).bind(job.id).first()
      if(claimed)jobs.push({id:job.id,videoId:job.video_id,callbackUrl:`${url.origin}/api/internal/music/${job.id}`,enrichOnly:true})
    }
    if(jobs.length)try{await service(env,'/jobs/batch',{jobs})}catch{
      await env.DB.batch(jobs.map(job=>env.DB.prepare("UPDATE song_enrichment SET artwork_status=CASE WHEN artwork_status='pending' THEN 'failed' ELSE artwork_status END,lyrics_status=CASE WHEN lyrics_status='pending' THEN 'failed' ELSE lyrics_status END WHERE media_id=?").bind(job.id)))
      return json({error:'Could not queue artwork and lyrics repair. Please retry.'},502)
    }
    return json({queued:jobs.length},202)
  }
  const retry = path.match(/^\/api\/admin\/imports\/([a-f0-9-]+)\/retry$/)
  let songs: Song[]
  if (retry) {
    const job = await env.DB.prepare("SELECT * FROM import_jobs WHERE id=? AND user_id=? AND status='failed'").bind(retry[1],profile.user_id).first<Job>()
    if (!job) return json({ error: 'Failed import not found' }, 404)
    songs = [{ videoId: job.video_id,title:job.title,artist:job.artist,album:job.album,thumbnail:job.thumbnail_url || undefined }]
  } else if (path === '/api/admin/imports/song') {
    const id = videoId(body.videoId || body.url)
    if (!id) return json({ error: 'Enter a valid YouTube song URL' }, 400)
    songs = [{ videoId:id,title:clean(body.title,200)||'Importing song',artist:clean(body.artist,200),album:clean(body.album,200),thumbnail:thumbnailUrl(body.thumbnail)||undefined }]
  } else if (path === '/api/admin/imports/playlist') {
    const id = playlistId(body.url)
    if (!id) return json({ error: 'Enter a YouTube playlist URL' }, 400)
    const selection = body.selectedVideoIds
    if (selection !== undefined && (!Array.isArray(selection) || !selection.length || selection.length > 100 || selection.some(id => typeof id !== 'string' || !videoPattern.test(id)))) return json({error:'Select between 1 and 100 valid songs to import.'},400)
    let result
    try { result = await service(env,'/playlist',{playlistId:id}) } catch { return json({error:'Could not read this playlist. Please try again.'},502) }
    const seen = new Set<string>()
    songs = (result.tracks || []).filter(song => { if (!videoPattern.test(song.videoId) || seen.has(song.videoId)) return false; seen.add(song.videoId); return true })
    if (selection !== undefined) {
      if (selection.some(id => !seen.has(id))) return json({error:'Some selected songs are no longer available. Load the playlist again.'},400)
      const selected = new Set(selection)
      songs = songs.filter(song => selected.has(song.videoId))
    }
    if (!songs.length || songs.length > 100) return json({error:'Choose a playlist with 1–100 available songs.'},400)
  } else return json({ error:'Not found' },404)
  const queue: { id:string;videoId:string;callbackUrl:string }[] = []
  let reused = 0
  const ids = songs.map(song=>song.videoId)
  const mediaRows:{id:string;youtube_video_id:string}[]=[]
  for(let offset=0;offset<ids.length;offset+=99){const part=ids.slice(offset,offset+99);const result=await env.DB.prepare(`SELECT id,youtube_video_id FROM media WHERE user_id=? AND youtube_video_id IN (${part.map(()=>'?').join(',')})`).bind(profile.user_id,...part).all<{id:string;youtube_video_id:string}>();mediaRows.push(...result.results)}
  const mediaByVideo = new Map(mediaRows.map(m=>[m.youtube_video_id,m.id]))
  const inserts = songs.filter(song=>!mediaByVideo.has(song.videoId)).map(song=>env.DB.prepare("INSERT INTO import_jobs(id,profile_id,user_id,video_id,title,artist,album,thumbnail_url) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM import_jobs WHERE user_id=? AND created_at>=datetime('now','-1 day'))<500 OR EXISTS(SELECT 1 FROM import_jobs WHERE user_id=? AND video_id=? AND status='failed') ON CONFLICT(user_id,video_id) DO UPDATE SET status='queued',error=NULL,progress=0,progress_stage='queued',updated_at=CURRENT_TIMESTAMP WHERE import_jobs.status='failed' RETURNING *").bind(crypto.randomUUID(),profile.id,profile.user_id,song.videoId,clean(song.title,200)||'Importing song',clean(song.artist,200),clean(song.album,200),thumbnailUrl(song.thumbnail),profile.user_id,profile.user_id,song.videoId))
  const inserted = inserts.length ? await env.DB.batch<Job>(inserts) : []
  const newlyQueued = new Set(inserted.flatMap(result=>result.results.map(job=>job.id)))
  const jobs: Job[] = []
  for(let offset=0;offset<ids.length;offset+=99){const part=ids.slice(offset,offset+99);const rows=await env.DB.prepare(`SELECT * FROM import_jobs WHERE user_id=? AND video_id IN (${part.map(()=>'?').join(',')})`).bind(profile.user_id,...part).all<Job>();jobs.push(...rows.results)}
  const byVideo = new Map(jobs.map(job=>[job.video_id,job]))
  let limited=0
  for(let position=0;position<songs.length;position++){
    const song=songs[position],mediaId=mediaByVideo.get(song.videoId),job=byVideo.get(song.videoId)
    if(mediaId){reused++;continue}
    if(!job){limited++;continue}
    if(newlyQueued.has(job.id))queue.push({id:job.id,videoId:job.video_id,callbackUrl:`${url.origin}/api/internal/music/${job.id}`});else reused++
  }
  if(queue.length) try { await service(env,'/jobs/batch',{jobs:queue}) } catch {
    await env.DB.batch(queue.map(job => env.DB.prepare("UPDATE import_jobs SET status='failed',error='Could not queue this import. Please retry.' WHERE id=? AND status='queued'").bind(job.id)))
    return json({error:'Could not queue all songs. Retry failed imports from the list.'},502)
  }
  return json({queued:queue.length,reused,limited},202)
}
export async function importCallback(request: Request, env: Env): Promise<Response> {
  if (!env.MUSIC_SERVICE_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.MUSIC_SERVICE_TOKEN}`) return json({error:'Unauthorized'},401)
  const match = new URL(request.url).pathname.match(/^\/api\/internal\/music\/([a-f0-9-]+)(\/(?:upload|artwork-upload|enrichment))?$/)
  if (!match || !uuidPattern.test(match[1])) return json({error:'Not found'},404)
  const job = await env.DB.prepare('SELECT * FROM import_jobs WHERE id=?').bind(match[1]).first<Job>()
  if (!job) return json({error:'Not found'},404)
    if(request.method==='GET' && !match[2]) {
    const existing=await env.DB.prepare('SELECT m.title,m.artist,m.album,m.thumbnail_key,e.lyrics_status,e.duration_seconds FROM media m LEFT JOIN song_enrichment e ON e.media_id=m.id WHERE m.id=? AND m.user_id=?').bind(job.id,job.user_id).first<{title:string;artist:string;album:string;thumbnail_key:string|null;lyrics_status:string|null;duration_seconds:number|null}>()
    return json({status:job.status,title:existing?.title||job.title,artist:existing?.artist||job.artist,album:existing?.album||job.album,thumbnail:job.thumbnail_url,duration:existing?.duration_seconds,needArtwork:!existing?.thumbnail_key,needLyrics:!['ready','instrumental'].includes(existing?.lyrics_status||'')})
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  if(match[2]==='/upload' || match[2]==='/artwork-upload') {
    if(job.status==='failed'||(match[2]==='/upload'&&job.status==='ready'))return json({error:'Import is not active'},409)
    return json({url:await uploadUrl(env,match[2]==='/upload'?`music/${job.id}.m4a`:`music/${job.id}/cover.jpg`,match[2]==='/upload'?'audio/mp4':'image/jpeg')})
  }
  const raw=await request.text();if(raw.length>220000)return json({error:'Too large'},413)
  let b: {status?:string;title?:string;artist?:string;album?:string;duration?:number;enrichment?:EnrichmentInput;progress?:number;stage?:string}
  try { b=JSON.parse(raw) } catch { return json({error:'Invalid JSON'},400) }
  if(match[2]==='/enrichment') {
    if(!b?.enrichment)return json({error:'Missing enrichment data'},400)
    if(job.status!=='ready'||!await env.DB.prepare('SELECT id FROM media WHERE id=? AND user_id=?').bind(job.id,job.user_id).first())return json({error:'Song is not ready'},409)
    try {
      const enriched=await enrichmentStatements(env,job.id,b.enrichment)
      if(enriched.coverKey)enriched.statements.push(env.DB.prepare('UPDATE media SET thumbnail_key=? WHERE id=? AND user_id=?').bind(enriched.coverKey,job.id,job.user_id))
      if(enriched.statements.length)await env.DB.batch(enriched.statements)
      return json({ok:true})
    }catch{return json({error:'Artwork or lyrics data is invalid'},409)}
  }
  if(!b || !['processing','ready','failed'].includes(b.status||''))return json({error:'Invalid status'},400)
  if(b.progress!==undefined||b.stage!==undefined){
    if(b.status!=='processing'||!Number.isInteger(b.progress)||b.progress!<0||b.progress!>99||!['starting','downloading','preparing','uploading','artwork','lyrics','saving'].includes(b.stage||''))return json({error:'Invalid import progress'},400)
  }
  if(job.status==='ready'||job.status==='failed')return json({ok:true})
  if(b.status==='ready') {
    const object=await inspectObject(env,`music/${job.id}.m4a`)
    if(!object || object.mime!=='audio/mp4' || object.size<=0 || object.size>50*1024*1024 || !Number.isFinite(b.duration) || b.duration!<=0 || b.duration!>1200)return json({error:'Audio upload is missing or invalid'},409)
    let enriched
    try { enriched=await enrichmentStatements(env,job.id,b.enrichment) } catch { return json({error:'Artwork or lyrics data is invalid'},409) }
    await env.DB.batch([
      env.DB.prepare("INSERT INTO media(id,title,artist,album,video_key,mime_type,category,kids_allowed,user_id,youtube_video_id,thumbnail_url,thumbnail_key) VALUES(?,?,?,?,?,'audio/mp4','Music',EXISTS(SELECT 1 FROM song_requests WHERE user_id=? AND video_id=? AND status='approved'),?,?,?,?) ON CONFLICT(user_id,youtube_video_id) WHERE youtube_video_id IS NOT NULL DO NOTHING").bind(job.id,clean(b.title,200)||job.title,clean(b.artist,200)||job.artist,clean(b.album,200)||job.album,`music/${job.id}.m4a`,job.user_id,job.video_id,job.user_id,job.video_id,job.thumbnail_url,enriched.coverKey),
      ...enriched.statements,
      env.DB.prepare('INSERT OR IGNORE INTO playlist_tracks(playlist_id,media_id,position) SELECT ip.playlist_id,m.id,ip.position FROM import_playlist_tracks ip JOIN media m ON m.youtube_video_id=? AND m.user_id=? WHERE ip.job_id=?').bind(job.video_id,job.user_id,job.id),
      env.DB.prepare("UPDATE import_jobs SET status='ready',progress=100,progress_stage='ready',error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(job.id),
    ])
  } else if(b.status==='failed')await env.DB.prepare("UPDATE import_jobs SET status='failed',progress_stage='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('queued','processing')").bind('This song could not be imported. The source may be unavailable; you can retry.',job.id).run()
  else await env.DB.prepare("UPDATE import_jobs SET status='processing',progress=MAX(progress,?),progress_stage=CASE WHEN ?>=progress THEN ? ELSE progress_stage END,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('queued','processing')").bind(b.progress||0,b.progress||0,b.stage||job.progress_stage||'starting',job.id).run()
  return json({ok:true})
}
