import {test} from 'node:test'
import assert from 'node:assert/strict'
import {detectImportInput} from '../../../apps/web/src/import-input.mjs'

test('unified importer distinguishes search, song links and playlist links',()=>{
 assert.deepEqual(detectImportInput('  CAIN Rise Up  '),{kind:'search',query:'CAIN Rise Up'})
 for(const url of ['https://www.youtube.com/watch?v=abcdefghijk','https://youtu.be/abcdefghijk?t=3','music.youtube.com/watch?v=abcdefghijk','https://www.youtube.com/shorts/abcdefghijk'])assert.equal(detectImportInput(url).videoId,'abcdefghijk')
 for(const url of ['https://www.youtube.com/playlist?list=PLabcdefghijk','https://music.youtube.com/watch?v=abcdefghijk&list=PLabcdefghijk'])assert.equal(detectImportInput(url).kind,'playlist')
 for(const url of ['https://youtube.com.evil.test/watch?v=abcdefghijk','https://example.com/song','https://youtube.com/watch?v=no','http://youtube.com/watch?v=abcdefghijk'])assert.equal(detectImportInput(url).kind,'invalid')
})
