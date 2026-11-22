import { playlistOrderRoute } from './playlist-order'
import { albumManagementRoute } from './album-management'
import { accountPlaylists } from './playlist-list'
import { playlistCoverRoutes } from './playlist-covers'
import type { Env } from './index'
const json = (data: unknown, status=200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
export async function musicRoutes(request: Request, env: Env, profile: {id:string;role:string;user_id:string}): Promise<Response|null> {
  const path = new URL(request.url).pathname
  const coverResponse=await playlistCoverRoutes(request,env,profile)
  if(coverResponse)return coverResponse
  const orderResponse=await playlistOrderRoute(request,env,profile)
  if(orderResponse)return orderResponse
  if(path==='/api/playlists'&&request.method==='GET')return json(await accountPlaylists(env,profile))
  if (path === '/api/playlists' && request.method === 'POST') {
    const body = await request.json() as {name?:string}
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length>80) return json({error:'Enter a playlist name (up to 80 characters)'},400)
    const id=crypto.randomUUID(); await env.DB.prepare('INSERT INTO playlists(id,profile_id,name) VALUES(?,?,?)').bind(id,profile.id,body.name.trim()).run()
    const owner=await env.DB.prepare('SELECT name FROM profiles WHERE id=?').bind(profile.id).first<{name:string}>();return json({id,name:body.name.trim(),creatorId:profile.id,creatorName:owner?.name||'',canEdit:true},201)
  }
  const playlistMatch=path.match(/^\/api\/playlists\/([^/]+)$/)
  if(playlistMatch && ['POST','DELETE'].includes(request.method)) {
    const target=await env.DB.prepare('SELECT p.profile_id AS creatorId FROM playlists p JOIN profiles owner ON owner.id=p.profile_id WHERE p.id=? AND owner.user_id=?').bind(playlistMatch[1],profile.user_id).first<{creatorId:string}>()
    if(!target)return json({error:'Playlist not found'},404)
    if(profile.role!=='adult'&&target.creatorId!==profile.id)return json({error:'Only adults or the playlist creator can edit this playlist'},403)
    if(request.method==='DELETE'){
      await env.DB.batch([
        env.DB.prepare('DELETE FROM playlist_cover_uploads WHERE playlist_id=?').bind(playlistMatch[1]),
        env.DB.prepare('DELETE FROM import_playlist_tracks WHERE playlist_id=?').bind(playlistMatch[1]),
        env.DB.prepare('DELETE FROM playlist_tracks WHERE playlist_id=?').bind(playlistMatch[1]),
        env.DB.prepare('DELETE FROM playlists WHERE id=?').bind(playlistMatch[1])
      ])
      return json({ok:true})
    }
    const body=await request.json() as {name?:string}
    if(typeof body.name!=='string'||!body.name.trim()||body.name.length>80)return json({error:'Enter a playlist name (up to 80 characters)'},400)
    await env.DB.prepare('UPDATE playlists SET name=? WHERE id=?').bind(body.name.trim(),playlistMatch[1]).run()
    return json({ok:true,name:body.name.trim()})
  }
  const removeMatch=path.match(/^\/api\/playlists\/([^/]+)\/tracks\/([^/]+)$/)
  if(removeMatch&&request.method==='DELETE'){
    const target=await env.DB.prepare('SELECT p.profile_id AS creatorId FROM playlists p JOIN profiles owner ON owner.id=p.profile_id WHERE p.id=? AND owner.user_id=?').bind(removeMatch[1],profile.user_id).first<{creatorId:string}>()
    if(!target)return json({error:'Playlist not found'},404)
    if(profile.role!=='adult'&&target.creatorId!==profile.id)return json({error:'Only adults or the playlist creator can edit this playlist'},403)
    await env.DB.prepare('DELETE FROM playlist_tracks WHERE playlist_id=? AND media_id=?').bind(removeMatch[1],removeMatch[2]).run()
    return json({ok:true})
  }
  const match=path.match(/^\/api\/playlists\/([^/]+)\/tracks$/)
  if (match) {
    const target=await env.DB.prepare('SELECT p.profile_id AS creatorId FROM playlists p JOIN profiles owner ON owner.id=p.profile_id WHERE p.id=? AND owner.user_id=?').bind(match[1],profile.user_id).first<{creatorId:string}>()
    if(!target)return json({error:'Playlist not found'},404)
    if(request.method==='GET') return json((await env.DB.prepare('SELECT m.id FROM playlist_tracks t JOIN media m ON m.id=t.media_id WHERE t.playlist_id=? AND m.user_id=? AND (?=1 OR m.kids_allowed=1) ORDER BY t.position').bind(match[1],profile.user_id,profile.role==='adult'?1:0).all()).results)
    if(request.method==='POST') {
      if(profile.role!=='adult'&&target.creatorId!==profile.id)return json({error:'Only adults or the playlist creator can edit this playlist'},403)
      const body=await request.json() as {mediaId?:string}
      if(typeof body.mediaId!=='string' || !await env.DB.prepare('SELECT id FROM media WHERE id=? AND user_id=? AND (?=1 OR kids_allowed=1)').bind(body.mediaId,profile.user_id,profile.role==='adult'?1:0).first()) return json({error:'Track not found'},404)
      await env.DB.prepare('INSERT OR IGNORE INTO playlist_tracks(playlist_id,media_id,position) SELECT ?,?,COALESCE(MAX(position),0)+1 FROM playlist_tracks WHERE playlist_id=?').bind(match[1],body.mediaId,match[1]).run()
      return json({ok:true})
    }
  }
  const albumResponse=await albumManagementRoute(request,env,profile)
  if(albumResponse)return albumResponse
  if(path==='/api/admin/catalog/bulk' && request.method==='POST') {
    if(profile.role!=='adult')return json({error:'Adult profile required'},403)
    const b=await request.json() as {ids?:unknown;kidsAllowed?:unknown}
    if(!Array.isArray(b.ids)||b.ids.length<1||b.ids.length>100||b.ids.some(id=>typeof id!=='string')||typeof b.kidsAllowed!=='boolean')return json({error:'Select 1?100 songs and a valid kids flag'},400)
    const ids=[...new Set(b.ids as string[])]
    const updated=await env.DB.batch(ids.map(id=>env.DB.prepare('UPDATE media SET kids_allowed=? WHERE id=? AND user_id=? RETURNING id').bind(b.kidsAllowed?1:0,id,profile.user_id)))
    return json({updated:updated.reduce((count,row)=>count+row.results.length,0)})
  }
  const edit = path.match(/^\/api\/admin\/catalog\/([^/]+)$/)
  if(edit && request.method==='POST') {
    if(profile.role!=='adult')return json({error:'Adult profile required'},403)
    const b=await request.json() as {title?:string;artist?:string;album?:string;trackNumber?:number;kidsAllowed?:boolean;coverSongId?:string}
    if(typeof b.title!=='string'||!b.title.trim()||b.title.length>200||typeof b.artist!=='string'||b.artist.length>200||typeof b.album!=='string'||b.album.length>200||!Number.isSafeInteger(b.trackNumber)||b.trackNumber!<0||typeof b.kidsAllowed!=='boolean')return json({error:'Enter valid song details and kids availability'},400)
    if(b.coverSongId!==undefined&&typeof b.coverSongId!=='string')return json({error:'Choose valid artwork'},400)
    const cover=b.coverSongId?await env.DB.prepare('SELECT thumbnail_key,thumbnail_url FROM media WHERE id=? AND user_id=?').bind(b.coverSongId,profile.user_id).first<{thumbnail_key:string|null;thumbnail_url:string|null}>():null
    if(b.coverSongId&&(!cover||(!cover.thumbnail_key&&!cover.thumbnail_url)))return json({error:'Choose available artwork from your library.'},400)
    const song=await env.DB.prepare('UPDATE media SET title=?,artist=?,album=?,track_number=?,kids_allowed=?,thumbnail_key=CASE WHEN ? THEN ? ELSE thumbnail_key END,thumbnail_url=CASE WHEN ? THEN ? ELSE thumbnail_url END WHERE id=? AND user_id=? RETURNING id').bind(b.title.trim(),b.artist.trim(),b.album.trim(),b.trackNumber,b.kidsAllowed?1:0,cover?1:0,cover?.thumbnail_key||null,cover?1:0,cover?.thumbnail_url||null,edit[1],profile.user_id).first()
    if(!song)return json({error:'Song not found'},404)
    return json({ok:true})
  }
  if(path==='/api/admin/catalog' && request.method==='POST') {
    if(profile.role!=='adult') return json({error:'Adult profile required'},403)
    const b=await request.json() as {title?:string;artist?:string;album?:string;key?:string;kidsAllowed?:boolean;trackNumber?:number}
    if(typeof b.title!=='string'||!b.title.trim()||typeof b.key!=='string'||!b.key.startsWith('music/')||b.key.includes('..')||b.title.length>200||typeof b.artist!=='string'||typeof b.album!=='string'||!Number.isInteger(b.trackNumber)||b.trackNumber!<0) return json({error:'Enter valid track details and a music/ storage key'},400)
    const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO media(id,title,artist,album,track_number,video_key,mime_type,category,kids_allowed,user_id) VALUES(?,?,?,?,?,?,'audio/mpeg','Music',?,?)").bind(id,b.title.trim(),b.artist,b.album,b.trackNumber,b.key,b.kidsAllowed?1:0,profile.user_id).run()
    return json({id},201)
  }
  return null
}
