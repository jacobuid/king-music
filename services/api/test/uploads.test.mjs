import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
const transpile = name => ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const uri = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`
const storageUri=uri(transpile('storage').replace("'aws4fetch'",JSON.stringify(import.meta.resolve('aws4fetch'))))
const { uploadRoutes } = await import(uri(transpile('uploads').replace("'./storage'",JSON.stringify(storageUri))))
const {uploadUrl,playbackUrl,downloadUrl}=await import(storageUri)
const request=(path,body={})=>new Request(`https://music.test${path}`,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}})
function setup(){
 const db=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).sort())db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'))
 db.exec("INSERT INTO profiles(id,user_id,name,role) VALUES('adult','user','Parent','adult'),('other','user','Other','adult'),('kid','user','Child','kids')")
 const prepare=sql=>{let args=[];return {bind(...values){args=values;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return db.prepare(sql).run(...args)}}}
 return {db,env:{DB:{prepare,async batch(statements){db.exec('BEGIN');try{for(const s of statements)await s.run();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}}}}
}
const adult={id:'adult',role:'adult',user_id:'user'},kid={id:'kid',role:'kids',user_id:'user'}
const details={filename:'song.mp3',size:1234,title:'Song',artist:'Artist',album:'Album',trackNumber:1,kidsAllowed:true}
test('only adults can initiate uploads; invalid audio and oversize files are rejected',async()=>{
 const {db,env}=setup();const storage={uploadUrl:async()=>{throw Error('must not sign')},inspectObject:async()=>null}
 assert.equal((await uploadRoutes(request('/api/admin/uploads',details),env,kid,storage)).status,403)
 for(const body of [{...details,filename:'app.exe'},{...details,size:0},{...details,size:101*1024*1024},{...details,title:''}])assert.equal((await uploadRoutes(request('/api/admin/uploads',body),env,adult,storage)).status,400)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM uploads').get().n,0);db.close()
})
test('uploads enter the catalog only after matching B2 metadata; ownership and expiry are enforced',async()=>{
 const {db,env}=setup();let object=null;let signedKey
 const storage={uploadUrl:async(env,key,mime)=>{signedKey=key;assert.equal(mime,'audio/mpeg');return 'https://storage.test/signed'},inspectObject:async()=>object}
 const start=await uploadRoutes(request('/api/admin/uploads',details),env,adult,storage);assert.equal(start.status,201);const upload=await start.json()
 assert.match(signedKey,/^music\/[a-f0-9-]+\.mp3$/)
 assert.equal(db.prepare('SELECT COUNT(*) n FROM media').get().n,0)
 const complete=request(`/api/admin/uploads/${upload.id}/complete`)
 assert.equal((await uploadRoutes(complete,env,{id:'other',role:'adult',user_id:'user'},storage)).status,404)
 assert.equal((await uploadRoutes(complete,env,adult,storage)).status,409)
 object={size:1200,mime:'audio/mpeg'};assert.equal((await uploadRoutes(complete,env,adult,storage)).status,409)
 object={size:1234,mime:'audio/mpeg'};assert.equal((await uploadRoutes(complete,env,adult,storage)).status,201)
 const media=db.prepare('SELECT * FROM media').get();assert.equal(media.video_key,signedKey);assert.equal(media.mime_type,'audio/mpeg');assert.equal(media.kids_allowed,1)
 const expired=await (await uploadRoutes(request('/api/admin/uploads',details),env,adult,storage)).json();db.prepare('UPDATE uploads SET expires=0 WHERE id=?').run(expired.id)
 assert.equal((await uploadRoutes(request(`/api/admin/uploads/${expired.id}/complete`),env,adult,storage)).status,410)
 db.close()
})
test('B2 signatures scope uploads to a music object and content type',async()=>{
 const env={B2_ENDPOINT:'https://s3.us-west-004.backblazeb2.com',B2_BUCKET:'test-music',B2_KEY_ID:'test-key',B2_APPLICATION_KEY:'test-secret'}
 const url=new URL(await uploadUrl(env,'music/song.mp3','audio/mpeg'))
 assert.equal(url.pathname,'/test-music/music/song.mp3');assert.equal(url.searchParams.get('X-Amz-Expires'),'900');assert.match(url.searchParams.get('X-Amz-SignedHeaders'),/content-type/)
 const play=new URL(await playbackUrl(env,'music/song.mp3'));assert.equal(play.searchParams.get('X-Amz-Expires'),'3600')
 await assert.rejects(uploadUrl(env,'other/song.mp3','audio/mpeg'),/Invalid music storage key/)
})

test('download signatures include an attachment filename and a short expiry',async()=>{
 const env={B2_ENDPOINT:'https://s3.us-west-004.backblazeb2.com',B2_BUCKET:'test-music',B2_KEY_ID:'test-key',B2_APPLICATION_KEY:'test-secret'}
 const url=new URL(await downloadUrl(env,'music/song.m4a','A "Song".m4a'))
 assert.equal(url.searchParams.get('X-Amz-Expires'),'900');assert.match(url.searchParams.get('response-content-disposition'),/^attachment; filename=/);assert.ok(url.searchParams.get('X-Amz-Signature'));assert.doesNotMatch(url.searchParams.get('response-content-disposition'),/filename="A "Song"/)
})