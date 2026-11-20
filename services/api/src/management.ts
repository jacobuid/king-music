import type { Env } from './index'
import { verifyPassword } from './auth'
const json = (data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
export async function managementAccess(request:Request,env:Env,userId:string){
  const session=await env.DB.prepare('SELECT user_id FROM manage_sessions WHERE token=? AND user_id=? AND expires>?').bind(request.headers.get('X-Manage-Token')||'',userId,Date.now()).first()
  if(!session)return null
  return env.DB.prepare("SELECT * FROM profiles WHERE user_id=? AND role='adult' ORDER BY created_at LIMIT 1").bind(userId).first<{id:string;user_id:string;role:'adult'}>()
}
export async function managementRoute(request:Request,env:Env,userId:string):Promise<Response|null>{
  const path=new URL(request.url).pathname
  if(!['/api/manage/unlock','/api/manage/profiles/unlock'].includes(path))return null
  const action=path==='/api/manage/profiles/unlock'?'profiles:manage':'music:manage'
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  if(!await verifyPassword(request,env,action))return json({error:'Confirm your KingAuth password to continue.'},403)
  const profile=await env.DB.prepare("SELECT id,name,role,user_id FROM profiles WHERE user_id=? AND role='adult' ORDER BY created_at LIMIT 1").bind(userId).first()
  if(!profile)return json({error:'Create an adult profile before opening management.'},409)
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),expires=Date.now()+1800000
  await env.DB.prepare('INSERT INTO manage_sessions(token,user_id,expires) VALUES(?,?,?)').bind(token,userId,expires).run()
  return json({token,expires,profile})
}
