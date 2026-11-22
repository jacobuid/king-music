import type { Env } from './index'
import { uploadUrl, inspectObject, playbackUrl } from './storage'
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}})
export async function playlistCoverRoutes(request:Request,env:Env,profile:{id:string;role:string;user_id:string}) {
  const match=new URL(request.url).pathname.match(/^\/api\/playlists\/([^/]+)\/cover(?:\/([^/]+)\/complete)?$/)
  if(!match)return null
  const playlist=await env.DB.prepare('SELECT p.id,p.profile_id FROM playlists p JOIN profiles owner ON owner.id=p.profile_id WHERE p.id=? AND owner.user_id=?').bind(match[1],profile.user_id).first<{id:string;profile_id:string}>()
  if(!playlist)return json({error:'Playlist not found'},404)
  if(profile.role!=='adult'&&playlist.profile_id!==profile.id)return json({error:'Only adults or the playlist creator can change this cover'},403)
  if(request.method==='DELETE'&&!match[2]){await env.DB.prepare('UPDATE playlists SET cover_key=NULL WHERE id=?').bind(playlist.id).run();return json({ok:true})}
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  if(match[2]){
    const upload=await env.DB.prepare('SELECT * FROM playlist_cover_uploads WHERE id=? AND playlist_id=? AND profile_id=? AND user_id=?').bind(match[2],playlist.id,profile.id,profile.user_id).first<{id:string;object_key:string;size_bytes:number;expires:number}>()
    if(!upload)return json({error:'Cover upload not found'},404)
    if(upload.expires<=Date.now())return json({error:'Cover upload expired. Please upload again.'},410)
    const object=await inspectObject(env,upload.object_key)
    if(!object||object.size!==upload.size_bytes||object.mime!=='image/jpeg')return json({error:'The uploaded cover is missing or invalid'},409)
    await env.DB.batch([env.DB.prepare('UPDATE playlists SET cover_key=? WHERE id=?').bind(upload.object_key,playlist.id),env.DB.prepare('DELETE FROM playlist_cover_uploads WHERE id=?').bind(upload.id)])
    return json({ok:true,thumbnailUrl:await playbackUrl(env,upload.object_key)})
  }
  const raw=await request.text();if(raw.length>1024)return json({error:'Request too large'},413)
  let body:{size?:number};try{body=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
  if(!body||!Number.isSafeInteger(body.size)||body.size!<=0||body.size!>2*1024*1024)return json({error:'Choose a cover image up to 2 MiB after cropping'},400)
  const id=crypto.randomUUID(),key=`music/playlists/${playlist.id}/${id}.jpg`,expires=Date.now()+900000
  const url=await uploadUrl(env,key,'image/jpeg')
  await env.DB.prepare('INSERT INTO playlist_cover_uploads(id,playlist_id,profile_id,user_id,object_key,size_bytes,expires) VALUES(?,?,?,?,?,?,?)').bind(id,playlist.id,profile.id,profile.user_id,key,body.size,expires).run()
  return json({id,url,headers:{'Content-Type':'image/jpeg'}},201)
}
