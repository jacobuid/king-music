import {test} from 'node:test'
import assert from 'node:assert/strict'
import {unzipSync,strFromU8} from 'fflate'
import {albumSongs,albumId,buildAlbumZip,safeDownloadName} from '../src/album-actions.mjs'
const songs=[{id:'b',title:'Second',album:'Album',artist:'Artist',trackNumber:2},{id:'a',title:'First',album:'Album',artist:'Artist',trackNumber:1},{id:'other',title:'Other',album:'Album',artist:'Different'}]
test('album actions select only matching songs and preserve album track order',()=>{
 assert.deepEqual(albumSongs(songs,{album:'Album',artist:'Artist'}).map(song=>song.id),['a','b']);assert.doesNotMatch(albumId({album:'Two Words',artist:'Artist'}),/\s/)
})
test('album ZIP contains ordered playable files with their exact bytes and reports progress',async()=>{
 const ordered=albumSongs(songs,{album:'Album',artist:'Artist'}),progress=[]
 const blob=await buildAlbumZip(ordered,async song=>({url:'https://storage.test/'+song.id,filename:song.title+'.m4a'}),{fetchImpl:async url=>new Response(url.endsWith('/a')?'first audio':'second audio'),onProgress:status=>progress.push(status)})
 const files=unzipSync(new Uint8Array(await blob.arrayBuffer()));assert.deepEqual(Object.keys(files),['01 - First.m4a','02 - Second.m4a']);assert.equal(strFromU8(files['01 - First.m4a']),'first audio');assert.equal(strFromU8(files['02 - Second.m4a']),'second audio');assert.deepEqual(progress.at(-1),{done:2,total:2})
})
test('archive filenames remain safe and preserve long filename extensions',async()=>{
 const blob=await buildAlbumZip([songs[0]],async()=>({url:'https://storage.test/audio',filename:'x'.repeat(200)+'.m4a'}),{fetchImpl:async()=>new Response('audio')});const files=unzipSync(new Uint8Array(await blob.arrayBuffer()));assert.match(Object.keys(files)[0],/\.m4a$/);assert.doesNotMatch(safeDownloadName('../Bad/Album\\name'),/[\/\\]/)
})
test('missing, empty or oversized downloads fail instead of saving an incomplete album',async()=>{
 const source=async()=>({url:'https://storage.test/audio',filename:'Song.m4a'})
 await assert.rejects(buildAlbumZip([],source),/no available songs/)
 await assert.rejects(buildAlbumZip([songs[0]],source,{fetchImpl:async()=>new Response('',{status:404})}),/Could not download/)
 await assert.rejects(buildAlbumZip([songs[0]],source,{fetchImpl:async()=>new Response('')}),/empty/)
 await assert.rejects(buildAlbumZip([songs[0]],source,{fetchImpl:async()=>new Response('oversize'),maxBytes:2}),/too large/)
})
