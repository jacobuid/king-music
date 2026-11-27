import test from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
const id='11111111-1111-4111-8111-111111111111'
const callback=body=>new Request('https://music.test/api/internal/music/'+id,{method:'POST',headers:{Authorization:'Bearer test-service','Content-Type':'application/json'},body:JSON.stringify(body)})
test('import progress is authenticated, monotonic, account-scoped and reaches 100 only after valid completion',async()=>{
 const {db,env}=setup();seed(db);db.prepare('INSERT INTO import_jobs(id,profile_id,user_id,video_id,title) VALUES(?,?,?,?,?)').run(id,'adult','u1','abcdefghijk','Progress song')
 let result=await worker.fetch(new Request('https://music.test/api/internal/music/'+id,{method:'POST',body:JSON.stringify({status:'processing',progress:99,stage:'saving'})}),env);assert.equal(result.status,401)
 for(const progress of [-1,100,101,12.5,'50'])assert.equal((await worker.fetch(callback({status:'processing',progress,stage:'downloading'}),env)).status,400)
 assert.equal((await worker.fetch(callback({status:'processing',progress:25,stage:'unknown'}),env)).status,400)
 for(const update of [{progress:20,stage:'downloading'},{progress:65,stage:'downloading'},{progress:10,stage:'starting'}])assert.equal((await worker.fetch(callback({status:'processing',...update}),env)).status,200)
 let job=db.prepare('SELECT * FROM import_jobs WHERE id=?').get(id);assert.equal(job.progress,65);assert.equal(job.progress_stage,'downloading')
 let jobs=await(await worker.fetch(req('/api/discovery/imports'),env)).json();assert.equal(jobs.jobs[0].progress,65);assert.equal(jobs.jobs[0].stage,'downloading')
 assert.equal((await(await worker.fetch(req('/api/discovery/imports',{user:'u2',profile:'foreign'}),env)).json()).jobs.length,0)
 env.TEST_OBJECTS={['music/'+id+'.m4a']:{size:0,mime:'audio/mp4'}}
 assert.equal((await worker.fetch(callback({status:'ready',duration:200}),env)).status,409);assert.equal(db.prepare('SELECT progress FROM import_jobs WHERE id=?').get(id).progress,65)
 env.TEST_OBJECTS['music/'+id+'.m4a']={size:1234,mime:'audio/mp4'}
 assert.equal((await worker.fetch(callback({status:'ready',duration:200}),env)).status,200)
 job=db.prepare('SELECT * FROM import_jobs WHERE id=?').get(id);assert.equal(job.progress,100);assert.equal(job.progress_stage,'ready')
 await worker.fetch(callback({status:'processing',progress:20,stage:'downloading'}),env);assert.equal(db.prepare('SELECT progress FROM import_jobs WHERE id=?').get(id).progress,100)
 assert.equal(db.prepare('SELECT kids_allowed FROM media WHERE id=?').get(id).kids_allowed,0);db.close()
})
test('failed imports retain progress, ignore late updates and reset to zero when retried',async t=>{
 const {db,env}=setup();seed(db);db.prepare('INSERT INTO import_jobs(id,profile_id,user_id,video_id,title,status,progress,progress_stage) VALUES(?,?,?,?,?,?,?,?)').run(id,'adult','u1','abcdefghijk','Progress song','processing',82,'preparing')
 await worker.fetch(callback({status:'failed'}),env);await worker.fetch(callback({status:'processing',progress:90,stage:'uploading'}),env)
 let job=db.prepare('SELECT * FROM import_jobs WHERE id=?').get(id);assert.equal(job.status,'failed');assert.equal(job.progress,82);assert.equal(job.progress_stage,'failed')
 const previous=globalThis.fetch;globalThis.fetch=async()=>Response.json({queued:1});t.after(()=>globalThis.fetch=previous)
 assert.equal((await worker.fetch(req('/api/discovery/song',{body:{videoId:'abcdefghijk',title:'Progress song'}}),env)).status,202)
 job=db.prepare('SELECT * FROM import_jobs WHERE id=?').get(id);assert.equal(job.progress,0);assert.equal(job.progress_stage,'queued');assert.equal(job.status,'queued');db.close()
})
