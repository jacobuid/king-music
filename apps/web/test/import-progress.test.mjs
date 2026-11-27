import test from 'node:test'
import assert from 'node:assert/strict'
import {importProgressPercent} from '../src/import-progress.mjs'

test('download remains measured and confirmed completion is immediate',()=>{
 for(const value of [0,1,25,40,79,100])assert.equal(importProgressPercent(value,120000),value)
})
test('final work has room to progress rather than immediately displaying 99',()=>{
 assert.equal(importProgressPercent(80),80)
 assert.equal(importProgressPercent(99),94)
 const values=[0,10000,30000,60000,120000,600000].map(time=>importProgressPercent(99,time))
 assert.deepEqual(values,[...values].sort((a,b)=>a-b))
 assert.ok(values[2]>values[0]);assert.ok(values.every(value=>value<100))
 assert.equal(importProgressPercent(99,Infinity),99)
 assert.equal(importProgressPercent(99,-100),94)
})
