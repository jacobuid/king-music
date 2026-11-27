import {test} from 'node:test'
import assert from 'node:assert/strict'
import {worker,setup,seed,req} from './helpers.mjs'
Error.stackTraceLimit=1
test('library is shared by account, isolates accounts, and filters kids playback',async()=>{const {db,env}=setup();seed(db)
 for(const profile of ['adult','other-adult']){const r=await worker.fetch(req('/api/library',{profile}),env);assert.equal(r.status,200);assert.deepEqual((await r.json()).map(s=>s.id).sort(),['restricted','safe'])}
 assert.deepEqual((await(await worker.fetch(req('/api/library',{profile:'kid'}),env)).json()).map(s=>s.id),['safe'])
 for(const id of ['foreign-song','restricted'])assert.equal((await worker.fetch(req(`/api/media/${id}/play`,{profile:'kid',body:{profileId:'kid'}}),env)).status,404)
 assert.equal((await worker.fetch(req('/api/media/safe/play',{profile:'kid',body:{profileId:'kid'}}),env)).status,200)
 assert.deepEqual((await(await worker.fetch(req('/api/library',{user:'u2',profile:'foreign'}),env)).json()).map(s=>s.id),['foreign-song']);db.close()})
test('profile PIN cannot replace account password; confirmations are scoped and single use',async()=>{const {db,env}=setup();seed(db)
 const body={name:'New child',pin:'1234',role:'kids'}
 assert.equal((await worker.fetch(req('/api/profiles',{body}),env)).status,403)
 assert.equal((await worker.fetch(req('/api/profiles',{body,proof:'music:manage|wrong-action'}),env)).status,403)
 const proof='profile:create|'+crypto.randomUUID()
 assert.equal((await worker.fetch(req('/api/profiles',{profile:'',body,proof}),env)).status,201)
 assert.equal((await worker.fetch(req('/api/profiles',{body,proof}),env)).status,403)
 assert.equal((await worker.fetch(req('/api/manage/unlock',{body:{}}),env)).status,403)
 const unlocked=await worker.fetch(req('/api/manage/unlock',{profile:'',body:{},proof:'music:manage|'+crypto.randomUUID()}),env);assert.equal(unlocked.status,200);const session=await unlocked.json()
 assert.equal((await worker.fetch(req('/api/admin/imports',{profile:'',manage:session.token}),env)).status,200)
 assert.equal((await worker.fetch(req('/api/admin/imports',{user:'u2',profile:'',manage:session.token}),env)).status,403)
 db.prepare('UPDATE manage_sessions SET expires=0').run()
 assert.equal((await worker.fetch(req('/api/admin/imports',{profile:'',manage:session.token}),env)).status,403);db.close()})
test('song edits and bulk kids flags require adult access and stay within account',async()=>{const {db,env}=setup();seed(db)
 const body={title:'Changed',artist:'Artist',album:'Album',trackNumber:3,kidsAllowed:true}
 assert.equal((await worker.fetch(req('/api/admin/catalog/restricted',{profile:'kid',body}),env)).status,403)
 assert.equal((await worker.fetch(req('/api/admin/catalog/restricted',{body}),env)).status,200)
 assert.equal((await worker.fetch(req('/api/admin/catalog/foreign-song',{manage:'manager',body}),env)).status,404)
 let kids=await(await worker.fetch(req('/api/library',{profile:'kid'}),env)).json();assert.equal(kids.length,2)
 const update=await worker.fetch(req('/api/admin/catalog/bulk',{manage:'manager',body:{ids:['safe','restricted','foreign-song'],kidsAllowed:false}}),env);assert.equal(update.status,200);assert.equal((await update.json()).updated,2)
 kids=await(await worker.fetch(req('/api/library',{profile:'kid'}),env)).json();assert.equal(kids.length,0)
 assert.equal(db.prepare("SELECT kids_allowed FROM media WHERE id='foreign-song'").get().kids_allowed,1)
 assert.equal((await worker.fetch(req('/api/media/safe/play',{profile:'kid',body:{profileId:'kid'}}),env)).status,404)
 db.close()})

