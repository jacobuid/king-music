import { createKingAuthVerifier } from '@jacobuid/king-auth/verifier'
export async function authorize(request: Request, env: { WEB_ORIGIN: string; WEB_ORIGINS?: string }) {
  const origin = request.headers.get('Origin')
  const allowed = (env.WEB_ORIGINS || env.WEB_ORIGIN).split(',').map(value => value.trim())
  if (!origin || !allowed.includes(origin)) return null
  const session = await createKingAuthVerifier({ origin, allowLocalhost: origin === 'http://localhost:5173' }).getSession(request)
  return session?.user.emailVerified ? session.user.id : null
}
export async function verifyPassword(request: Request, env: { WEB_ORIGIN: string; WEB_ORIGINS?: string }, action: string) {
  const origin=request.headers.get('Origin'),proof=request.headers.get('X-Reauthentication-Proof')
  if(!origin||!proof||!(env.WEB_ORIGINS||env.WEB_ORIGIN).split(',').map(value=>value.trim()).includes(origin))return false
  return createKingAuthVerifier({origin,allowLocalhost:origin==='http://localhost:5173'}).verifyReauthentication(request,{proof,action})
}
