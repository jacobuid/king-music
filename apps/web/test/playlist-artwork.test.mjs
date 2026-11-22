import {test} from 'node:test'
import assert from 'node:assert/strict'
import {cropSquare,playlistTiles} from '../src/playlist-artwork.mjs'
test('square crop preserves source bounds at every zoom and position',()=>{
 assert.deepEqual(cropSquare({width:1200,height:800}),{sx:200,sy:0,side:800})
 assert.deepEqual(cropSquare({width:1200,height:800},2,1,-1),{sx:800,sy:0,side:400})
 for(const zoom of [1,2,4])for(const x of [-1,0,1])for(const y of [-1,0,1]){const crop=cropSquare({width:800,height:1200},zoom,x,y);assert.ok(crop.sx>=0&&crop.sy>=0&&crop.sx+crop.side<=800&&crop.sy+crop.side<=1200)}
})
test('playlist collage uses each album once and leaves unused tiles empty',()=>{
 assert.deepEqual(playlistTiles([{id:'one'},{id:'two'}]).map(song=>song?.id||null),['one','two',null,null]);assert.deepEqual(playlistTiles(),[null,null,null,null]);assert.equal(playlistTiles(Array.from({length:8},(_,id)=>({id}))).length,4)
})

test('repeated albums cannot occupy multiple slots even with different artwork',()=>{
 const tiles=playlistTiles([{id:'a',album:'Awake',artist:'Skillet'},{id:'b',album:'awake ',artist:'SKILLET'},{id:'c',album:'Alien Youth',artist:'Skillet'},{id:'d',album:'Other',artist:'Other'},{id:'e',album:'Fourth',artist:'Other'}])
 assert.deepEqual(tiles.map(song=>song.id),['a','c','d','e'])
})

test('older API cover responses use library album metadata to eliminate repeated artwork',()=>{
 const covers=[{id:'a',thumbnailUrl:'https://b2.test/a.jpg'},{id:'b',thumbnailUrl:'https://b2.test/b.jpg'},{id:'c',thumbnailUrl:'https://b2.test/c.jpg'},{id:'d',thumbnailUrl:'https://b2.test/d.jpg'}]
 const library=[{id:'a',album:'Alien Youth',artist:'Skillet'},...['b','c','d'].map(id=>({id,album:'The Observatory',artist:'Cadet'}))]
 assert.deepEqual(playlistTiles(covers,library).map(song=>song?.id||null),['a','b',null,null])
})
