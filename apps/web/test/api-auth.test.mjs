import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createApiClient} from '../src/api-client.mjs'
test('API requests use access passes; only password proof endpoints send the saved session',async()=>{
 const calls=[],tokens=[]
 const request=createApiClient({getToken:()=>{tokens.push('session');return 'saved-session'},getAccessToken:async()=>{tokens.push('pass');return 'access-pass'},fetchImpl:async(url,options)=>{calls.push(new Headers(options.headers).get('Authorization'));return Response.json({ok:true})}})
 await request('/api/library')
 await request('/api/manage/unlock',{method:'POST',headers:{'X-Reauthentication-Proof':'proof'}})
 await request('/api/manage/profiles/unlock',{method:'POST',headers:new Headers({'X-Reauthentication-Proof':'proof'})})
 await request('/api/profiles',{method:'POST',headers:{'X-Reauthentication-Proof':'proof'}})
 await request('/api/library',{headers:{'X-Reauthentication-Proof':'unrelated'}})
 assert.deepEqual(tokens,['pass','session','session','session','pass'])
 assert.deepEqual(calls,['Bearer access-pass','Bearer saved-session','Bearer saved-session','Bearer saved-session','Bearer access-pass'])
})
test('missing or failed access pass never sends the saved session to the API',async()=>{
 for(const getAccessToken of [async()=>null,async()=>{throw Error('Renewal unavailable')}]){
 let sent=false
 const request=createApiClient({getAccessToken,getToken:()=>{throw Error('Must not fall back')},fetchImpl:async()=>{sent=true}})
 await assert.rejects(request('/api/library'))
 assert.equal(sent,false)
 }
})
