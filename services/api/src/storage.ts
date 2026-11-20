import { AwsClient } from 'aws4fetch'
import type { Env } from './index'
export const MAX_SONG_BYTES = 100 * 1024 * 1024
export const audioTypes: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav' }
export const allowedKey = (key: string) => /^music\/[a-zA-Z0-9/_ .-]+$/.test(key) && !key.includes('..')
function storage(env: Env) {
  const endpoint = new URL(env.B2_ENDPOINT)
  if (endpoint.protocol !== 'https:' || !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/.test(endpoint.hostname) || !env.B2_BUCKET || !env.B2_KEY_ID || !env.B2_APPLICATION_KEY) throw new Error('B2 storage is not configured')
  return { endpoint, client: new AwsClient({ accessKeyId: env.B2_KEY_ID, secretAccessKey: env.B2_APPLICATION_KEY, service: 's3', region: endpoint.hostname.split('.')[1], retries: 2 }) }
}
function objectUrl(endpoint: URL, env: Env, key: string) {
  if (!allowedKey(key)) throw new Error('Invalid music storage key')
  return `${endpoint.origin}/${encodeURIComponent(env.B2_BUCKET)}/${key.split('/').map(encodeURIComponent).join('/')}`
}
export async function playbackUrl(env: Env, key: string) {
  const { endpoint, client } = storage(env)
  return (await client.sign(`${objectUrl(endpoint, env, key)}?X-Amz-Expires=3600`, { aws: { signQuery: true } })).url
}
export async function uploadUrl(env: Env, key: string, mime: string) {
  const { endpoint, client } = storage(env)
  return (await client.sign(`${objectUrl(endpoint, env, key)}?X-Amz-Expires=900`, { method: 'PUT', headers: { 'Content-Type': mime }, aws: { signQuery: true, allHeaders: true } })).url
}
export async function inspectObject(env: Env, key: string) {
  const { endpoint, client } = storage(env)
  const response = await client.fetch(objectUrl(endpoint, env, key), { method: 'HEAD' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error('Unable to verify the uploaded B2 object')
  return { size: Number(response.headers.get('Content-Length')), mime: response.headers.get('Content-Type')?.split(';')[0].trim() }
}
