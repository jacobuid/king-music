import {test} from 'node:test'
import assert from 'node:assert/strict'
import {emptyHomeActivity,homeShelves,recentSong,recentAlbum} from '../src/home-activity.mjs'
const tracks=[{id:'old',album:'Older',artist:'Artist',createdAt:'2020-01-01'},{id:'fresh',album:'New album',artist:'Artist',createdAt:'2026-11-21'},{id:'old-new-song',album:'Older',artist:'Artist',createdAt:'2026-11-20'},{id:'single',album:'',createdAt:'2026-11-22'}]
test('albums without visits use the newest song upload in each album; songs start empty',()=>{
 const shelves=homeShelves(tracks);assert.deepEqual(shelves.songs,[]);assert.deepEqual(shelves.albums.map(song=>song.album),['New album','Older']);assert.equal(shelves.albums[1].id,'old-new-song');assert.equal(shelves.hasVisitedAlbums,false)
})
test('recent songs and visited albums retain recency, deduplicate and omit removed tracks',()=>{
 let activity=recentSong(emptyHomeActivity(),'old',1);activity=recentSong(activity,'fresh',2);activity=recentSong(activity,'old',3);activity=recentAlbum(activity,'Older','Artist',4)
 assert.deepEqual(homeShelves(tracks,activity).songs.map(song=>song.id),['old','fresh']);assert.deepEqual(homeShelves(tracks,activity).albums.map(song=>song.album),['Older']);assert.equal(homeShelves(tracks,activity).hasVisitedAlbums,true)
 assert.deepEqual(homeShelves(tracks.filter(song=>song.id!=='old'),activity).songs.map(song=>song.id),['fresh'])
})
test('a delayed activity response cannot replace a more recent visit or play',()=>{
 let activity=recentSong(emptyHomeActivity(),'old',100);activity=recentSong(activity,'old',10);assert.equal(activity.songs[0].lastPlayedAt,100)
 activity=recentAlbum(activity,'Older','Artist',100);activity=recentAlbum(activity,'Older','Artist',10);assert.equal(activity.albums[0].lastVisitedAt,100)
})
