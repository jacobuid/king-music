import {test} from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
const id='22222222-2222-4222-8222-222222222222'
function job(db,status='processing') {db.prepare('INSERT INTO import_jobs(id,profile_id,user_id,video_id,title,artist,album,thumbnail_url,status) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'adult','u1','abcdefghijk','Song','Artist','Album','https://lh3.googleusercontent.com/original',status)}
const callback=(suffix,body)=>new Request(`https://music.test/api/internal/music/${id}${suffix}`,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer test-service','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
const assets={artworkStatus:'ready',artworkUploaded:true,lyricsStatus:'ready',plainLyrics:'First line\nSecond line',syncedLyrics:'[00:01.00]First line\n[00:02.00]Second line',lyricsSource:'LRCLIB',lyricsSourceUrl:'https://lrclib.net/api/get/123',duration:120}
async function complete(db,env,enrichment=assets){job(db);const response=await worker.fetch(callback('',{status:'ready',title:'Song',artist:'Artist',album:'Album',duration:120,enrichment}),env);assert.equal(response.status,200);return response}
test('completed imports store verified B2 cover keys and lyrics in D1; playback serves them',async()=>{
 const{db,env}=setup();seed(db);await complete(db,env)
 assert.equal(db.prepare('SELECT thumbnail_key FROM media WHERE id=?').get(id).thumbnail_key,`music/${id}/cover.jpg`)
 const stored=db.prepare('SELECT * FROM song_enrichment WHERE media_id=?').get(id);assert.equal(stored.lyrics_plain,assets.plainLyrics);assert.equal(stored.lyrics_synced,assets.syncedLyrics);assert.equal(stored.lyrics_status,'ready')
 const songs=await(await worker.fetch(req('/api/library'),env)).json();assert.equal(songs.find(song=>song.id===id).thumbnailUrl,'https://storage.test/play')
 const playing=await(await worker.fetch(req(`/api/media/${id}/play`,{body:{profileId:'adult'}}),env)).json();assert.equal(playing.lyrics,assets.plainLyrics);assert.equal(playing.syncedLyrics,assets.syncedLyrics);assert.equal(playing.lyricsSource,'LRCLIB')
 assert.equal((await worker.fetch(req(`/api/media/${id}/play`,{user:'u2',profile:'foreign',body:{profileId:'foreign'}}),env)).status,404)
 assert.equal((await worker.fetch(req(`/api/media/${id}/play`,{profile:'kid',body:{profileId:'kid'}}),env)).status,404);db.close()
})
test('missing enrichment does not discard audio and repair can fill it without changing the audio key',async()=>{
 const{db,env}=setup();seed(db);await complete(db,env,{artworkStatus:'missing',lyricsStatus:'missing',duration:120})
 assert.equal(db.prepare('SELECT thumbnail_key FROM media WHERE id=?').get(id).thumbnail_key,null)
 const before=db.prepare('SELECT video_key FROM media WHERE id=?').get(id).video_key
 assert.equal((await worker.fetch(callback('/enrichment',{enrichment:assets}),env)).status,200)
 assert.equal(db.prepare('SELECT video_key FROM media WHERE id=?').get(id).video_key,before)
 assert.equal(db.prepare('SELECT status FROM import_jobs WHERE id=?').get(id).status,'ready')
 await worker.fetch(callback('/enrichment',{enrichment:{artworkStatus:'failed',lyricsStatus:'failed'}}),env)
 assert.equal(db.prepare('SELECT lyrics_status FROM song_enrichment WHERE media_id=?').get(id).lyrics_status,'ready');db.close()
})
test('cover claims require an actual image object of the expected size and type',async()=>{
 for(const object of [null,{size:123,mime:'text/html'},{size:3*1024*1024,mime:'image/jpeg'}]){
 const{db,env}=setup();seed(db);job(db);env.TEST_OBJECTS={[`music/${id}/cover.jpg`]:object}
 const response=await worker.fetch(callback('',{status:'ready',duration:120,enrichment:assets}),env);assert.equal(response.status,409);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media WHERE id=?').get(id).n,0);db.close()
 }
})
test('instrumental, missing and failed lyrics are distinct, and untrusted/oversized input is rejected',async()=>{
 const{db,env}=setup();seed(db);await complete(db,env,{lyricsStatus:'instrumental',artworkStatus:'missing'})
 assert.equal(db.prepare('SELECT lyrics_status FROM song_enrichment WHERE media_id=?').get(id).lyrics_status,'instrumental')
 for(const enrichment of [{...assets,lyricsSourceUrl:'https://attacker.example'},{...assets,plainLyrics:'x'.repeat(100001)}])assert.equal((await worker.fetch(callback('/enrichment',{enrichment}),env)).status,409)
 assert.equal((await worker.fetch(new Request(`https://music.test/api/internal/music/${id}/enrichment`,{method:'POST',body:'{}'}),env)).status,401);db.close()
})
test('repair jobs are password-gated, account-scoped, durable and not queued twice',async t=>{
 const{db,env}=setup();seed(db);await complete(db,env,{lyricsStatus:'missing',artworkStatus:'missing'})
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({queued:1})};t.after(()=>globalThis.fetch=original)
 assert.equal((await worker.fetch(req('/api/admin/imports/repair',{body:{}}),env)).status,403)
 const response=await worker.fetch(req('/api/admin/imports/repair',{manage:'manager',body:{}}),env);assert.equal(response.status,202);assert.equal((await response.json()).queued,1);assert.equal(calls[0].jobs[0].enrichOnly,true)
 assert.equal((await(await worker.fetch(req('/api/admin/imports/repair',{manage:'manager',body:{}}),env)).json()).queued,0)
 const state=await(await worker.fetch(callback(''),env)).json();assert.equal(state.needArtwork,true);assert.equal(state.needLyrics,true)
 assert.equal((await worker.fetch(callback('/artwork-upload',{}),env)).status,200);assert.equal((await worker.fetch(callback('/upload',{}),env)).status,409);db.close()
})
