import test from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
const path=(kind,artist,album='')=>'/api/collection/details?'+new URLSearchParams({kind,artist,album})
test('artist and album information uses library identities and caches successful provider results',async t=>{
 const {db,env}=setup();seed(db);db.exec("UPDATE media SET artist='Cadet',album='The Observatory',youtube_video_id='abcdefghijk' WHERE id='safe'")
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({description:'Provider biography',year:'2002',sourceUrl:'https://music.youtube.com/channel/UCabcdefghijk'})};t.after(()=>globalThis.fetch=original)
 const a=await worker.fetch(req(path('artist','Cadet')),env);assert.equal(a.status,200);assert.equal((await a.json()).description,'Provider biography');assert.deepEqual(calls[0].videoIds,['abcdefghijk'])
 await worker.fetch(req(path('artist','Cadet')),env);assert.equal(calls.length,1)
 const album=await(await worker.fetch(req(path('album','Cadet','The Observatory')),env)).json();assert.equal(album.year,'2002');assert.equal(calls.length,2)
 assert.equal((await worker.fetch(req(path('artist','Other artist')),env)).status,404)
 db.close()
})
test('collection information respects account and kids visibility before reading any cache',async()=>{
 const {db,env}=setup();seed(db);db.exec("UPDATE media SET artist='Restricted artist',album='Hidden album' WHERE id='restricted';INSERT INTO collection_details(user_id,kind,artist,album,description,status,expires_at) VALUES('u1','artist','Restricted artist','','Cached biography','ready',9999999999999)")
 assert.equal((await worker.fetch(req(path('artist','Restricted artist'),{profile:'kid'}),env)).status,404)
 assert.equal((await worker.fetch(req(path('artist','Restricted artist'),{profile:'foreign',user:'u2'}),env)).status,404)
 assert.equal((await(await worker.fetch(req(path('artist','Restricted artist')),env)).json()).description,'Cached biography')
 db.close()
})
test('bad provider sources are discarded and temporary failures preserve a previously verified biography',async t=>{
 const {db,env}=setup();seed(db);db.exec("UPDATE media SET artist='Cadet',youtube_video_id='abcdefghijk' WHERE id='safe'")
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({description:'Do not keep',sourceUrl:'https://evil.test/untrusted'});t.after(()=>globalThis.fetch=original)
 const failed=await(await worker.fetch(req(path('artist','Cadet')),env)).json();assert.equal(failed.status,'unavailable');assert.equal(failed.description,null)
 db.exec("UPDATE collection_details SET description='Verified biography',source_url='https://music.youtube.com/channel/UCabcdefghijk',status='ready',expires_at=0")
 globalThis.fetch=async()=>{throw Error('Service offline')}
 assert.equal((await(await worker.fetch(req(path('artist','Cadet')),env)).json()).description,'Verified biography')
 db.close()
})
