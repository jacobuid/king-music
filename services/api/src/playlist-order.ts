import type { Env } from './index'
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
export async function playlistOrderRoute(request:Request,env:Env,profile:{id:string;user_id:string;role:string}) {
 const match=new URL(request.url).pathname.match(/^\/api\/playlists\/([^/]+)\/order$/)
 if(!match||request.method!=='POST')return null
 const target=await env.DB.prepare('SELECT p.profile_id AS creatorId FROM playlists p JOIN profiles owner ON owner.id=p.profile_id WHERE p.id=? AND owner.user_id=?').bind(match[1],profile.user_id).first<{creatorId:string}>()
 if(!target)return json({error:'Playlist not found'},404)
 if(profile.role!=='adult'&&target.creatorId!==profile.id)return json({error:'Only adults or the playlist creator can reorder this playlist'},403)
 const body=await request.json() as {mediaIds?:unknown}
 if(!Array.isArray(body.mediaIds)||body.mediaIds.length>1000||body.mediaIds.some(id=>typeof id!=='string')||new Set(body.mediaIds).size!==body.mediaIds.length)return json({error:'Send a unique ordered list of up to 1000 songs.'},400)
 const rows=await env.DB.prepare('SELECT m.id,m.kids_allowed FROM playlist_tracks t JOIN media m ON m.id=t.media_id WHERE t.playlist_id=? AND m.user_id=? ORDER BY t.position,m.id').bind(match[1],profile.user_id).all<{id:string;kids_allowed:number}>()
 const visible=rows.results.filter(song=>profile.role==='adult'||song.kids_allowed),ids=body.mediaIds as string[],allowed=new Set(visible.map(song=>song.id))
 if(ids.length!==visible.length||ids.some(id=>!allowed.has(id)))return json({error:'Playlist changed. Refresh it before reordering.'},409)
 // Keep tracks hidden from kids in their original slots, rather than dropping them.
 let index=0
 const ordered=rows.results.map(song=>allowed.has(song.id)?ids[index++]:song.id),updates=[]
 for(let offset=0;offset<ordered.length;offset+=30){const chunk=ordered.slice(offset,offset+30);updates.push(env.DB.prepare(`UPDATE playlist_tracks SET position=CASE media_id ${chunk.map(()=> 'WHEN ? THEN ?').join(' ')} ELSE position END WHERE playlist_id=? AND media_id IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk.flatMap((id,i)=>[id,offset+i+1]),match[1],...chunk))}
 if(updates.length)await env.DB.batch(updates)
 return json({mediaIds:ids})
}
