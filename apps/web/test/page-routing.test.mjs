import test from 'node:test'
import assert from 'node:assert/strict'
import {historyPage,pageHash,readPageHash,navigationSection} from '../src/page-routing.mjs'
test('song search, playlist gallery and each detail page have distinct routes',()=>{
 const pages=[{section:'library'},{section:'playlists'},{section:'playlist',filter:{playlistId:'mix/1',name:'Mix',ids:['a']}},{section:'album',filter:{album:'Awake & Live',artist:'Skillet'}},{section:'artist',filter:{artist:'Skillet'}}]
 assert.deepEqual(pages.map(pageHash),['#songs','#playlists','#playlist?id=mix%2F1','#album?album=Awake+%26+Live&artist=Skillet','#artist?artist=Skillet'])
 for(const page of pages){const roundTrip=readPageHash(pageHash(page));assert.equal(roundTrip.section,page.section);if(page.filter?.playlistId)assert.equal(roundTrip.filter.playlistId,page.filter.playlistId);if(page.filter?.album)assert.deepEqual(roundTrip.filter,page.filter)}
})
test('legacy shared-library routes migrate to dedicated details and retain the correct parent navigation',()=>{
 assert.equal(readPageHash('#library?playlist=mix').section,'playlist')
 assert.equal(readPageHash('#playlists?playlist=mix').section,'playlist')
 assert.equal(pageHash(historyPage({section:'library',filter:{playlistId:'mix'}})),'#playlist?id=mix')
 assert.equal(readPageHash('#library?album=Awake&artist=Skillet').section,'album')
 assert.equal(navigationSection('playlist'),'playlists');assert.equal(navigationSection('album'),'albums');assert.equal(navigationSection('artist'),'library')
 assert.equal(readPageHash('#playlist').section,'playlists')
})