test('Manage Profiles accepts account password confirmation without a profile PIN',async()=>{
 const {db,env}=setup();seed(db)
 const path='/api/manage/profiles/unlock'
 assert.equal((await worker.fetch(req(path,{body:{}}),env)).status,403)
 assert.equal((await worker.fetch(req(path,{profile:'',body:{},proof:'music:manage|'+crypto.randomUUID()}),env)).status,403)
 const proof='profiles:manage|'+crypto.randomUUID()
 const response=await worker.fetch(req(path,{profile:'',body:{},proof}),env)
 assert.equal(response.status,200)
 const session=await response.json();assert.equal(session.profile.user_id,'u1');assert.ok(session.token)
 assert.equal((await worker.fetch(req(path,{profile:'',body:{},proof}),env)).status,403)
 db.close()
})

test('profile editing requires the account password session and preserves the last adult',async()=>{
 const {db,env}=setup();seed(db)
 const body={name:'Updated child',role:'kids',avatar:'cat',pin:''}
 assert.equal((await worker.fetch(req('/api/profiles/kid',{body}),env)).status,403)
 const before=db.prepare("SELECT pin_version FROM profiles WHERE id='kid'").get()
 const updated=await worker.fetch(req('/api/profiles/kid',{manage:'manager',body}),env);assert.equal(updated.status,200);assert.equal((await updated.json()).avatar,'cat')
 assert.equal(db.prepare("SELECT pin_version FROM profiles WHERE id='kid'").get().pin_version,before.pin_version)
 assert.equal((await worker.fetch(req('/api/profiles/foreign',{manage:'manager',body}),env)).status,404)
 assert.equal((await worker.fetch(req('/api/profiles/other-adult',{manage:'manager',body}),env)).status,200)
 assert.equal((await worker.fetch(req('/api/profiles/adult',{manage:'manager',body}),env)).status,409)
 const reset=await worker.fetch(req('/api/profiles/kid',{manage:'manager',body:{...body,pin:'9876'}}),env);assert.equal(reset.status,200)
 assert.equal((await worker.fetch(req('/api/library',{profile:'kid'}),env)).status,403)
 const unlocked=await worker.fetch(req('/api/profiles/kid/unlock',{body:{pin:'9876'}}),env);assert.equal(unlocked.status,200)
 db.close()
})

test('an unlocked listener can change only their own picture without an account password',async()=>{
 const {db,env}=setup();seed(db)
 const r=await worker.fetch(req('/api/profiles/kid/avatar',{profile:'kid',body:{avatar:'monkey',role:'adult',name:'Not applied',pin:'9999'}}),env)
 assert.equal(r.status,200);assert.equal((await r.json()).avatar,'monkey')
 const kid=db.prepare("SELECT name,role,avatar,pin_version FROM profiles WHERE id='kid'").get();assert.equal(kid.avatar,'monkey');assert.equal(kid.role,'kids');assert.equal(kid.name,'Child');assert.equal(kid.pin_version,0)
 assert.equal((await worker.fetch(req('/api/profiles/adult/avatar',{profile:'kid',body:{avatar:'cat'}}),env)).status,403)
 assert.equal((await worker.fetch(req('/api/profiles/foreign/avatar',{profile:'kid',body:{avatar:'cat'}}),env)).status,403)
 assert.equal((await worker.fetch(req('/api/profiles/kid/avatar',{profile:'',manage:'manager',body:{avatar:'cat'}}),env)).status,403)
 assert.equal((await worker.fetch(req('/api/profiles/kid/avatar',{profile:'kid',body:{avatar:'sunset'}}),env)).status,400)
 db.prepare("UPDATE profile_sessions SET expires=0 WHERE token='kid'").run()
 assert.equal((await worker.fetch(req('/api/profiles/kid/avatar',{profile:'kid',body:{avatar:'cat'}}),env)).status,403)
 db.close()
})
