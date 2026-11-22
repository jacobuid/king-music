import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {generateKeyPair,exportJWK,SignJWT} from 'jose'
const verifierUrl=import.meta.resolve('@jacobuid/king-auth/verifier')
const source=ts.transpileModule(readFileSync(new URL('../src/auth.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("'@jacobuid/king-auth/verifier'",JSON.stringify(verifierUrl))
const {authorize,verifyPassword}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
test('normal requests verify signed passes locally with reused keys; proof requests remain central',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('EdDSA'),jwk=await exportJWK(publicKey)
 const now=Math.floor(Date.now()/1000),origin='https://music.test',env={WEB_ORIGIN:origin},calls=[]
 const previous=globalThis.fetch
 globalThis.fetch=async(url,options)=>{calls.push(String(url));if(String(url).endsWith('/jwks'))return Response.json({keys:[{...jwk,kid:'test',alg:'EdDSA',use:'sig'}]});if(String(url).endsWith('/get-session'))return Response.json({user:{id:'u1',emailVerified:true}});if(String(url).endsWith('/reauthentication/consume'))return Response.json({allowed:true});throw Error('Unexpected request')}
 try{
 const sign=aud=>new SignJWT({kind:'king-auth-access',sid:'s1',user:{id:'u1',emailVerified:true},session:{id:'s1',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()}}).setProtectedHeader({alg:'EdDSA',kid:'test'}).setIssuer('https://kingauth.app/api/browser').setAudience(aud).setSubject('u1').setIssuedAt(now).setExpirationTime(now+1800).sign(privateKey)
 const token=await sign(origin)
 const req=(path='/api/library',extra={})=>new Request(origin+path,{headers:{Origin:origin,Authorization:'Bearer '+token,...extra},...(extra['X-Reauthentication-Proof']?{method:'POST'}:{})})
 assert.equal(await authorize(req(),env),'u1');assert.equal(await authorize(req(),env),'u1')
 assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/jwks'))
 const wrong=new Request(origin+'/api/library',{headers:{Origin:origin,Authorization:'Bearer '+await sign('https://other.test')}})
 assert.equal(await authorize(wrong,env),null)
 assert.equal(await authorize(new Request(origin+'/api/library',{headers:{Origin:'https://evil.test',Authorization:'Bearer '+token}}),env),null)
 const confirm=req('/api/manage/unlock',{'X-Reauthentication-Proof':'proof'})
 assert.equal(await authorize(confirm,env),'u1');assert.equal(await verifyPassword(confirm,env,'music:manage'),true)
 assert.ok(calls[1].endsWith('/get-session'));assert.ok(calls[2].endsWith('/reauthentication/consume'))
 await authorize(req('/api/library',{'X-Reauthentication-Proof':'unrelated'}),env)
 assert.equal(calls.length,3)
 }finally{globalThis.fetch=previous}
})
