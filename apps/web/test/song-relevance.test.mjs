import test from 'node:test'
import assert from 'node:assert/strict'
import {rankSongs,matchesSong} from '../src/song-relevance.mjs'
test('relevance ranks exact song titles above broader titles regardless of import source',()=>{
 const songs=[{id:'red',title:'Red People',artist:'Artist'},{id:'artist',title:'Other song',artist:'People'},{id:'youtube',title:'People',discovery:true},{id:'prefix',title:'People Come Together',discovery:true}]
 assert.deepEqual(rankSongs(songs,'People').map(song=>song.id),['youtube','prefix','red','artist'])
 const imported={id:'owned',title:'People'},source={id:'source',title:'People',discovery:true};assert.deepEqual(rankSongs([source,imported],'people').map(song=>song.id),['owned','source'])
})
test('search matches words across title artist and album, ignores punctuation and accents, and keeps no-query ordering',()=>{
 const song={title:'A Beautiful Day',artist:'Beyonce',album:'Live!'}
 assert.equal(matchesSong(song,'beautiful Beyonce'),true);assert.equal(matchesSong(song,'BEAUTIFUL live'),true);assert.equal(matchesSong(song,'missing'),false)
 assert.equal(rankSongs([{title:'Red People'},{title:'Peóple!'}],'people')[0].title,'Peóple!')
 assert.deepEqual(rankSongs([{id:'b'},{id:'a'}],[]).map(song=>song.id),['b','a'])
})
