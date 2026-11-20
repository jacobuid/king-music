import { readFileSync, writeFileSync } from 'node:fs'

const path = 'services/api/wrangler.jsonc'
const config = JSON.parse(readFileSync(path, 'utf8'))
if (!process.env.D1_DATABASE_ID) throw new Error('D1_DATABASE_ID is missing')
config.d1_databases[0].database_id = process.env.D1_DATABASE_ID
if (process.env.PROJECT_SLUG) {
  config.name = `${process.env.PROJECT_SLUG}-api`
  config.d1_databases[0].database_name = `${process.env.PROJECT_SLUG}-prod`
}
if (process.env.B2_ENDPOINT) config.vars.B2_ENDPOINT = process.env.B2_ENDPOINT
if (process.env.B2_BUCKET) config.vars.B2_BUCKET = process.env.B2_BUCKET
if (process.env.WEB_ORIGIN) config.vars.WEB_ORIGIN = process.env.WEB_ORIGIN
config.vars.WEB_ORIGINS = process.env.WEB_ORIGINS || config.vars.WEB_ORIGIN
if (process.env.CLOUDFLARE_ACCOUNT_ID) config.account_id = process.env.CLOUDFLARE_ACCOUNT_ID
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)

if (process.env.WRITE_SECRETS !== 'true') process.exit(0)
const secrets = {
  APP_SIGNING_SECRET: process.env.APP_SIGNING_SECRET,
  B2_KEY_ID: process.env.B2_KEY_ID,
  B2_APPLICATION_KEY: process.env.B2_APPLICATION_KEY,
}
for (const [name, value] of Object.entries(secrets)) if (!value) throw new Error(`${name} is missing`)
if (process.env.MUSIC_SERVICE_URL && process.env.MUSIC_SERVICE_TOKEN) Object.assign(secrets, { MUSIC_SERVICE_URL: process.env.MUSIC_SERVICE_URL, MUSIC_SERVICE_TOKEN: process.env.MUSIC_SERVICE_TOKEN })
writeFileSync('services/api/.deployment-secrets.json', JSON.stringify(secrets))
