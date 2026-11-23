import type {Env} from './index'
type Details={description:string|null;year:string|null;source_url:string|null;status:string;expires_at:number}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
const pending=new Map<string,Promise<Details>>()
export async function collectionDetailsRoute(request:Request,env:Env,profile:{user_id:string;role:string}){
 if(new URL(request.url).pathname!=='/api/collection/details'||request.method!=='GET')return null
 const params=new URL(request.url).searchParams,kind=params.get('kind'),artist=(params.get('artist')||'').trim(),album=kind==='album'?(params.get('album')||'').trim():''
 if(!['artist','album'].includes(kind||'')||!artist||artist.length>200||album.length>200||(kind==='album'&&!album))return json({error:'Choose a valid artist or album.'},400)
 const tracks=await env.DB.prepare('SELECT youtube_video_id FROM media WHERE user_id=? AND LOWER(TRIM(artist))=LOWER(?) AND (?=1 OR kids_allowed=1) AND (?=1 OR LOWER(TRIM(album))=LOWER(?)) ORDER BY created_at DESC LIMIT 3').bind(profile.user_id,artist,profile.role==='adult'?1:0,kind==='artist'?1:0,album).all<{youtube_video_id:string|null}>()
 if(!tracks.results.length)return json({error:'Collection not found in your library.'},404)
 const key=[profile.user_id,kind,artist,album],cached=await env.DB.prepare('SELECT description,year,source_url,status,expires_at FROM collection_details WHERE user_id=? AND kind=? AND artist=? AND album=?').bind(...key).first<Details>()
 let details=cached
 if(!cached||cached.expires_at<Date.now()){
  const cacheKey=JSON.stringify(key)
  let work=pending.get(cacheKey)
  if(!work){work=(async()=>{
   let value:Details={description:null,year:null,source_url:null,status:'missing',expires_at:Date.now()+86400000}
   const videoIds=tracks.results.map(song=>song.youtube_video_id).filter((id):id is string=>typeof id==='string'&&/^[A-Za-z0-9_-]{11}$/.test(id))
   if(videoIds.length&&env.MUSIC_SERVICE_URL&&env.MUSIC_SERVICE_TOKEN)try{
    const response=await fetch(env.MUSIC_SERVICE_URL.replace(/\/$/,'')+'/collection/details',{method:'POST',headers:{Authorization:'Bearer '+env.MUSIC_SERVICE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({kind,artist,album,videoIds}),signal:AbortSignal.timeout(45000)})
    if(!response.ok)throw Error('Metadata lookup failed')
    const data=await response.json() as {description?:unknown;year?:unknown;sourceUrl?:unknown}
    if(typeof data.description==='string'&&data.description.trim()&&data.description.length<=20000)value.description=data.description.trim()
    if(typeof data.year==='string'&&/^(18|19|20)\d{2}$/.test(data.year))value.year=data.year
    if(typeof data.sourceUrl==='string'){const source=new URL(data.sourceUrl);if(source.protocol!=='https:'||source.hostname!=='music.youtube.com'||source.username||source.password)throw Error('Invalid metadata source');value.source_url=source.href}
    value.status=value.description||value.year?'ready':'missing';value.expires_at=Date.now()+(value.status==='ready'?7:1)*86400000
   }catch{value=cached?.description?{...cached,expires_at:Date.now()+300000}:{description:null,year:null,source_url:null,status:'unavailable',expires_at:Date.now()+300000}}
   await env.DB.prepare('INSERT INTO collection_details(user_id,kind,artist,album,description,year,source_url,status,expires_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,kind,artist,album) DO UPDATE SET description=excluded.description,year=excluded.year,source_url=excluded.source_url,status=excluded.status,expires_at=excluded.expires_at').bind(...key,value.description,value.year,value.source_url,value.status,value.expires_at).run()
   return value
  })();pending.set(cacheKey,work);work.finally(()=>pending.delete(cacheKey)).catch(()=>{})}
  details=await work
 }
 if(!details)return json({description:null,year:null,status:'unavailable',source:null,sourceUrl:null})
 return json({description:details.description,year:details.year,status:details.status,source:details.source_url?'YouTube Music':null,sourceUrl:details.source_url})
}
