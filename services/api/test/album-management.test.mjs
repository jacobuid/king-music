import {test} from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
test('album merges atomically change grouping and artwork while preserving recordings and memberships',async()=>{
 const {db,env}=setup();seed(db)
 db.exec("UPDATE media SET album='Awake',artist='Skillet',thumbnail_key='music/safe/cover.jpg' WHERE id='safe'; UPDATE media SET album='Awake (Album)',artist='Wrong artist' WHERE id='restricted'; INSERT INTO playlists(id,profile_id,name) VALUES('mix','adult','My mix'); INSERT INTO playlist_tracks(playlist_id,media_id,position) VALUES('mix','safe',1),('mix','restricted',2); INSERT INTO profile_song_history(profile_id,media_id,play_count,last_played_at) VALUES('adult','safe',12,1); INSERT INTO song_enrichment(media_id,lyrics_status,lyrics_plain) VALUES('safe','ready','Stored lyrics')")
 const before=db.prepare('SELECT id,title,video_key,track_number,kids_allowed FROM media ORDER BY id').all()
 const response=await worker.fetch(req('/api/admin/catalog/album',{manage:'manager',body:{ids:['safe','restricted'],album:' Awake ',artist:' Skillet ',coverSongId:'safe'}}),env)
 assert.equal(response.status,200);assert.equal((await response.json()).updated,2)
 assert.deepEqual(db.prepare("SELECT DISTINCT album,artist,thumbnail_key FROM media WHERE id IN ('safe','restricted')").all().map(row=>({...row})),[{album:'Awake',artist:'Skillet',thumbnail_key:'music/safe/cover.jpg'}])
 assert.deepEqual(db.prepare('SELECT id,title,video_key,track_number,kids_allowed FROM media ORDER BY id').all(),before)
 assert.equal(db.prepare("SELECT COUNT(*) n FROM playlist_tracks WHERE playlist_id='mix'").get().n,2)
 assert.equal(db.prepare("SELECT play_count FROM profile_song_history WHERE media_id='safe'").get().play_count,12)
 assert.equal(db.prepare("SELECT lyrics_plain FROM song_enrichment WHERE media_id='safe'").get().lyrics_plain,'Stored lyrics')
 db.close()
})
test('album changes require management access and reject foreign songs or artwork without partial changes',async()=>{
 const {db,env}=setup();seed(db)
 const body={ids:['safe'],album:'New album',artist:'Artist'}
 assert.equal((await worker.fetch(req('/api/admin/catalog/album',{body}),env)).status,403)
 assert.equal((await worker.fetch(req('/api/admin/catalog/album',{profile:'kid',body}),env)).status,403)
 db.exec("UPDATE media SET album='Original',thumbnail_key='music/foreign.jpg' WHERE user_id='u2'")
 const before=db.prepare('SELECT id,album,artist,thumbnail_key FROM media ORDER BY id').all()
 for(const invalid of [{...body,ids:['safe','foreign-song']},{...body,ids:['safe','absent']}])assert.equal((await worker.fetch(req('/api/admin/catalog/album',{manage:'manager',body:invalid}),env)).status,404)
 const foreign=db.prepare("SELECT id FROM media WHERE user_id='u2' LIMIT 1").get()
 assert.equal((await worker.fetch(req('/api/admin/catalog/album',{manage:'manager',body:{...body,coverSongId:foreign.id}}),env)).status,400)
 for(const invalid of [{...body,album:' '},{...body,ids:[]},{...body,ids:Array(1001).fill('safe')}])assert.equal((await worker.fetch(req('/api/admin/catalog/album',{manage:'manager',body:invalid}),env)).status,400)
 assert.deepEqual(db.prepare('SELECT id,album,artist,thumbnail_key FROM media ORDER BY id').all(),before)
 db.close()
})
test('song edits can use account-owned artwork without changing other songs',async()=>{
 const {db,env}=setup();seed(db)
 db.exec("UPDATE media SET thumbnail_key='music/restricted/cover.jpg' WHERE id='restricted'")
 const response=await worker.fetch(req('/api/admin/catalog/safe',{manage:'manager',body:{title:'Correct title',artist:'Correct artist',album:'Correct album',trackNumber:3,kidsAllowed:true,coverSongId:'restricted'}}),env)
 assert.equal(response.status,200)
 assert.equal(db.prepare("SELECT thumbnail_key FROM media WHERE id='safe'").get().thumbnail_key,'music/restricted/cover.jpg')
 assert.equal(db.prepare("SELECT title FROM media WHERE id='restricted'").get().title,'Restricted')
 db.close()
})
