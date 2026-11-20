import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { uploadUrl, playbackUrl, inspectObject } from '../services/api/src/storage.ts'
const parse=text=>Object.fromEntries(text.split(/\r?\n/).filter(line=>/^[A-Z][A-Z0-9_]*=/.test(line)).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)]}))
const env=parse(readFileSync('services/api/.dev.vars','utf8'))
const bootstrap=parse(readFileSync('.env.bootstrap','utf8'))
const config=JSON.parse(readFileSync('services/api/wrangler.jsonc','utf8'))
const origins=config.vars.WEB_ORIGINS.split(',')
const response=await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account',{headers:{Authorization:`Basic ${Buffer.from(`${bootstrap.B2_BOOTSTRAP_KEY_ID}:${bootstrap.B2_BOOTSTRAP_APPLICATION_KEY}`).toString('base64')}`}})
if(!response.ok)throw Error('B2 authorization failed')
const auth=await response.json(),storage=auth.apiInfo.storageApi
async function native(operation,body){const r=await fetch(`${storage.apiUrl}/b2api/v4/${operation}`,{method:'POST',headers:{Authorization:auth.authorizationToken,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(`${operation} failed (${r.status})`);return r.json()}
const listed=await native('b2_list_buckets',{accountId:auth.accountId,bucketName:env.B2_BUCKET})
const bucket=listed.buckets.find(b=>b.bucketName===env.B2_BUCKET)
assert.ok(bucket);assert.equal(bucket.bucketType,'allPrivate')
if(process.argv.includes('--configure-cors')){
 assert.equal(bucket.bucketName,'jacobuid-king-music')
 await native('b2_update_bucket',{accountId:auth.accountId,bucketId:bucket.bucketId,ifRevisionIs:bucket.revision,corsRules:[{corsRuleName:'kingMusicUploadPlayback',allowedOrigins:origins,allowedHeaders:['range','content-type'],allowedOperations:['s3_get','s3_head','s3_put'],exposeHeaders:['content-length','content-range','content-type'],maxAgeSeconds:3600}]})
 console.log('Configured upload and playback CORS for the King Music frontend origins.')
}
const key=`music/_checks/${randomUUID()}.wav`
const bytes=Buffer.alloc(44+16000)
bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40)
try{
 const signedUpload=await uploadUrl(env,key,'audio/wav')
 for(const origin of origins){const cors=await fetch(signedUpload,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type'}});assert.ok(cors.ok,`CORS preflight failed for ${origin}`);assert.equal(cors.headers.get('Access-Control-Allow-Origin'),origin)}
 const uploaded=await fetch(signedUpload,{method:'PUT',headers:{'Content-Type':'audio/wav'},body:bytes})
 assert.ok(uploaded.ok,`B2 upload failed (${uploaded.status})`)
 const metadata=await inspectObject(env,key);assert.equal(metadata.size,bytes.length);assert.equal(metadata.mime,'audio/wav')
 const signedPlayback=await playbackUrl(env,key)
 const downloaded=await fetch(signedPlayback,{headers:{Range:'bytes=0-43'}});assert.equal(downloaded.status,206);assert.equal((await downloaded.arrayBuffer()).byteLength,44)
 const anonymous=new URL(signedPlayback);anonymous.search='';const denied=await fetch(anonymous);assert.ok([401,403].includes(denied.status),'Unsigned object access must be denied')
 console.log('PASS: private bucket, upload CORS, signed audio upload, verified metadata, range playback, anonymous access denied.')
}finally{
 const files=await native('b2_list_file_names',{bucketId:bucket.bucketId,startFileName:key,prefix:key,maxFileCount:1})
 const file=files.files.find(f=>f.fileName===key)
 if(file){await native('b2_delete_file_version',{fileName:key,fileId:file.fileId});console.log('Removed the temporary test audio object.')}
}
