import {test} from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
const create=async(env,profile,name)=>(await worker.fetch(req('/api/playlists',{profile,body:{name}}),env)).json()
test('profiles browse shared playlists, but Home metadata and edit permissions retain creator identity',async()=>{
 const{db,env}=setup();seed(db);db.exec("INSERT INTO profiles(id,user_id,name,role) VALUES('kid2','u1','Sibling','kids'); INSERT INTO profile_sessions(token,profile_id,user_id,version,expires) VALUES('kid2','kid2','u1',0,9999999999999)")
 const adult=await create(env,'adult','Parent mix'),kid=await create(env,'kid','Child mix'),sibling=await create(env,'kid2','Sibling mix')
 const listed=await(await worker.fetch(req('/api/playlists',{profile:'kid'}),env)).json();assert.equal(listed.length,3);assert.equal(listed.find(p=>p.id===adult.id).creatorId,'adult');assert.equal(listed.find(p=>p.id===kid.id).canEdit,true);assert.equal(listed.find(p=>p.id===sibling.id).canEdit,false)
 for(const playlist of [adult,sibling]){
 assert.equal((await worker.fetch(req(`/api/playlists/${playlist.id}/tracks`,{profile:'kid'}),env)).status,200)
 assert.equal((await worker.fetch(req(`/api/playlists/${playlist.id}/tracks`,{profile:'kid',body:{mediaId:'safe'}}),env)).status,403)
 assert.equal((await worker.fetch(req(`/api/playlists/${playlist.id}`,{profile:'kid',body:{name:'Not mine'}}),env)).status,403)
 assert.equal((await worker.fetch(req(`/api/playlists/${playlist.id}`,{profile:'kid',method:'DELETE'}),env)).status,403)
 }
 assert.equal((await worker.fetch(req(`/api/playlists/${kid.id}/tracks`,{profile:'kid',body:{mediaId:'safe'}}),env)).status,200)
 assert.equal((await worker.fetch(req(`/api/playlists/${kid.id}/tracks`,{profile:'kid',body:{mediaId:'restricted'}}),env)).status,404)
 assert.equal((await worker.fetch(req(`/api/playlists/${kid.id}`,{profile:'other-adult',body:{name:'Renamed by adult'}}),env)).status,200)
 assert.equal((await worker.fetch(req(`/api/playlists/${adult.id}`,{user:'u2',profile:'foreign',method:'DELETE'}),env)).status,404)
 assert.equal((await(await worker.fetch(req('/api/playlists',{user:'u2',profile:'foreign'}),env)).json()).length,0);db.close()
})
test('playlist deletion and track removal never delete library songs or their B2 references',async()=>{
 const{db,env}=setup();seed(db);db.exec('PRAGMA foreign_keys=ON')
 const list=await create(env,'kid','Child mix')
 await worker.fetch(req(`/api/playlists/${list.id}/tracks`,{profile:'kid',body:{mediaId:'safe'}}),env)
 assert.equal((await worker.fetch(req(`/api/playlists/${list.id}/tracks/safe`,{method:'DELETE',profile:'other-adult'}),env)).status,200)
 assert.equal(db.prepare("SELECT video_key FROM media WHERE id='safe'").get().video_key,'music/safe.mp3')
 await worker.fetch(req(`/api/playlists/${list.id}/tracks`,{profile:'kid',body:{mediaId:'safe'}}),env)
 db.prepare('INSERT INTO import_jobs(id,profile_id,user_id,video_id,title) VALUES(?,?,?,?,?)').run('job','kid','u1','abcdefghijk','Queued import')
 db.prepare('INSERT INTO import_playlist_tracks(job_id,playlist_id,position) VALUES(?,?,?)').run('job',list.id,1)
 assert.equal((await worker.fetch(req(`/api/playlists/${list.id}`,{method:'DELETE',profile:'other-adult'}),env)).status,200)
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media').get().n,3);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM playlists WHERE id=?').get(list.id).n,0)
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM import_playlist_tracks WHERE playlist_id=?').get(list.id).n,0)
 assert.equal(db.prepare("SELECT video_key FROM media WHERE id='safe'").get().video_key,'music/safe.mp3');db.close()
})
test('downloads require the active authorized profile and do not change queues or catalog data',async()=>{
 const{db,env}=setup();seed(db);db.prepare('UPDATE media SET title=?,mime_type=? WHERE id=?').run('A "Song"/Test','audio/mp4','safe')
 const response=await worker.fetch(req('/api/media/safe/download',{body:{profileId:'adult'}}),env);assert.equal(response.status,200);const result=await response.json();assert.equal(result.filename,'A _Song__Test.m4a');assert.equal(result.url,'https://storage.test/download')
 assert.equal((await worker.fetch(req('/api/media/safe/download',{body:{profileId:'kid'}}),env)).status,403)
 assert.equal((await worker.fetch(req('/api/media/restricted/download',{profile:'kid',body:{profileId:'kid'}}),env)).status,404)
 assert.equal((await worker.fetch(req('/api/media/safe/download',{user:'u2',profile:'foreign',body:{profileId:'foreign'}}),env)).status,404);db.close()
})
