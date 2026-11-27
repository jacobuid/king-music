import {test} from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
test('adult discovery imports require an unlocked adult, reuse songs, and default to adult-only',async t=>{
 const {db,env}=setup();seed(db);t.after(()=>db.close())
 const old=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push(url);if(url.endsWith('/search'))return Response.json({results:[{videoId:'abcdefghijk',title:'New song',artist:'Artist'}]});if(url.endsWith('/jobs/batch'))return Response.json({queued:1});throw Error('Unexpected source request')};t.after(()=>{globalThis.fetch=old})
 for(const profile of ['kid',''])for(const [path,body] of [['/api/discovery/search?q=Artist',undefined],['/api/discovery/imports',undefined],['/api/discovery/song',{videoId:'abcdefghijk'}]])assert.equal((await worker.fetch(req(path,{profile,body}),env)).status,403)
 assert.equal(calls.length,0)
 const results=await worker.fetch(req('/api/discovery/search?q=Artist'),env);assert.equal(results.status,200);assert.equal((await results.json()).results.length,1)
 assert.equal((await worker.fetch(req('/api/discovery/search?q=Artist'),env)).status,429)
 const imported=await worker.fetch(req('/api/discovery/song',{body:{videoId:'abcdefghijk',title:'New song',artist:'Artist',kidsAllowed:true}}),env);assert.equal(imported.status,202);assert.equal((await imported.json()).queued,1)
 const job=db.prepare("SELECT * FROM import_jobs WHERE video_id='abcdefghijk'").get()
 const foreignId='22222222-2222-4222-8222-222222222222';db.prepare('INSERT INTO import_jobs(id,profile_id,user_id,video_id,title) VALUES(?,?,?,?,?)').run(foreignId,'foreign','u2','abcdefghij2','Other account')
 const jobs=await (await worker.fetch(req('/api/discovery/imports?videoIds=abcdefghijk,abcdefghij2'),env)).json();assert.deepEqual(jobs.jobs.map(job=>job.id),[job.id])
 const callback=new Request('https://music.test/api/internal/music/'+job.id,{method:'POST',headers:{Authorization:'Bearer test-service','Content-Type':'application/json'},body:JSON.stringify({status:'ready',title:'New song',artist:'Artist',album:'Album',duration:120})});assert.equal((await worker.fetch(callback,env)).status,200)
 assert.equal(db.prepare('SELECT kids_allowed FROM media WHERE id=?').get(job.id).kids_allowed,0)
 assert.equal((await (await worker.fetch(req('/api/library',{profile:'kid'}),env)).json()).some(song=>song.id===job.id),false)
 const reused=await(await worker.fetch(req('/api/discovery/song',{body:{videoId:'abcdefghijk'}}),env)).json();assert.equal(reused.reused,1);assert.equal(reused.queued,0)
 for(const path of ['/api/discovery/repair','/api/discovery/playlist'])assert.equal((await worker.fetch(req(path,{body:{}}),env)).status,404)
})
test('Manage Music accepts adult PIN sessions and rejects kids even with a management token',async()=>{
 const {db,env}=setup();seed(db)
 for(const profile of ['adult','other-adult'])assert.equal((await worker.fetch(req('/api/admin/imports',{profile}),env)).status,200)
 for(const [path,body] of [['/api/admin/imports',undefined],['/api/admin/catalog/safe',{title:'Changed',kidsAllowed:true}],['/api/admin/uploads',{title:'Unsafe'}]])assert.equal((await worker.fetch(req(path,{profile:'kid',manage:'manager',body}),env)).status,403)
 const updated=await worker.fetch(req('/api/admin/catalog/restricted',{body:{title:'Restricted',artist:'Artist',album:'Album',trackNumber:1,kidsAllowed:true}}),env);assert.equal(updated.status,200);assert.equal(db.prepare("SELECT kids_allowed FROM media WHERE id='restricted'").get().kids_allowed,1)
 db.close()
})
