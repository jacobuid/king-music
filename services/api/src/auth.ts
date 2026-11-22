import { createKingAuthVerifier } from '@jacobuid/king-auth/verifier'
type AuthEnv = { WEB_ORIGIN: string; WEB_ORIGINS?: string }
// Each Worker isolate retains its verifiers and their public-key caches.
const verifiers = new Map<string, ReturnType<typeof createKingAuthVerifier>>()
function verifier(request: Request, env: AuthEnv, verification: 'central' | 'access-pass') {
  const origin = request.headers.get('Origin')
  const allowed = (env.WEB_ORIGINS || env.WEB_ORIGIN).split(',').map(value => value.trim())
  if (!origin || !allowed.includes(origin)) return null
  const key = `${verification}:${origin}`
  let auth = verifiers.get(key)
  if (!auth) {
    auth = createKingAuthVerifier({ origin, verification, allowLocalhost: origin === 'http://localhost:5173' })
    verifiers.set(key, auth)
  }
  return auth
}
export async function authorize(request: Request, env: AuthEnv) {
  const path = new URL(request.url).pathname
  const confirmation = request.method === 'POST' && request.headers.has('X-Reauthentication-Proof') && ['/api/manage/unlock', '/api/manage/profiles/unlock', '/api/profiles'].includes(path)
  const auth = verifier(request, env, confirmation ? 'central' : 'access-pass')
  if (!auth) return null
  const session = await auth.getSession(request)
  return session?.user.emailVerified ? session.user.id : null
}
export async function verifyPassword(request: Request, env: AuthEnv, action: string) {
  const proof = request.headers.get('X-Reauthentication-Proof')
  if (!proof) return false
  const auth = verifier(request, env, 'central')
  return auth ? auth.verifyReauthentication(request, { proof, action }) : false
}
