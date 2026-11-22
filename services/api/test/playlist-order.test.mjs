import {test} from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
async function playlist(db,env,owner='adult'){
 const list=await(await worker.fetch(req('/api/playlists',{profile:owner,body:{name:'Ordered mix'}}),env)).json()
 db.prepare("INSERT INTO media(id,user_id,title,video_key,kids_allowed) VALUES('safe2','u1','Safe 2','music/safe2.m4a',1)").run()
 for(const [position,id] of ['safe','restricted','safe2'].entries())db.prepare('INSERT INTO playlist_tracks(playlist_id,media_id,position) VALUES(?,?,?)').run(list.id,id,position+1)
 return list
}
test('playlist order persists without replacing membership or recordings',async()=>{
 const {db,env}=setup();seed(db);const list=await playlist(db,env)
 const r=await worker.fetch(req(`/api/playlists/${list.id}/order`,{body:{mediaIds:['safe2','safe','restricted']}}),env)
 assert.equal(r.status,200)
 assert.deepEqual((await(await worker.fetch(req(`/api/playlists/${list.id}/tracks`),env)).json()).map(song=>song.id),['safe2','safe','restricted'])
 assert.equal(db.prepare('SELECT COUNT(*) n FROM playlist_tracks WHERE playlist_id=?').get(list.id).n,3)
 assert.equal(db.prepare("SELECT video_key FROM media WHERE id='safe'").get().video_key,'music/safe.mp3')
 db.close()
})
test('kids can reorder only their own playlists and hidden songs stay in their original slots',async()=>{
 const {db,env}=setup();seed(db);const list=await playlist(db,env,'kid')
 const body={mediaIds:['safe2','safe']}
 assert.equal((await worker.fetch(req(`/api/playlists/${list.id}/order`,{profile:'kid',body}),env)).status,200)
 assert.deepEqual(db.prepare('SELECT media_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position').all(list.id).map(row=>row.media_id),['safe2','restricted','safe'])
 assert.equal((await worker.fetch(req(`/api/playlists/${list.id}/order`,{profile:'kid',body:{mediaIds:['restricted','safe2','safe']}}),env)).status,409)
 assert.equal((await worker.fetch(req(`/api/playlists/${list.id}/order`,{user:'u2',profile:'foreign',body}),env)).status,404)
 const adult=await(await worker.fetch(req('/api/playlists',{body:{name:'Adult list'}}),env)).json()
 assert.equal((await worker.fetch(req(`/api/playlists/${adult.id}/order`,{profile:'kid',body:{mediaIds:[]}}),env)).status,403)
 db.close()
})
test('invalid or stale orders cannot partially reorder a playlist',async()=>{
 const {db,env}=setup();seed(db);const list=await playlist(db,env)
 const order=()=>db.prepare('SELECT media_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position').all(list.id).map(row=>row.media_id)
 for(const [mediaIds,status] of [[['safe','safe','safe2'],400],[['safe','safe2'],409],[['safe','restricted','absent'],409]])assert.equal((await worker.fetch(req(`/api/playlists/${list.id}/order`,{body:{mediaIds}}),env)).status,status)
 assert.deepEqual(order(),['safe','restricted','safe2']);db.close()
})
