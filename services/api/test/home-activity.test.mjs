import {test} from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
const record=(env,profile,body)=>worker.fetch(req('/api/home/activity',{profile,body:{...body,profileId:profile}}),env)
const activity=async(env,profile)=>(await worker.fetch(req('/api/home/activity',{profile}),env)).json()
test('recent listening and album visits belong to the active profile and update without duplicates',async()=>{
 const{db,env}=setup();seed(db);db.exec("UPDATE media SET artist='Artist',album='Older' WHERE id='safe'; UPDATE media SET artist='Artist',album='Newer' WHERE id='restricted'")
 assert.equal((await record(env,'adult',{kind:'song',mediaId:'safe'})).status,200);db.exec("UPDATE profile_song_history SET last_played_at=10 WHERE profile_id='adult'")
 assert.equal((await record(env,'adult',{kind:'song',mediaId:'restricted'})).status,200)
 assert.deepEqual((await activity(env,'adult')).songs.map(song=>song.mediaId),['restricted','safe'])
 assert.deepEqual(await activity(env,'other-adult'),{songs:[],albums:[]});assert.deepEqual(await activity(env,'kid'),{songs:[],albums:[]})
 assert.equal((await record(env,'adult',{kind:'album',album:'Older',artist:'Artist'})).status,200);db.exec("UPDATE profile_album_history SET last_visited_at=10")
 await record(env,'adult',{kind:'album',album:'Newer',artist:'Artist'});db.exec('UPDATE profile_album_history SET last_visited_at=20');await record(env,'adult',{kind:'album',album:'Older',artist:'Artist'})
 assert.equal((await activity(env,'adult')).albums[0].album,'Older');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM profile_album_history').get().n,2)
 db.exec('UPDATE profile_song_history SET last_played_at=20');await record(env,'adult',{kind:'song',mediaId:'safe'});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM profile_song_history').get().n,2);assert.equal((await activity(env,'adult')).songs[0].mediaId,'safe');db.close()
})
test('history cannot be written for another profile, account, or restricted kids track and filters stale access',async()=>{
 const{db,env}=setup();seed(db);db.exec("UPDATE media SET artist='Artist',album='Allowed' WHERE id='safe'; UPDATE media SET artist='Artist',album='Adult only' WHERE id='restricted'; UPDATE media SET album='Foreign' WHERE id='foreign-song'")
 assert.equal((await worker.fetch(req('/api/home/activity',{profile:'kid',body:{kind:'song',mediaId:'safe',profileId:'adult'}}),env)).status,403)
 assert.equal((await record(env,'kid',{kind:'song',mediaId:'restricted'})).status,404);assert.equal((await record(env,'adult',{kind:'song',mediaId:'foreign-song'})).status,404)
 assert.equal((await record(env,'kid',{kind:'album',album:'Adult only',artist:'Artist'})).status,404);assert.equal((await record(env,'adult',{kind:'album',album:'Foreign',artist:''})).status,404)
 await record(env,'kid',{kind:'song',mediaId:'safe'});await record(env,'kid',{kind:'album',album:'Allowed',artist:'Artist'});assert.equal((await activity(env,'kid')).songs.length,1)
 db.exec("UPDATE media SET kids_allowed=0 WHERE id='safe'");assert.deepEqual(await activity(env,'kid'),{songs:[],albums:[]});db.close()
})
test('preparing or downloading audio does not count as having played it',async()=>{
 const{db,env}=setup();seed(db)
 assert.equal((await worker.fetch(req('/api/media/safe/play',{body:{profileId:'adult'}}),env)).status,200)
 assert.equal((await worker.fetch(req('/api/media/safe/download',{body:{profileId:'adult'}}),env)).status,200)
 assert.deepEqual(await activity(env,'adult'),{songs:[],albums:[]})
 assert.equal((await record(env,'adult',{kind:'album',album:'Not in catalog',artist:''})).status,404);assert.equal((await record(env,'adult',{kind:'invalid'})).status,400);db.close()
})
