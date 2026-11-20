import { appendFileSync } from 'node:fs'
const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token } = process.env
if (!accountId || !token) throw new Error('Cloudflare credentials are missing')
const name = `${process.env.PROJECT_SLUG || 'king-music'}-prod`
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
async function call(url, options = {}) {
  const response = await fetch(url, { ...options, headers })
  const body = await response.json()
  if (!response.ok || !body.success) throw new Error(`Cloudflare D1 request failed (${response.status})`)
  return body.result
}
const databases = await call(`${base}?name=${encodeURIComponent(name)}&per_page=100`)
const database = databases.find(db => db.name === name) || await call(base, { method: 'POST', body: JSON.stringify({ name }) })
if (!database.uuid) throw new Error('Cloudflare did not return a D1 database ID')
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `database_id=${database.uuid}\n`)
console.log(`Configured D1 database ${name}: ${database.uuid}`)
