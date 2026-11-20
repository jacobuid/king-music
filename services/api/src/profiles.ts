import { managementAccess } from './management'
import { verifyPassword } from './auth'
import type { Env } from './index'
type Profile = { id: string; user_id: string; name: string; role: 'adult' | 'kids'; pin_hash: string; pin_salt: string; pin_version: number; failed_attempts: number; locked_until: number | null }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
async function pinHash(env: Env, pin: string, salt: string) {
  if (!env.APP_SIGNING_SECRET) throw new Error('Missing APP_SIGNING_SECRET')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.APP_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${salt}:${pin}`)))
}
export async function profileAccess(request: Request, env: Env, userId: string) {
  return env.DB.prepare('SELECT p.* FROM profiles p JOIN profile_sessions s ON s.profile_id=p.id AND s.version=p.pin_version WHERE s.token=? AND s.user_id=? AND p.user_id=? AND s.expires>?').bind(request.headers.get('X-Profile-Token') || '', userId, userId, Date.now()).first<Profile>()
}
export async function profileRoutes(request: Request, env: Env, userId: string, confirmPassword = verifyPassword): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (path === '/api/profiles' && request.method === 'GET') return json((await env.DB.prepare('SELECT id,name,role,avatar,pin_hash IS NOT NULL AS hasPin FROM profiles WHERE user_id=? ORDER BY created_at').bind(userId).all()).results)
  if (path === '/api/profiles' && request.method === 'POST') {
    const body = await request.json() as { name?: string; pin?: string; role?: string; avatar?: string }
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 40 || typeof body.pin !== 'string' || !/^\d{4}$/.test(body.pin) || !['adult','kids'].includes(body.role || 'kids')) return json({ error: 'Enter a name, four-digit PIN, and valid role' }, 400)
    if (body.avatar !== undefined && !['ember','aurora','midnight','penguin','monkey','coyote','cat','rabbit','goat','chicken','hippo','alligator','gorilla','panda','dusty','auburn','slate','copper','willow','pearl','onyx','ruby'].includes(body.avatar)) return json({ error: 'Invalid profile picture' }, 400)
    const exists = await env.DB.prepare('SELECT user_id FROM profile_bootstrap WHERE user_id=?').bind(userId).first()
    if (!await confirmPassword(request,env,'profile:create')) return json({ error: 'Confirm your KingAuth password to create a profile.' }, 403)
    const id = crypto.randomUUID(), salt = crypto.randomUUID(), role = exists ? body.role || 'kids' : 'adult'
    const statements = [env.DB.prepare('INSERT INTO profiles(id,user_id,name,role,pin_hash,pin_salt,avatar) VALUES(?,?,?,?,?,?,?)').bind(id,userId,body.name.trim(),role,await pinHash(env,body.pin,salt),salt,body.avatar || (role === 'kids' ? 'penguin' : 'ember'))]
    if (!exists) statements.unshift(env.DB.prepare('INSERT INTO profile_bootstrap(user_id) VALUES(?)').bind(userId))
    await env.DB.batch(statements)
    return json({ id, name: body.name.trim(), role, avatar: body.avatar || (role === 'kids' ? 'penguin' : 'ember'), hasPin: true }, 201)
  }
  const picture=path.match(/^\/api\/profiles\/([^/]+)\/avatar$/)
  if(picture && request.method==='POST') {
    const unlocked=await profileAccess(request,env,userId)
    if(!unlocked||unlocked.id!==picture[1])return json({error:'Unlock your own profile before changing its picture.'},403)
    const body=await request.json() as {avatar?:string}
    if(!['ember','aurora','midnight','penguin','monkey','coyote','cat','rabbit','goat','chicken','hippo','alligator','gorilla','panda','dusty','auburn','slate','copper','willow','pearl','onyx','ruby'].includes(body.avatar||''))return json({error:'Choose a valid profile picture'},400)
    await env.DB.prepare('UPDATE profiles SET avatar=? WHERE id=? AND user_id=?').bind(body.avatar,picture[1],userId).run()
    return json({avatar:body.avatar})
  }
  const edit=path.match(/^\/api\/profiles\/([^/]+)$/)
  if(edit && request.method==='POST') {
    if(!await managementAccess(request,env,userId))return json({error:'Confirm your KingAuth password to manage profiles.'},403)
    const body=await request.json() as {name?:string;role?:string;avatar?:string;pin?:string}
    const avatars=['ember','aurora','midnight','penguin','monkey','coyote','cat','rabbit','goat','chicken','hippo','alligator','gorilla','panda','dusty','auburn','slate','copper','willow','pearl','onyx','ruby']
    if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>40||!['adult','kids'].includes(body.role||'')||!avatars.includes(body.avatar||'')||(body.pin!==undefined&&body.pin!==''&&(typeof body.pin!=='string'||!/^\d{4}$/.test(body.pin))))return json({error:'Enter valid profile details and a four-digit PIN, or leave the PIN blank to keep it.'},400)
    const existing=await env.DB.prepare('SELECT id FROM profiles WHERE id=? AND user_id=?').bind(edit[1],userId).first()
    if(!existing)return json({error:'Profile not found'},404)
    const salt=body.pin?crypto.randomUUID():null,hash=body.pin?await pinHash(env,body.pin,salt!):null
    const saved=await env.DB.prepare("UPDATE profiles SET name=?,role=?,avatar=?,pin_hash=COALESCE(?,pin_hash),pin_salt=COALESCE(?,pin_salt),pin_version=pin_version+?,failed_attempts=CASE WHEN ?=1 THEN 0 ELSE failed_attempts END,locked_until=CASE WHEN ?=1 THEN NULL ELSE locked_until END WHERE id=? AND user_id=? AND (?='adult' OR role='kids' OR (SELECT COUNT(*) FROM profiles WHERE user_id=? AND role='adult')>1) RETURNING id,name,role,avatar").bind(body.name.trim(),body.role,body.avatar,hash,salt,body.pin?1:0,body.pin?1:0,body.pin?1:0,edit[1],userId,body.role,userId).first()
    if(!saved)return json({error:'Keep at least one adult profile on this account.'},409)
    return json({...saved,hasPin:true})
  }
  const match = path.match(/^\/api\/profiles\/([^/]+)\/unlock$/)
  if (match && request.method === 'POST') {
    const p = await env.DB.prepare('SELECT * FROM profiles WHERE id=? AND user_id=?').bind(match[1],userId).first<Profile>()
    if (!p) return json({ error: 'Profile not found' }, 404)
    const body = await request.json() as { pin?: string }
    // Reserve an attempt atomically before checking the PIN, including concurrent requests.
    const attempt = await env.DB.prepare('UPDATE profiles SET failed_attempts=CASE WHEN locked_until IS NOT NULL AND locked_until<=? THEN 1 ELSE failed_attempts+1 END,locked_until=NULL WHERE id=? AND (locked_until IS NULL OR locked_until<=?) AND (failed_attempts<5 OR locked_until<=?) RETURNING failed_attempts').bind(Date.now(),p.id,Date.now(),Date.now()).first<{ failed_attempts: number }>()
    if (!attempt) return json({ error: 'Too many attempts. Try again in five minutes.' }, 429)
    if (typeof body.pin !== 'string' || !/^\d{4}$/.test(body.pin) || await pinHash(env,body.pin,p.pin_salt) !== p.pin_hash) {
      if (attempt.failed_attempts >= 5) await env.DB.prepare('UPDATE profiles SET locked_until=? WHERE id=?').bind(Date.now()+300000,p.id).run()
      return json({ error: 'Incorrect PIN' }, 403)
    }
    await env.DB.prepare('UPDATE profiles SET failed_attempts=0,locked_until=NULL WHERE id=?').bind(p.id).run()
    const token = hex(crypto.getRandomValues(new Uint8Array(32)).buffer), expires = Date.now()+86400000
    await env.DB.prepare('INSERT INTO profile_sessions(token,profile_id,user_id,version,expires) VALUES(?,?,?,?,?)').bind(token,p.id,userId,p.pin_version,expires).run()
    return json({ token, expires })
  }
  return null
}
