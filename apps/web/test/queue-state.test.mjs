import test from 'node:test'
import assert from 'node:assert/strict'
import { queueReducer, emptyQueue } from '../src/queue-state.mjs'
const song=(id,queueId=id)=>({id,queueId,title:id})
const add=(state,songs)=>queueReducer(state,{type:'add',songs})
test('songs and playlists append without replacing the current song',()=>{
 const state=add(add(emptyQueue(),[song('a')]),[song('b'),song('c')]);assert.deepEqual(state.entries.map(s=>s.id),['a','b','c'])
})
test('duplicate songs retain independent queue identities',()=>{
 const state=add(emptyQueue(),[song('a','one'),song('a','two')]);assert.equal(queueReducer(state,{type:'remove',id:'one'}).entries[0].queueId,'two')
})
test('move reorders upcoming songs without moving the current song',()=>{
 const state=add(emptyQueue(),['a','b','c','d'].map(id=>song(id)));const moved=queueReducer(state,{type:'move',id:'d',before:'b'});assert.deepEqual(moved.entries.map(s=>s.id),['a','d','b','c']);assert.equal(queueReducer(state,{type:'move',id:'b',before:'a'}),state)
})
test('shuffle preserves the current song and every upcoming entry',()=>{
 const state=add(emptyQueue(),['a','b','c','d'].map(id=>song(id)));const shuffled=queueReducer(state,{type:'shuffle',random:()=>0});assert.equal(shuffled.entries[0],state.entries[0]);assert.deepEqual(shuffled.entries.map(s=>s.id).sort(),['a','b','c','d']);assert.notDeepEqual(shuffled.entries,state.entries)
})
test('removing the current song advances and removing the last empties the queue',()=>{
 let state=add(emptyQueue(),[song('a'),song('b')]);state=queueReducer(state,{type:'remove',id:'a'});assert.equal(state.entries[0].id,'b');assert.equal(queueReducer(state,{type:'remove',id:'b'}).entries.length,0)
})
test('natural completion consumes the queue, and clear removes history',()=>{
 let state=add(emptyQueue(),[song('a')]);state=queueReducer(state,{type:'next'});assert.equal(state.entries.length,0);assert.equal(state.history.length,1);assert.deepEqual(queueReducer(state,{type:'clear'}),emptyQueue())
})
test('selecting a queued song keeps other upcoming songs and supports previous',()=>{
 const state=add(emptyQueue(),['a','b','c'].map(id=>song(id)));const selected=queueReducer(state,{type:'select',id:'c'});assert.deepEqual(selected.entries.map(s=>s.id),['c','b']);assert.deepEqual(queueReducer(selected,{type:'previous'}).entries.map(s=>s.id),['a','c','b'])
})

test('Play replaces the current song and keeps upcoming songs instead of appending',()=>{
 const state=add(emptyQueue(),[song('a'),song('b'),song('c')]);const replaced=queueReducer(state,{type:'playNow',song:song('new')});assert.deepEqual(replaced.entries.map(s=>s.id),['new','b','c']);assert.equal(replaced.history.at(-1).id,'a')
})