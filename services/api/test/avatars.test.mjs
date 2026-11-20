import {test} from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync,readdirSync} from 'node:fs'
import {worker,setup,seed,req} from './helpers.mjs'
Error.stackTraceLimit=1
test('expanding avatar choices preserves existing profile and PIN data',()=>{
 const db=new DatabaseSync(':memory:')
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).sort().filter(f=>f<'0008'))db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'))
 db.exec("INSERT INTO profiles(id,user_id,name,role,avatar,pin_hash,pin_salt,pin_version) VALUES('p','account','Existing','kids','penguin','hash','salt',7)")
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).sort().filter(f=>f>='0008'))db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'))
 assert.deepEqual({...db.prepare("SELECT name,avatar,pin_hash,pin_salt,pin_version FROM profiles WHERE id='p'").get()},{name:'Existing',avatar:'penguin',pin_hash:'hash',pin_salt:'salt',pin_version:7})
 db.close()
})
test('animal pictures can be saved to new kids profiles with password confirmation',async()=>{
 const {db,env}=setup();seed(db)
 for(const avatar of ['monkey','coyote','cat','rabbit','goat','chicken','hippo','alligator','gorilla','panda']){
 const response=await worker.fetch(req('/api/profiles',{body:{name:avatar,pin:'1234',role:'kids',avatar},proof:'profile:create|'+crypto.randomUUID()}),env)
 assert.equal(response.status,201,avatar)
 const created=await response.json();assert.equal(created.avatar,avatar);assert.equal(created.role,'kids')
 assert.equal(db.prepare('SELECT avatar FROM profiles WHERE id=?').get(created.id).avatar,avatar)
 }
 const invalid=await worker.fetch(req('/api/profiles',{body:{name:'Invalid',pin:'1234',role:'kids',avatar:'sunset'},proof:'profile:create|'+crypto.randomUUID()}),env)
 assert.equal(invalid.status,400)
 db.close()
})

 test('human portraits can be saved to adult profiles',async()=>{
 const {db,env}=setup();seed(db)
 for(const avatar of ['dusty','auburn','slate','copper','willow','pearl','onyx','ruby']){
 const response=await worker.fetch(req('/api/profiles',{body:{name:avatar,pin:'1234',role:'adult',avatar},proof:'profile:create|'+crypto.randomUUID()}),env)
 assert.equal(response.status,201,avatar)
 const created=await response.json();assert.equal(created.avatar,avatar);assert.equal(created.role,'adult')
 assert.equal(db.prepare('SELECT avatar FROM profiles WHERE id=?').get(created.id).avatar,avatar)
 }
 db.close()
})
