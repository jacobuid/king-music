import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const parse = text => Object.fromEntries(text.split(/\r?\n/).filter(line => /^\s*[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map(line => { const i=line.indexOf('='); return [line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^(['"])(.*)\1$/,'$2')] }))
const source = process.argv[2] || '.env.bootstrap'
const credentials = parse(readFileSync(source, 'utf8'))
const saved = existsSync('.env.bootstrap') ? parse(readFileSync('.env.bootstrap','utf8')) : {}
const names = ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','B2_BOOTSTRAP_KEY_ID','B2_BOOTSTRAP_APPLICATION_KEY']
for (const name of names) if (!credentials[name]) throw new Error(`${name} is missing from the credential file`)
const env = { ...process.env, ...Object.fromEntries(names.map(name => [name,credentials[name]])), PROJECT_SLUG:'king-music', B2_BUCKET:'jacobuid-king-music', B2_KEY_PREFIX:'king-music-worker-', WEB_ORIGIN:'https://jacobuid.github.io', WEB_ORIGINS:'https://jacobuid.github.io,http://localhost:5173', APP_SIGNING_SECRET:saved.APP_SIGNING_SECRET || randomBytes(32).toString('hex'), WRITE_SECRETS:'true' }
const directory = mkdtempSync(join(tmpdir(),'king-music-provision-'))
function run(command,args,extra={}) { return execFileSync(command,args,{env:{...env,...extra},encoding:'utf8',stdio:['pipe','pipe','pipe']}) }
function script(file) {
  const output=join(directory,file.replace(/\W/g,'-')+'.out')
  writeFileSync(output,'',{mode:0o600})
  const result=run(process.execPath,[file],{GITHUB_OUTPUT:output})
  process.stdout.write(result)
  return parse(readFileSync(output,'utf8'))
}
try {
  // Persist the app-specific signing secret before creating any resources.
  writeFileSync('.env.bootstrap', names.map(name=>`${name}=${env[name]}`).join('\n')+`\nAPP_SIGNING_SECRET=${env.APP_SIGNING_SECRET}\n`,{mode:0o600})
  const d1=script('scripts/provision-d1.mjs')
  const workers=script('scripts/configure-cloudflare.mjs')
  const b2=script('scripts/provision-b2.mjs')
  Object.assign(env,{D1_DATABASE_ID:d1.database_id,B2_KEY_ID:b2.key_id,B2_APPLICATION_KEY:b2.application_key,B2_ENDPOINT:b2.endpoint})
  run(process.execPath,['scripts/configure-deployment.mjs'])
  const wrangler=['node_modules/wrangler/bin/wrangler.js']
  process.stdout.write(run(process.execPath,[...wrangler,'d1','migrations','apply','DB','--remote','--config','services/api/wrangler.jsonc']))
  // Install secrets before deploying the authenticated API. Wrangler creates an empty Worker if needed.
  process.stdout.write(run(process.execPath,[...wrangler,'secret','bulk','services/api/.deployment-secrets.json','--config','services/api/wrangler.jsonc']))
  process.stdout.write(run(process.execPath,[...wrangler,'deploy','--config','services/api/wrangler.jsonc']))
  const apiUrl=`https://king-music-api.${workers.subdomain}.workers.dev`
  let healthy=false
  for(let attempt=0;attempt<10;attempt++) {
    try { const health=await fetch(`${apiUrl}/api/health`);if(health.ok && (await health.json()).ok){healthy=true;break} } catch {}
    await new Promise(resolve=>setTimeout(resolve,2000))
  }
  if(!healthy) throw new Error('Deployed API health check failed')
  for(const name of [...names,'APP_SIGNING_SECRET']) execFileSync('gh',['secret','set',name,'--repo','jacobuid/king-music'],{input:env[name],env,stdio:['pipe','pipe','pipe']})
  execFileSync('gh',['variable','set','VITE_API_URL','--repo','jacobuid/king-music','--body',apiUrl],{env,stdio:['pipe','pipe','pipe']})
  writeFileSync('apps/web/.env',`VITE_API_URL=${apiUrl}\n`)
  writeFileSync('services/api/.dev.vars',`APP_SIGNING_SECRET=${env.APP_SIGNING_SECRET}\nB2_KEY_ID=${env.B2_KEY_ID}\nB2_APPLICATION_KEY=${env.B2_APPLICATION_KEY}\nB2_ENDPOINT=${env.B2_ENDPOINT}\nB2_BUCKET=${env.B2_BUCKET}\n`,{mode:0o600})
  console.log(`Backend ready: ${apiUrl}\nPrivate B2 bucket: ${env.B2_BUCKET}\nGitHub deployment secrets and VITE_API_URL installed.`)
} catch(error) {
  // Child output can include credentials; report only the failed operation.
  console.error(error instanceof Error ? error.message.split('\n')[0] : 'Backend setup failed')
  process.exitCode=1
} finally {
  if (!directory.startsWith(join(tmpdir(),'king-music-provision-'))) throw new Error('Unexpected temporary directory')
  rmSync(directory,{recursive:true,force:true})
  rmSync('services/api/.deployment-secrets.json',{force:true})
}
