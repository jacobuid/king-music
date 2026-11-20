import {test} from 'node:test'
import assert from 'node:assert/strict'
import {filterSongs,songFilterOptions} from '../../../apps/web/src/song-filters.mjs'
const songs=[{id:1,title:'Rise Up',artist:'CAIN',album:'Rise Up'},{id:2,title:'Yes He Can',artist:'CAIN',album:'Rise Up'},{id:3,title:'Shadows',artist:'David Crowder Band',album:'Church Music'},{id:4,title:'Home',artist:'CAIN',album:'Other'},{id:5,title:'Unknown'}]
test('song filters allow multiple names within each filter and combine filters with text',()=>{
 assert.deepEqual(filterSongs(songs,{artists:['CAIN','David Crowder Band'],albums:['Rise Up','Church Music'],query:'  SH  '}).map(s=>s.id),[3])
 assert.deepEqual(filterSongs(songs,{artists:['CAIN'],albums:['Rise Up']}).map(s=>s.id),[1,2])
 assert.deepEqual(filterSongs(songs,{artists:[''],albums:['']}).map(s=>s.id),[5])
 assert.equal(filterSongs(songs,{albums:['Missing']}).length,0)
 assert.equal(filterSongs(songs,{}).length,5)
 assert.deepEqual(songFilterOptions(songs,'artist'),['','CAIN','David Crowder Band'])
})
