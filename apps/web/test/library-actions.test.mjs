import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ownPlaylists,canEditPlaylist} from '../src/playlist-visibility.mjs'
import {songShareUrl} from '../src/song-actions.mjs'
test('Home shows only the active profile creator while browsing retains every playlist',()=>{
 const lists=[{id:'one',creatorId:'adult'},{id:'two',creatorId:'kid'}];assert.deepEqual(ownPlaylists(lists,'kid').map(p=>p.id),['two']);assert.equal(lists.length,2)
 assert.equal(canEditPlaylist(lists[0],{id:'kid',role:'kids'}),false);assert.equal(canEditPlaylist(lists[1],{id:'kid',role:'kids'}),true);assert.equal(canEditPlaylist(lists[1],{id:'adult',role:'adult'}),true)
})
test('sharing uses the original source or an authenticated app link, never signed media URLs',()=>{
 assert.equal(songShareUrl({id:'one',youtubeVideoId:'abcdefghijk'},'https://example.com/music/'),'https://music.youtube.com/watch?v=abcdefghijk')
 assert.equal(songShareUrl({id:'one',url:'https://b2.example/private?signature=secret'},'https://example.com/music/?token=private#playing'),'https://example.com/music/?song=one')
})
