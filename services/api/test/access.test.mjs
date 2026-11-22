import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
const authStub = 'data:text/javascript;base64,'+Buffer.from("export const verifyPassword=async(request,env,action)=>request.headers.get('X-Test-Password-Proof')===action").toString('base64')
const load = async name => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'./auth'",JSON.stringify(authStub)).replace("'./management'",JSON.stringify("data:text/javascript,export%20const%20managementAccess%3Dasync()%3D%3Enull"))).toString('base64')}`)
const { profileRoutes, profileAccess } = await load('profiles')
const { musicRoutes } = await import('./helpers.mjs')
function setup(){
  const db=new DatabaseSync(':memory:')
  for(const file of readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'))
  const prepare=sql=>{let args=[];return {bind(...values){args=values;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return db.prepare(sql).run(...args)}}}
  return {db,env:{DB:{prepare,async batch(statements){db.exec('BEGIN');try{for(const s of statements)await s.run();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}},APP_SIGNING_SECRET:'test-secret-not-for-production'}}
}
const req=(path,body,token,proof=false)=>new Request(`https://music.test${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{'X-Profile-Token':token}:{}),...(proof?{'X-Test-Password-Proof':'profile:create'}:{})},...(body?{body:JSON.stringify(body)}:{})})
test('profile ownership, password-gated creation, PIN lockout and expiry',async()=>{
 const {db,env}=setup()
 const adult=await (await profileRoutes(req('/api/profiles',{name:'Parent',pin:'1234',role:'kids'},undefined,true),env,'u1')).json()
 assert.equal(adult.role,'adult')
 assert.equal(adult.avatar,'ember')
 assert.equal((await profileRoutes(req('/api/profiles',{name:'Bypass',pin:'1234'}),env,'u1')).status,403)
 assert.equal((await profileRoutes(req(`/api/profiles/${adult.id}/unlock`,{pin:'1234'}),env,'u2')).status,404)
 assert.equal((await profileRoutes(req(`/api/profiles/${adult.id}/unlock`,{pin:'0000'}),env,'u1')).status,403)
 const {token}=await (await profileRoutes(req(`/api/profiles/${adult.id}/unlock`,{pin:'1234'}),env,'u1')).json()
 assert.equal((await profileAccess(req('/api/library',null,token),env,'u1')).id,adult.id)
 assert.equal(await profileAccess(req('/api/library',null,token),env,'u2'),null)
 const kid=await (await profileRoutes(req('/api/profiles',{name:'Child',pin:'5678',role:'kids'},token,true),env,'u1')).json()
 assert.equal(kid.avatar,'penguin')
 const listed=await (await profileRoutes(req('/api/profiles'),env,'u1')).json()
 assert.equal(listed.find(p=>p.id===kid.id).avatar,'penguin')
 assert.equal((await profileRoutes(req('/api/profiles',{name:'Invalid picture',pin:'1234',avatar:'../../other'},token),env,'u1')).status,400)
 const kidSession=await (await profileRoutes(req(`/api/profiles/${kid.id}/unlock`,{pin:'5678'}),env,'u1')).json()
 assert.equal((await profileRoutes(req('/api/profiles',{name:'Escalation',pin:'1234',role:'adult'},kidSession.token),env,'u1')).status,403)
 for(let n=0;n<5;n++)assert.equal((await profileRoutes(req(`/api/profiles/${kid.id}/unlock`,{pin:'0000'}),env,'u1')).status,403)
 assert.equal((await profileRoutes(req(`/api/profiles/${kid.id}/unlock`,{pin:'5678'}),env,'u1')).status,429)
 db.prepare('UPDATE profiles SET locked_until=? WHERE id=?').run(Date.now()-1,kid.id)
 assert.equal((await profileRoutes(req(`/api/profiles/${kid.id}/unlock`,{pin:'5678'}),env,'u1')).status,200)
 db.prepare('UPDATE profile_sessions SET expires=0').run()
 assert.equal(await profileAccess(req('/api/library',null,token),env,'u1'),null)
 db.close()
})
test('playlists are shared within the account and deny restricted tracks to kids',async()=>{
 const {db,env}=setup()
 db.exec("INSERT INTO profiles(id,user_id,name,role) VALUES('adult','u','Parent','adult'),('kid','u','Child','kids'); INSERT INTO media(id,title,video_key,kids_allowed,user_id) VALUES('safe','Safe','music/safe.mp3',1,'u'),('restricted','Restricted','music/restricted.mp3',0,'u')")
 const adult={id:'adult',role:'adult',user_id:'u'},kid={id:'kid',role:'kids',user_id:'u'}
 assert.equal((await musicRoutes(req('/api/admin/catalog',{title:'Denied'}),env,kid)).status,403)
 const playlist=await (await musicRoutes(req('/api/playlists',{name:'Favorites'}),env,kid)).json()
 assert.equal((await musicRoutes(req(`/api/playlists/${playlist.id}/tracks`,{mediaId:'safe'}),env,kid)).status,200)
 assert.equal((await musicRoutes(req(`/api/playlists/${playlist.id}/tracks`,{mediaId:'restricted'}),env,kid)).status,404)
 assert.equal((await musicRoutes(req(`/api/playlists/${playlist.id}/tracks`),env,adult)).status,200)
 assert.deepEqual(await (await musicRoutes(req(`/api/playlists/${playlist.id}/tracks`),env,kid)).json(),[{id:'safe'}])
 db.close()
})
