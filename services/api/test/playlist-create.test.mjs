import test from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
test('a new playlist can include selected library songs in selection order without duplicating media',async()=>{
 const {db,env}=setup();seed(db);const before=db.prepare('SELECT COUNT(*) n FROM media').get().n
 const response=await worker.fetch(req('/api/playlists',{body:{name:' New mix ',mediaIds:['restricted','safe','restricted']}}),env)
 assert.equal(response.status,201);const list=await response.json();assert.equal(list.name,'New mix');assert.equal(list.songCount,2);assert.equal(list.creatorId,'adult')
 assert.deepEqual((await(await worker.fetch(req(`/api/playlists/${list.id}/tracks`),env)).json()).map(song=>song.id),['restricted','safe'])
 assert.equal(db.prepare('SELECT COUNT(*) n FROM media').get().n,before);db.close()
})
test('unavailable, foreign, or restricted selections never leave an empty playlist behind',async()=>{
 const {db,env}=setup();seed(db)
 for(const [profile,mediaIds] of [['adult',['safe','missing']],['adult',['safe','foreign-song']],['kid',['safe','restricted']]]){
 assert.equal((await worker.fetch(req('/api/playlists',{profile,body:{name:'Should not exist',mediaIds}}),env)).status,404)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM playlists').get().n,0)
 }
 assert.equal((await worker.fetch(req('/api/playlists',{body:{name:'Invalid',mediaIds:'all'}}),env)).status,400)
 assert.equal((await worker.fetch(req('/api/playlists',{body:{name:'Too many',mediaIds:Array(1001).fill('safe')}}),env)).status,400)
 const empty=await worker.fetch(req('/api/playlists',{profile:'kid',body:{name:'Empty mix',mediaIds:[]}}),env);assert.equal(empty.status,201);assert.equal((await empty.json()).creatorId,'kid');db.close()
})
test('large selections use bounded batches and preserve the full requested order',async()=>{
 const {db,env}=setup();seed(db);const ids=[]
 for(let n=0;n<95;n++){const id='new-song-'+n;ids.push(id);db.prepare('INSERT INTO media(id,user_id,title,video_key,kids_allowed) VALUES(?,?,?,?,1)').run(id,'u1',id,'music/'+id+'.m4a')}
 const response=await worker.fetch(req('/api/playlists',{body:{name:'Large mix',mediaIds:ids}}),env);assert.equal(response.status,201);const list=await response.json()
 assert.equal(list.songCount,95);assert.deepEqual(db.prepare('SELECT media_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position').all(list.id).map(song=>song.media_id),ids);db.close()
})
