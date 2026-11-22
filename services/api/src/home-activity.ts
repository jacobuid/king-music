import type { Env } from './index'
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
export async function homeActivityRoutes(request:Request,env:Env,profile:{id:string;role:string;user_id:string}) {
  if(new URL(request.url).pathname!=='/api/home/activity')return null
  const adult=profile.role==='adult'?1:0
  if(request.method==='GET'){
    const [songs,albums]=await Promise.all([
      env.DB.prepare(`SELECT h.media_id AS mediaId,h.last_played_at AS lastPlayedAt,h.play_count AS playCount FROM profile_song_history h JOIN media m ON m.id=h.media_id WHERE h.profile_id=? AND m.user_id=? AND (?=1 OR m.kids_allowed=1) ORDER BY h.last_played_at DESC,h.media_id LIMIT 24`).bind(profile.id,profile.user_id,adult).all(),
      env.DB.prepare(`SELECT h.album,h.artist,h.last_visited_at AS lastVisitedAt FROM profile_album_history h WHERE h.profile_id=? AND EXISTS(SELECT 1 FROM media m WHERE m.album=h.album AND m.artist=h.artist AND m.user_id=? AND (?=1 OR m.kids_allowed=1)) ORDER BY h.last_visited_at DESC,h.album,h.artist LIMIT 24`).bind(profile.id,profile.user_id,adult).all()
    ])
    return json({songs:songs.results,albums:albums.results})
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  const raw=await request.text();if(raw.length>2048)return json({error:'Request too large'},413)
  let body:{kind?:string;mediaId?:string;album?:string;artist?:string;profileId?:string;playbackId?:string}
  try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
  if(!body||typeof body!=='object')return json({error:'Invalid activity'},400)
  if(body.profileId!==profile.id)return json({error:'Forbidden'},403)
  const now=Date.now()
  if(body.kind==='song'){
    if(typeof body.mediaId!=='string'||body.mediaId.length>200)return json({error:'Invalid song'},400)
    if(!await env.DB.prepare('SELECT id FROM media WHERE id=? AND user_id=? AND (?=1 OR kids_allowed=1)').bind(body.mediaId,profile.user_id,adult).first())return json({error:'Song not found'},404)
    const eventId=body.playbackId||crypto.randomUUID()
    if(typeof eventId!=='string'||!/^[a-f0-9-]{36}$/i.test(eventId))return json({error:'Invalid playback event'},400)
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO profile_play_events(profile_id,event_id,media_id,created_at) VALUES(?,?,?,?)').bind(profile.id,eventId,body.mediaId,now),
      env.DB.prepare('INSERT INTO profile_song_history(profile_id,media_id,last_played_at,play_count) SELECT ?,?,?,1 WHERE changes()>0 ON CONFLICT(profile_id,media_id) DO UPDATE SET last_played_at=excluded.last_played_at,play_count=profile_song_history.play_count+1').bind(profile.id,body.mediaId,now),
      env.DB.prepare('UPDATE profile_song_history SET last_played_at=? WHERE profile_id=? AND media_id=?').bind(now,profile.id,body.mediaId)
    ])
    const count=await env.DB.prepare('SELECT play_count FROM profile_song_history WHERE profile_id=? AND media_id=?').bind(profile.id,body.mediaId).first<{play_count:number}>()
    return json({ok:true,lastPlayedAt:now,playCount:count?.play_count||0})
  }
  if(body.kind==='album'){
    if(typeof body.album!=='string'||!body.album.trim()||body.album.length>200||typeof body.artist!=='string'||body.artist.length>200)return json({error:'Invalid album'},400)
    if(!await env.DB.prepare('SELECT id FROM media WHERE album=? AND artist=? AND user_id=? AND (?=1 OR kids_allowed=1) LIMIT 1').bind(body.album,body.artist,profile.user_id,adult).first())return json({error:'Album not found'},404)
    await env.DB.prepare('INSERT INTO profile_album_history(profile_id,album,artist,last_visited_at) VALUES(?,?,?,?) ON CONFLICT(profile_id,album,artist) DO UPDATE SET last_visited_at=excluded.last_visited_at').bind(profile.id,body.album,body.artist,now).run()
    return json({ok:true,lastVisitedAt:now})
  }
  return json({error:'Invalid activity'},400)
}
