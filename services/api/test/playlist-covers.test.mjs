import {test} from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
const create=async(env,profile='adult')=>(await worker.fetch(req('/api/playlists',{profile,body:{name:'Test mix'}}),env)).json()
const played=(env,id,profile='adult',playbackId=crypto.randomUUID())=>worker.fetch(req('/api/home/activity',{profile,body:{kind:'song',mediaId:id,profileId:profile,playbackId}}),env)
test('a playback start counts immediately, retries are idempotent, and shared covers rank most-played songs',async()=>{
 const{db,env}=setup();seed(db)
 for(const id of ['one','two','three','four','five'])db.prepare('INSERT INTO media(id,user_id,title,video_key,kids_allowed,thumbnail_url) VALUES(?,?,?,?,?,?)').run(id,'u1',id,'music/'+id+'.m4a',1,'https://images.test/'+id+'.jpg')
 const list=await create(env)
 for(const id of ['one','two','three','four','five'])await worker.fetch(req(`/api/playlists/${list.id}/tracks`,{body:{mediaId:id}}),env)
 const event=crypto.randomUUID();assert.equal((await(await played(env,'five','adult',event)).json()).playCount,1);assert.equal((await(await played(env,'five','adult',event)).json()).playCount,1)
 await played(env,'five');await played(env,'five','kid');await played(env,'four');await played(env,'four');await played(env,'three')
 const playlists=await(await worker.fetch(req('/api/playlists'),env)).json(),cover=playlists.find(item=>item.id===list.id).coverSongs
 assert.equal(cover.length,4);assert.deepEqual(cover.slice(0,3).map(song=>song.id),['five','four','three']);assert.equal(cover[0].playCount,3)
 const library=await(await worker.fetch(req('/api/library'),env)).json();assert.equal(library.find(song=>song.id==='five').playCount,3)
 const kids=await(await worker.fetch(req('/api/home/activity',{profile:'kid'}),env)).json();assert.equal(kids.songs[0].playCount,1);db.close()
})
test('custom playlist artwork uploads are authorized, scoped, verified and can return to automatic artwork',async()=>{
 const{db,env}=setup();seed(db);const list=await create(env,'kid')
 assert.equal((await worker.fetch(req(`/api/playlists/${list.id}/cover`,{profile:'other-adult',body:{size:100}}),env)).status,201)
 assert.equal((await worker.fetch(req(`/api/playlists/${list.id}/cover`,{user:'u2',profile:'foreign',body:{size:100}}),env)).status,404)
 const upload=await(await worker.fetch(req(`/api/playlists/${list.id}/cover`,{profile:'kid',body:{size:100}}),env)).json(),pending=db.prepare('SELECT * FROM playlist_cover_uploads WHERE id=?').get(upload.id)
 env.TEST_OBJECTS={[pending.object_key]:{size:99,mime:'image/jpeg'}}
 const complete=()=>worker.fetch(req(`/api/playlists/${list.id}/cover/${upload.id}/complete`,{profile:'kid',body:{}}),env)
 assert.equal((await complete()).status,409);assert.equal(db.prepare('SELECT cover_key FROM playlists WHERE id=?').get(list.id).cover_key,null)
 env.TEST_OBJECTS[pending.object_key]={size:100,mime:'image/jpeg'};assert.equal((await complete()).status,200)
 assert.equal(db.prepare('SELECT cover_key FROM playlists WHERE id=?').get(list.id).cover_key,pending.object_key)
 assert.equal((await(await worker.fetch(req('/api/playlists',{profile:'kid'}),env)).json()).find(item=>item.id===list.id).thumbnailUrl,'https://storage.test/play')
 assert.equal((await worker.fetch(req(`/api/playlists/${list.id}/cover`,{profile:'kid',method:'DELETE'}),env)).status,200);assert.equal(db.prepare('SELECT cover_key FROM playlists WHERE id=?').get(list.id).cover_key,null);db.close()
})
test('kids cannot alter another profile cover; expired or oversized cover uploads fail',async()=>{
 const{db,env}=setup();seed(db);const other=await create(env),own=await create(env,'kid')
 assert.equal((await worker.fetch(req(`/api/playlists/${other.id}/cover`,{profile:'kid',body:{size:100}}),env)).status,403)
 assert.equal((await worker.fetch(req(`/api/playlists/${other.id}/cover`,{profile:'kid',method:'DELETE'}),env)).status,403)
 assert.equal((await worker.fetch(req(`/api/playlists/${own.id}/cover`,{profile:'kid',body:{size:3*1024*1024}}),env)).status,400)
 const upload=await(await worker.fetch(req(`/api/playlists/${own.id}/cover`,{profile:'kid',body:{size:100}}),env)).json();db.prepare('UPDATE playlist_cover_uploads SET expires=0 WHERE id=?').run(upload.id)
 assert.equal((await worker.fetch(req(`/api/playlists/${own.id}/cover/${upload.id}/complete`,{profile:'kid',body:{}}),env)).status,410);db.close()
})
test('restricted songs cannot appear in kids playlist collages',async()=>{
 const{db,env}=setup();seed(db);const list=await create(env)
 for(const id of ['safe','restricted'])await worker.fetch(req(`/api/playlists/${list.id}/tracks`,{body:{mediaId:id}}),env)
 await played(env,'restricted');await played(env,'restricted')
 const kids=await(await worker.fetch(req('/api/playlists',{profile:'kid'}),env)).json();assert.deepEqual(kids.find(item=>item.id===list.id).coverSongs.map(song=>song.id),['safe']);db.close()
})

test('playlist collage picks four distinct albums before limiting results to four slots',async()=>{
 const {db,env}=setup();seed(db);const list=await create(env)
 for(let index=0;index<7;index++){
 const id='album-song-'+index,album=index<4?'Repeated album':'Album '+index
 db.prepare('INSERT INTO media(id,user_id,title,artist,album,video_key,kids_allowed) VALUES(?,?,?,?,?,?,1)').run(id,'u1',id,'Artist',album,'music/'+id+'.m4a')
 await worker.fetch(req(`/api/playlists/${list.id}/tracks`,{body:{mediaId:id}}),env)
 db.prepare('INSERT INTO profile_song_history(profile_id,media_id,last_played_at,play_count) VALUES(?,?,?,?)').run('adult',id,1,20-index)
 }
 const cover=(await(await worker.fetch(req('/api/playlists'),env)).json()).find(item=>item.id===list.id).coverSongs
 assert.equal(cover.length,4);assert.deepEqual(cover.map(song=>song.id),['album-song-0','album-song-4','album-song-5','album-song-6']);assert.equal(new Set(cover.map(song=>song.album)).size,4)
 db.close()
})
