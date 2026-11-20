import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createApiClient} from '../../../apps/web/src/api-client.mjs'
test('missing production API configuration fails before sending credentials',async()=>{
 let fetched=false
 const request=createApiClient({requireBaseUrl:true,getToken:()=>{throw Error('must not request credentials')},fetchImpl:async()=>{fetched=true}})
 await assert.rejects(request('/api/profiles'),/VITE_API_URL/)
 assert.equal(fetched,false)
})
test('HTML fallback and unavailable backend produce actionable errors',async()=>{
 const html=createApiClient({getToken:()=>'',fetchImpl:async()=>new Response('<!doctype html><html></html>',{headers:{'Content-Type':'text/html'}})})
 await assert.rejects(html('/api/profiles'),/instead of JSON/)
 const offline=createApiClient({getToken:()=>'',fetchImpl:async()=>{throw TypeError('Failed to fetch')}})
 await assert.rejects(offline('/api/profiles'),/npm run dev:api/)
})
test('profiles use the API URL and preserve API errors',async()=>{
 const request=createApiClient({baseUrl:'https://api.test/',getToken:()=> 'account',getProfileToken:()=> 'profile',fetchImpl:async(url,options)=>{
 assert.equal(url,'https://api.test/api/profiles');assert.equal(options.headers.Authorization,'Bearer account');assert.equal(options.headers['X-Profile-Token'],'profile')
 return Response.json([{id:'1',name:'Parent'}])
 }})
 assert.deepEqual(await request('/api/profiles'),[{id:'1',name:'Parent'}])
 const denied=createApiClient({getToken:()=>'',fetchImpl:async()=>Response.json({error:'Unauthorized'},{status:401})})
 await assert.rejects(denied('/api/profiles'),/Unauthorized/)
})
