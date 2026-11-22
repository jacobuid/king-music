import {test} from 'node:test'
import assert from 'node:assert/strict'
import {cropSquare,playlistTiles} from '../src/playlist-artwork.mjs'
test('square crop preserves source bounds at every zoom and position',()=>{
 assert.deepEqual(cropSquare({width:1200,height:800}),{sx:200,sy:0,side:800})
 assert.deepEqual(cropSquare({width:1200,height:800},2,1,-1),{sx:800,sy:0,side:400})
 for(const zoom of [1,2,4])for(const x of [-1,0,1])for(const y of [-1,0,1]){const crop=cropSquare({width:800,height:1200},zoom,x,y);assert.ok(crop.sx>=0&&crop.sy>=0&&crop.sx+crop.side<=800&&crop.sy+crop.side<=1200)}
})
test('playlist collage always has four equal tiles and repeats available artwork when needed',()=>{
 assert.deepEqual(playlistTiles([{id:'one'},{id:'two'}]).map(song=>song.id),['one','two','one','two']);assert.deepEqual(playlistTiles(),[null,null,null,null]);assert.equal(playlistTiles(Array.from({length:8},(_,id)=>({id}))).length,4)
})
