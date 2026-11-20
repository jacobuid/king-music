import {test} from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
Error.stackTraceLimit=1
function source(t,tracks){const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});if(url.endsWith('/playlist'))return Response.json({title:'Source mix',tracks,skipped:0});if(url.endsWith('/jobs/batch'))return Response.json({queued:JSON.parse(options.body).jobs.length});throw Error('Unexpected request')};t.after(()=>{globalThis.fetch=original});return calls}
const song=(id,title)=>({videoId:id,title,artist:'Artist',album:'Album',duration:120})
const internal=(id,body)=>new Request(`https://music.test/api/internal/music/${id}`,{method:'POST',headers:{Authorization:'Bearer test-service','Content-Type':'application/json'},body:JSON.stringify(body)})

test('playlist selection excludes unchecked songs and preserves source order',async t=>{
 const{db,env}=setup();seed(db)
 const tracks=[song('abcdefghij1','First'),song('abcdefghij2','Excluded'),song('abcdefghij3','Third')];const calls=source(t,tracks)
 const response=await worker.fetch(req('/api/admin/imports/playlist',{manage:'manager',body:{url:'PLabcdefghijk',selectedVideoIds:['abcdefghij3','abcdefghij1']}}),env)
 assert.equal(response.status,202);assert.equal((await response.json()).queued,2)
 assert.deepEqual(calls.find(c=>c.url.endsWith('/jobs/batch')).body.jobs.map(j=>j.videoId),['abcdefghij1','abcdefghij3'])
 assert.deepEqual(db.prepare('SELECT video_id,position FROM import_jobs JOIN import_playlist_tracks ON job_id=id ORDER BY position').all().map(r=>({...r})),[{video_id:'abcdefghij1',position:1},{video_id:'abcdefghij3',position:2}])
 const count=db.prepare('SELECT COUNT(*) AS n FROM playlists').get().n
 for(const selectedVideoIds of [[],['abcdefghij9'],['invalid'],'all']){
 const invalid=await worker.fetch(req('/api/admin/imports/playlist',{manage:'manager',body:{url:'PLabcdefghijk',selectedVideoIds}}),env)
 assert.equal(invalid.status,400)
 }
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM playlists').get().n,count);db.close()
})
test('playlist imports reuse account songs and preserve source order despite out-of-order completion',async t=>{const{db,env}=setup();seed(db);db.prepare("UPDATE media SET youtube_video_id='abcdefghij1' WHERE id='safe'").run();const tracks=[song('abcdefghij1','Existing'),song('abcdefghij2','Second'),song('abcdefghij3','Third')];const calls=source(t,tracks)
 const response=await worker.fetch(req('/api/admin/imports/playlist',{manage:'manager',body:{url:'https://www.youtube.com/playlist?list=PLabcdefghijk'}}),env);assert.equal(response.status,202);const data=await response.json();assert.equal(data.queued,2);assert.equal(data.reused,1);assert.equal(calls.find(c=>c.url.endsWith('/jobs/batch')).body.jobs.length,2)
 const jobs=db.prepare('SELECT * FROM import_jobs ORDER BY video_id DESC').all()
 for(const job of jobs){const r=await worker.fetch(internal(job.id,{status:'ready',title:job.title,artist:'Artist',album:'Album',duration:120}),env);assert.equal(r.status,200)}
 const ids=await(await worker.fetch(req(`/api/playlists/${data.playlistId}/tracks`),env)).json();const titles=ids.map(({id})=>db.prepare('SELECT title FROM media WHERE id=?').get(id).title);assert.deepEqual(titles,['Safe','Second','Third'])
 const repeat=await worker.fetch(req('/api/admin/imports/song',{profile:'other-adult',manage:'manager',body:tracks[1]}),env);assert.equal((await repeat.json()).reused,1)
 assert.equal((await worker.fetch(req(`/api/playlists/${data.playlistId}/tracks`,{profile:'kid'}),env)).status,404)
 assert.equal(db.prepare('SELECT user_id FROM media WHERE id=?').get(jobs[0].id).user_id,'u1');db.close()})
test('100-song playlists queue in a batch and failed jobs can retry at the daily quota',async t=>{const{db,env}=setup();seed(db);const tracks=Array.from({length:100},(_,n)=>song('v'+String(n).padStart(10,'0'),'Song '+n));const calls=source(t,tracks)
 const response=await worker.fetch(req('/api/admin/imports/playlist',{manage:'manager',body:{url:'PLabcdefghijk'}}),env);assert.equal(response.status,202);assert.equal((await response.json()).queued,100);assert.equal(calls.find(c=>c.url.endsWith('/jobs/batch')).body.jobs.length,100)
 const job=db.prepare('SELECT id FROM import_jobs LIMIT 1').get();db.prepare("UPDATE import_jobs SET status='failed' WHERE id=?").run(job.id)
 const retry=await worker.fetch(req(`/api/admin/imports/${job.id}/retry`,{profile:'other-adult',manage:'manager',body:{}}),env);assert.equal(retry.status,202);assert.equal((await retry.json()).queued,1)
 const limited=await worker.fetch(req('/api/admin/imports/song',{manage:'manager',body:song('zabcdefghij','Extra')}),env);assert.equal((await limited.json()).limited,1);db.close()})
test('import callbacks need the service secret and jobs remain account-scoped',async()=>{const{db,env}=setup();seed(db)
 assert.equal((await worker.fetch(new Request('https://music.test/api/internal/music/00000000-0000-0000-0000-000000000000'),env)).status,401)
 assert.equal((await worker.fetch(req('/api/admin/imports/song',{profile:'kid',body:{videoId:'abcdefghijk'}}),env)).status,403)
 db.prepare('INSERT INTO import_jobs(id,profile_id,user_id,video_id,title,status) VALUES(?,?,?,?,?,?)').run('11111111-1111-4111-8111-111111111111','foreign','u2','abcdefghijk','Other account','failed')
 const jobs=await(await worker.fetch(req('/api/admin/imports',{manage:'manager'}),env)).json();assert.equal(jobs.jobs.length,0)
 const retry=await worker.fetch(req('/api/admin/imports/11111111-1111-4111-8111-111111111111/retry',{manage:'manager',body:{}}),env);assert.equal(retry.status,404);db.close()})
