import type { Env } from './index'
import { audioTypes, MAX_SONG_BYTES, uploadUrl, inspectObject } from './storage'
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
type Upload = { id: string; profile_id: string; object_key: string; title: string; artist: string; album: string; track_number: number; kids_allowed: number; mime_type: string; size_bytes: number; expires: number }
export async function uploadRoutes(request: Request, env: Env, profile: { id: string; role: string; user_id: string }, storage = { uploadUrl, inspectObject }): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (!path.startsWith('/api/admin/uploads')) return null
  if (profile.role !== 'adult') return json({ error: 'Adult profile required' }, 403)
  if (path === '/api/admin/uploads' && request.method === 'POST') {
    const b = await request.json() as { filename?: string; size?: number; title?: string; artist?: string; album?: string; trackNumber?: number; kidsAllowed?: boolean }
    const extension = typeof b.filename === 'string' ? b.filename.split('.').pop()?.toLowerCase() : ''
    const mime = extension ? audioTypes[extension] : null
    if (!mime || !Number.isSafeInteger(b.size) || b.size! <= 0 || b.size! > MAX_SONG_BYTES || typeof b.title !== 'string' || !b.title.trim() || b.title.length > 200 || typeof b.artist !== 'string' || b.artist.length > 200 || typeof b.album !== 'string' || b.album.length > 200 || !Number.isSafeInteger(b.trackNumber) || b.trackNumber! < 0 || (b.kidsAllowed !== undefined && typeof b.kidsAllowed !== 'boolean')) return json({ error: 'Enter valid song details and an MP3, M4A, AAC, FLAC, OGG, OPUS, or WAV file up to 100 MiB.' }, 400)
    const id = crypto.randomUUID(), key = `music/${id}.${extension}`, expires = Date.now() + 900000
    const url = await storage.uploadUrl(env, key, mime)
    await env.DB.prepare('INSERT INTO uploads(id,profile_id,object_key,title,artist,album,track_number,kids_allowed,mime_type,size_bytes,expires) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id, profile.id, key, b.title.trim(), b.artist.trim(), b.album.trim(), b.trackNumber, b.kidsAllowed ? 1 : 0, mime, b.size, expires).run()
    return json({ id, url, expires, headers: { 'Content-Type': mime } }, 201)
  }
  const match = path.match(/^\/api\/admin\/uploads\/([^/]+)\/complete$/)
  if (match && request.method === 'POST') {
    const upload = await env.DB.prepare('SELECT * FROM uploads WHERE id=? AND profile_id=?').bind(match[1], profile.id).first<Upload>()
    if (!upload) return json({ error: 'Upload not found' }, 404)
    if (upload.expires <= Date.now()) return json({ error: 'Upload expired. Choose the file and try again.' }, 410)
    const object = await storage.inspectObject(env, upload.object_key)
    if (!object) return json({ error: 'Song has not reached storage yet. Retry the upload.' }, 409)
    if (object.size !== upload.size_bytes || object.mime !== upload.mime_type) return json({ error: 'Stored file does not match the upload. Choose the file and try again.' }, 409)
    await env.DB.batch([
      env.DB.prepare("INSERT INTO media(id,title,artist,album,track_number,video_key,mime_type,category,kids_allowed,user_id) SELECT id,title,artist,album,track_number,object_key,mime_type,'Music',kids_allowed,? FROM uploads WHERE id=? AND profile_id=?").bind(profile.user_id, upload.id, profile.id),
      env.DB.prepare('DELETE FROM uploads WHERE id=? AND profile_id=?').bind(upload.id, profile.id),
    ])
    return json({ id: upload.id, title: upload.title }, 201)
  }
  return json({ error: 'Not found' }, 404)
}
