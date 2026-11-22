import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseLrc} from '../src/lyrics.mjs'
test('timed lyrics parse fractional and repeated timestamps in playback order',()=>{
 assert.deepEqual(parseLrc('[ar:Artist]\n[00:02.50]Second\n[00:01.100][00:03]First'),[{time:1.1,text:'First'},{time:2.5,text:'Second'},{time:3,text:'First'}])
})
test('malformed and metadata-only timestamps do not become lyric lines',()=>{
 assert.deepEqual(parseLrc('[00:99]Bad\n[ti:Song]\n[00:01]\nplain text'),[]);assert.deepEqual(parseLrc(null),[])
})
