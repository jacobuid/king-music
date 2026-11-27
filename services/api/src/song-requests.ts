import type {Env} from './index'
import {importRoutes,thumbnailUrl} from './imports'
import {allowedKey,playbackUrl} from './storage'
type Profile={id:string;user_id:string;role:string}
type SongRequest={id:string;user_id:string;profile_id:string;media_id:string|null;video_id:string|null;title:string;artist:string;album:string;thumbnail_url:string|null;status:string;requester:string;import_status:string|null;thumbnail_key:string|null;created_at:string}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
const clean=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):''
const videoPattern=/^[A-Za-z0-9_-]{11}$/
async function picture(env:Env,row:{thumbnail_key?:string|null;thumbnail_url?:string|null}){return row.thumbnail_key&&allowedKey(row.thumbnail_key)?await playbackUrl(env,row.thumbnail_key):row.thumbnail_url||null}
export async function songRequestRoutes(request:Request,env:Env,profile:Profile):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname
 if(!path.startsWith('/api/song-requests'))return null
 const adult=profile.role==='adult'
 if(path==='/api/song-requests/search'&&request.method==='GET'){
  if(adult)return json({error:'Use song discovery'},400)
  const q=clean(url.searchParams.get('q'),101);if(q.length<3||q.length>100)return json({error:'Enter 3-100 characters'},400)
  // Request discovery exposes metadata only. Playback permissions stay unchanged.
  const rows=await env.DB.prepare('SELECT id,title,artist,album,youtube_video_id,thumbnail_key,thumbnail_url FROM media WHERE user_id=? AND kids_allowed=0 AND (title LIKE ? OR artist LIKE ? OR album LIKE ?) ORDER BY title LIMIT 50').bind(profile.user_id,...Array(3).fill('%'+q+'%')).all<{id:string;title:string;artist:string;album:string;youtube_video_id:string|null;thumbnail_key:string|null;thumbnail_url:string|null}>()
  const search=new URL('/api/discovery/search',url);search.searchParams.set('q',q)
  const upstream=await importRoutes(new Request(search),env,{...profile,role:'adult'})
  const data=upstream?.ok?await upstream.json() as {results:unknown[]}:null
  return json({library:await Promise.all(rows.results.map(async row=>({id:row.id,title:row.title,artist:row.artist,album:row.album,youtubeVideoId:row.youtube_video_id,thumbnailUrl:await picture(env,row),requestOnly:true}))),results:data?.results||[],searchError:upstream&&!upstream.ok?'More song results are unavailable. Try again.':null})
 }
 if(path==='/api/song-requests'&&request.method==='GET'){
  const rows=await env.DB.prepare(`SELECT r.*,p.name AS requester,j.status AS import_status,m.thumbnail_key FROM song_requests r JOIN profiles p ON p.id=r.profile_id AND p.user_id=r.user_id LEFT JOIN import_jobs j ON j.user_id=r.user_id AND j.video_id=r.video_id LEFT JOIN media m ON m.id=r.media_id AND m.user_id=r.user_id WHERE r.user_id=? AND ${adult?"(r.status='pending' OR (r.status='approved' AND j.status='failed'))":"r.profile_id=?"} ORDER BY ${adult?'r.created_at ASC':'r.updated_at DESC'} LIMIT 500`).bind(profile.user_id,...(adult?[]:[profile.id])).all<SongRequest>()
  return json({requests:await Promise.all(rows.results.map(async row=>({id:row.id,mediaId:row.media_id,videoId:row.video_id,title:row.title,artist:row.artist,album:row.album,thumbnailUrl:await picture(env,row),requester:row.requester,profileId:row.profile_id,status:row.status,importStatus:row.import_status,createdAt:row.created_at})))})
 }
 if(request.method!=='POST')return json({error:'Not found'},404)
 const raw=await request.text();if(raw.length>12000)return json({error:'Too large'},413)
 let body:Record<string,unknown>;try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
 if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid request'},400)
 if(path==='/api/song-requests'){
  if(adult)return json({error:'Kids profile required'},403)
  const mediaId=clean(body.mediaId,100),videoId=clean(body.videoId,100)
  const media=(mediaId||videoPattern.test(videoId))?await env.DB.prepare('SELECT id,title,artist,album,youtube_video_id,thumbnail_url,kids_allowed FROM media WHERE user_id=? AND '+(mediaId?'id=?':'youtube_video_id=?')).bind(profile.user_id,mediaId||videoId).first<{id:string;title:string;artist:string;album:string;youtube_video_id:string;thumbnail_url:string;kids_allowed:number}>():null
  if(mediaId&&!media)return json({error:'Song not found'},404)
  if(media?.kids_allowed)return json({available:true})
  if(!media&&!videoPattern.test(videoId))return json({error:'Invalid song'},400)
  const title=media?.title||clean(body.title,200);if(!title)return json({error:'Song title required'},400)
  const songKey=media?'media:'+media.id:'video:'+videoId
  const existing=await env.DB.prepare('SELECT id,status FROM song_requests WHERE user_id=? AND profile_id=? AND song_key=?').bind(profile.user_id,profile.id,songKey).first<{id:string;status:string}>()
  if(existing&&existing.status!=='declined')return json({id:existing.id,status:existing.status})
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM song_requests WHERE user_id=? AND profile_id=? AND status='pending'").bind(profile.user_id,profile.id).first<{n:number}>()
  if((count?.n||0)>=100)return json({error:'You already have 100 requests waiting for approval.'},429)
  const id=existing?.id||crypto.randomUUID()
  await env.DB.prepare("INSERT INTO song_requests(id,user_id,profile_id,song_key,media_id,video_id,title,artist,album,thumbnail_url) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,profile_id,song_key) DO UPDATE SET status='pending',updated_at=CURRENT_TIMESTAMP").bind(id,profile.user_id,profile.id,songKey,media?.id||null,media?.youtube_video_id||videoId||null,title,media?.artist||clean(body.artist,200),media?.album||clean(body.album,200),media?.thumbnail_url||thumbnailUrl(body.thumbnail)).run()
  return json({id,status:'pending'},201)
 }
 if(path==='/api/song-requests/approve'||path==='/api/song-requests/decline'){
  if(!adult)return json({error:'Adult profile required'},403)
  if(!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>50||body.ids.some(id=>typeof id!=='string'))return json({error:'Choose 1-50 requests'},400)
  const results=[]
  for(const id of [...new Set(body.ids as string[])]){
   const row=await env.DB.prepare('SELECT * FROM song_requests WHERE id=? AND user_id=?').bind(id,profile.user_id).first<SongRequest>()
   if(!row){results.push({id,error:'Request not found'});continue}
   if(path.endsWith('/decline')){await env.DB.prepare("UPDATE song_requests SET status='declined',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(id,profile.user_id).run();results.push({id,ok:true});continue}
   const media=await env.DB.prepare('SELECT id FROM media WHERE user_id=? AND (id=? OR youtube_video_id=?) LIMIT 1').bind(profile.user_id,row.media_id,row.video_id).first<{id:string}>()
   if(!media&&!row.video_id){results.push({id,error:'This song is no longer available'});continue}
   // Permission is persisted before dispatch so even a fast callback sees it.
   await env.DB.prepare("UPDATE song_requests SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(id,profile.user_id).run()
   if(media){await env.DB.prepare('UPDATE media SET kids_allowed=1 WHERE id=? AND user_id=?').bind(media.id,profile.user_id).run();results.push({id,ok:true});continue}
   try{
    const imported=await importRoutes(new Request(new URL('/api/discovery/song',url),{method:'POST',body:JSON.stringify({videoId:row.video_id,title:row.title,artist:row.artist,album:row.album,thumbnail:row.thumbnail_url})}),env,profile)
    const data=await imported?.json() as {limited?:number;error?:string}|undefined
    if(!imported?.ok||data?.limited)throw new Error(data?.limited?'Daily import limit reached. Try again later.':data?.error||'Could not queue import. Try again.')
    await env.DB.prepare('UPDATE media SET kids_allowed=1 WHERE user_id=? AND youtube_video_id=?').bind(profile.user_id,row.video_id).run()
    results.push({id,ok:true})
   }catch(error){await env.DB.prepare("UPDATE song_requests SET status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(id,profile.user_id).run();results.push({id,error:error instanceof Error?error.message:'Try again'})}
  }
  return json({results})
 }
 return json({error:'Not found'},404)
}
