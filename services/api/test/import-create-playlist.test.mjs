import test from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
test('URL imports optionally create a named playlist with selected reused and imported songs in source order',async t=>{
 const {db,env}=setup();seed(db);db.prepare('UPDATE media SET youtube_video_id=? WHERE id=?').run('lmnopqrstuv','safe')
 const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous)
 globalThis.fetch=async input=>String(input).endsWith('/playlist')?Response.json({title:'Source mix',tracks:[{videoId:'abcdefghijk',title:'First song'},{videoId:'lmnopqrstuv',title:'Existing song'},{videoId:'wxyzABCDE12',title:'Not selected'}]}):Response.json({queued:true})
 const response=await worker.fetch(req('/api/admin/imports/playlist',{body:{url:'PLabcdefghijk',selectedVideoIds:['lmnopqrstuv','abcdefghijk'],createPlaylist:true}}),env);assert.equal(response.status,202)
 const data=await response.json();assert.ok(data.playlistId);assert.equal(data.queued,1);assert.equal(data.reused,1)
 assert.equal(db.prepare('SELECT name FROM playlists WHERE id=?').get(data.playlistId).name,'Source mix')
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM import_jobs WHERE video_id=?').get('wxyzABCDE12').n,0)
 const job=db.prepare('SELECT * FROM import_jobs').get()
 assert.equal((await worker.fetch(new Request('https://music.test/api/internal/music/'+job.id,{method:'POST',headers:{Authorization:'Bearer test-service'},body:JSON.stringify({status:'ready',duration:180})}),env)).status,200)
 assert.deepEqual(db.prepare('SELECT media_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position').all(data.playlistId).map(row=>row.media_id),[job.id,'safe'])
 db.close()
})
test('playlist creation stays opt-in and rejects invalid options before importing',async t=>{
 const {db,env}=setup();seed(db);const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);globalThis.fetch=async input=>String(input).endsWith('/playlist')?Response.json({title:'Source mix',tracks:[{videoId:'abcdefghijk',title:'Song'}]}):Response.json({queued:true})
 assert.equal((await worker.fetch(req('/api/admin/imports/playlist',{body:{url:'PLabcdefghijk',createPlaylist:'yes'}}),env)).status,400)
 const response=await worker.fetch(req('/api/admin/imports/playlist',{body:{url:'PLabcdefghijk'}}),env);assert.equal(response.status,202)
 assert.equal((await response.json()).playlistId,undefined);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM playlists').get().n,0)
 db.close()
})
