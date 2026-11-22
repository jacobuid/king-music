import type { Env } from './index'
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
export async function albumManagementRoute(request:Request,env:Env,profile:{user_id:string;role:string}) {
  if(new URL(request.url).pathname!=='/api/admin/catalog/album'||request.method!=='POST')return null
  if(profile.role!=='adult')return json({error:'Adult profile required'},403)
  const body=await request.json() as {ids?:unknown;album?:unknown;artist?:unknown;coverSongId?:unknown}
  if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>1000||body.ids.some(id=>typeof id!=='string'||!id)||typeof body.album!=='string'||!body.album.trim()||body.album.length>200||typeof body.artist!=='string'||body.artist.length>200||(body.coverSongId!==undefined&&typeof body.coverSongId!=='string'))return json({error:'Choose 1–1000 songs and enter a valid album name and artist.'},400)
  const ids=[...new Set(body.ids as string[])],chunks=[]
  for(let i=0;i<ids.length;i+=90)chunks.push(ids.slice(i,i+90))
  // Validate the entire selection before making any changes.
  for(const chunk of chunks){const rows=await env.DB.prepare(`SELECT id FROM media WHERE user_id=? AND id IN (${chunk.map(()=>'?').join(',')})`).bind(profile.user_id,...chunk).all();if(rows.results.length!==chunk.length)return json({error:'One or more songs are unavailable. Refresh and try again.'},404)}
  let cover:{thumbnail_key:string|null;thumbnail_url:string|null}|null=null
  if(body.coverSongId){cover=await env.DB.prepare('SELECT thumbnail_key,thumbnail_url FROM media WHERE id=? AND user_id=?').bind(body.coverSongId,profile.user_id).first();if(!cover||(!cover.thumbnail_key&&!cover.thumbnail_url))return json({error:'Choose available artwork from your library.'},400)}
  const updates=chunks.map(chunk=>cover?env.DB.prepare(`UPDATE media SET album=?,artist=?,thumbnail_key=?,thumbnail_url=? WHERE user_id=? AND id IN (${chunk.map(()=>'?').join(',')})`).bind((body.album as string).trim(),(body.artist as string).trim(),cover.thumbnail_key,cover.thumbnail_url,profile.user_id,...chunk):env.DB.prepare(`UPDATE media SET album=?,artist=? WHERE user_id=? AND id IN (${chunk.map(()=>'?').join(',')})`).bind((body.album as string).trim(),(body.artist as string).trim(),profile.user_id,...chunk))
  // D1 batch commits all metadata updates atomically; song identities never change.
  await env.DB.batch(updates)
  return json({updated:ids.length})
}
