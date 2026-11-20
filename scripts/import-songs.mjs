import { readFile, readdir, stat } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { uploadUrl, inspectObject, playbackUrl } from '../services/api/src/storage.ts'
const directory=process.argv[2],releaseId=process.argv[3]
if(!directory || !/^[0-9a-f-]{36}$/.test(releaseId||''))throw Error('Usage: node scripts/import-songs.mjs <folder> <MusicBrainz-release-ID>')
const parse=text=>Object.fromEntries(text.split(/\r?\n/).filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}))
const env=parse(await readFile('services/api/.dev.vars','utf8')),bootstrap=parse(await readFile('.env.bootstrap','utf8'))
const config=JSON.parse(await readFile('services/api/wrangler.jsonc','utf8'))
const userAgent='KingMusic/0.1 (https://github.com/jacobuid/king-music)'
async function getJson(url){
 for(let attempt=0;attempt<4;attempt++){
  const r=await fetch(url,{headers:{'User-Agent':userAgent},signal:AbortSignal.timeout(30000)})
  if(r.ok)return r.json()
  if(![429,502,503,504].includes(r.status)||attempt===3)throw Error(`Metadata lookup failed (${r.status})`)
  await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)))
 }
}
const release=await getJson(`https://musicbrainz.org/ws/2/release/${releaseId}?inc=recordings+artist-credits&fmt=json`)
const artist=release['artist-credit'].map(a=>(a.name||a.artist.name)+(a.joinphrase||'')).join('')
const normalize=s=>s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'')
const files=(await readdir(directory)).filter(name=>extname(name).toLowerCase()==='.mp3')
const tracks=release.media.flatMap(m=>m.tracks)
const plan=files.map(file=>{
 const title=basename(file,extname(file)).replace(/ \[[A-Za-z0-9_-]{11}\]$/,'').replace(/^David Crowder Band - /i,'')
 const matches=tracks.filter(t=>normalize(t.title)===normalize(title))
 if(matches.length!==1)throw Error(`Could not uniquely match ${file}; no files have been uploaded.`)
 return {file,track:matches[0]}
}).sort((a,b)=>a.track.position-b.track.position)
if(!plan.length)throw Error('No MP3 files found')
if(new Set(plan.map(p=>p.track.id)).size!==plan.length)throw Error('Multiple files match the same album track')
console.log(`Matched ${plan.length}/${tracks.length} tracks: ${artist} / ${release.title}`)
async function d1(sql,params=[]){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${bootstrap.CLOUDFLARE_ACCOUNT_ID}/d1/database/${config.d1_databases[0].database_id}/query`,{method:'POST',headers:{Authorization:`Bearer ${bootstrap.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params})});const data=await r.json();if(!r.ok||!data.success||data.result?.some(r=>r.success===false))throw Error(`D1 catalog update failed (${r.status})`);return data.result[0]}
const owners=await d1('SELECT DISTINCT user_id FROM profiles')
const owner=process.argv[4] || (owners.results.length===1?owners.results[0].user_id:null)
if(!owner || !owners.results.some(row=>row.user_id===owner))throw Error('Create an adult profile first, then specify the account UUID if more than one account exists.')
async function putVerified(key,bytes,mime){const existing=await inspectObject(env,key);if(existing?.size===bytes.length && existing.mime===mime)return false
 const r=await fetch(await uploadUrl(env,key,mime),{method:'PUT',headers:{'Content-Type':mime},body:bytes});if(!r.ok)throw Error(`B2 upload failed (${r.status})`)
 const stored=await inspectObject(env,key);if(stored?.size!==bytes.length||stored?.mime!==mime)throw Error('B2 upload verification failed');return true}
const artwork=await getJson(`https://coverartarchive.org/release/${releaseId}`)
const cover=artwork.images.find(image=>image.front)
let artworkKey=null
if(cover){const url=new URL(cover.thumbnails.large);url.protocol='https:';const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`Cover artwork download failed (${r.status})`);if(!r.headers.get('Content-Type')?.startsWith('image/'))throw Error('Invalid cover artwork response');const bytes=Buffer.from(await r.arrayBuffer());artworkKey=`music/artwork/${createHash('sha256').update(bytes).digest('hex')}.jpg`;await putVerified(artworkKey,bytes,'image/jpeg');console.log('Album artwork stored in private B2 storage.')}
let uploaded=0,skipped=0
for(const {file,track} of plan){
 const filePath=join(directory,file),size=(await stat(filePath)).size;if(size>100*1024*1024)throw Error(`File exceeds upload limit: ${file}`)
 const bytes=await readFile(filePath),hash=createHash('sha256').update(bytes).digest('hex'),id=`import-${hash}`
 const prior=await d1('SELECT user_id,video_key FROM media WHERE id=?',[id]);if(prior.results[0]?.user_id && prior.results[0].user_id!==owner)throw Error('This import ID already belongs to another account')
 const key=prior.results[0]?.video_key || `music/accounts/${owner}/${hash}.mp3`
 const youtubeId=file.match(/ \[([A-Za-z0-9_-]{11})\]\.mp3$/i)?.[1]||null
 if(await putVerified(key,bytes,'audio/mpeg'))uploaded++;else skipped++
 await d1(`INSERT INTO media(id,title,description,category,video_key,thumbnail_key,mime_type,artist,album,track_number,kids_allowed,user_id,youtube_video_id) VALUES(?,?,?,'Music',?,?,'audio/mpeg',?,?,?,0,?,?) ON CONFLICT(video_key) DO UPDATE SET title=excluded.title,artist=excluded.artist,album=excluded.album,track_number=excluded.track_number,thumbnail_key=excluded.thumbnail_key,user_id=excluded.user_id,youtube_video_id=excluded.youtube_video_id`,[id,track.title,`Metadata: https://musicbrainz.org/release/${releaseId}`,key,artworkKey,artist,release.title,track.position,owner,youtubeId])
 const playback=await fetch(await playbackUrl(env,key),{headers:{Range:'bytes=0-31'}});if(playback.status!==206 || (await playback.arrayBuffer()).byteLength!==32)throw Error(`Playback verification failed: ${track.title}`)
 console.log(`${track.position}. ${track.title} — stored, cataloged, playback verified`)
}
const catalog=await d1('SELECT COUNT(*) count,MIN(track_number) first_track,MAX(track_number) last_track FROM media WHERE user_id=? AND artist=? AND album=?',[owner,artist,release.title])
console.log(JSON.stringify({album:release.title,artist,uploaded,reused:skipped,catalog:catalog.results[0],artwork:Boolean(artworkKey),kidsAvailable:false,metadataSource:`https://musicbrainz.org/release/${releaseId}`},null,2))
