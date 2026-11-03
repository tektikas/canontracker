// Help pages probe against a running server: node scripts/help-probe.mjs <baseUrl>
// 1. Every page in app/pages has an entry in the help table (app/help/routes.ts), and every entry a page.
// 2. Signed out: /help and every /help/<slug> answer 200 with their own title and description; an unknown slug is 404.
// 3. Every link on a help page goes to a page that answers 200 signed out, and every screenshot exists.
// 4. Every **label** a help page shows (<b class="ui">) appears in the app's own source, and no page says "recorded",
//    "mock", "demo mode", "fixture" or "replay".
// 5. Signed in (a throwaway account with the Broken Tide sample): every app page shows the ? link to its help page,
//    opening in a new tab.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { HELP_ROUTES, HELP_SLUGS } from '../app/help/routes.ts'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!base) throw new Error('Usage: node scripts/help-probe.mjs <baseUrl>')
const root = new URL('..', import.meta.url).pathname
const run = Date.now().toString(36)
let failures = 0
const check = (label, ok, detail = '') => {
  if (ok) console.log(`ok  ${label}`)
  else { failures++; console.log(`FAIL ${label}${detail ? `: ${detail}` : ''}`) }
}
const files = dir => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p] })
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&amp;/g, '&')

// ---------- 1. Route table vs app/pages ----------
const pageFiles = files(join(root, 'app/pages')).filter(f => f.endsWith('.vue'))
// Nuxt's route names: path segments joined by "-", [param] → param, index dropped (settings.vue + settings/index.vue → settings).
const routeName = f => relative(join(root, 'app/pages'), f).replace(/\.vue$/, '').split('/').map(s => s.replace(/^\[(.+)\]$/, '$1')).filter((s, i, a) => !(s === 'index' && a.length > 1)).join('-')
const names = [...new Set(pageFiles.map(routeName))]
check('every page has a help entry', names.every(n => n in HELP_ROUTES), names.filter(n => !(n in HELP_ROUTES)).join(', '))
check('every help entry has a page', Object.keys(HELP_ROUTES).every(n => names.includes(n)), Object.keys(HELP_ROUTES).filter(n => !names.includes(n)).join(', '))
check('every mapped slug is a help page', Object.values(HELP_ROUTES).every(s => s === null || HELP_SLUGS.includes(s)))

// ---------- 2–4. Public help pages ----------
const get = (path, cookie = '') => fetch(base + path, { headers: { cookie }, redirect: 'manual' })
const home = await get('/help')
check('/help is 200 signed out', home.status === 200, String(home.status))
const homeHtml = await home.text()
check('/help lists every help page', HELP_SLUGS.every(s => homeHtml.includes(`href="/help/${s}"`)), HELP_SLUGS.filter(s => !homeHtml.includes(`href="/help/${s}"`)).join(', '))
check('/help has a search box', /type="search"/.test(homeHtml))
check('unknown help page is 404', (await get('/help/no-such-page')).status === 404)

const SKIP = ['app/help/', 'app/utils/marketing.ts', 'app/components/LandingPage.vue', 'app/pages/features', 'app/pages/use-cases', 'app/pages/about.vue', 'app/pages/pricing.vue', 'app/pages/security.vue', 'app/pages/changelog.vue', 'app/pages/pitch.vue', 'app/pages/agents/index.vue', 'app/pages/help/']
const ui = files(join(root, 'app')).filter(f => /\.(vue|ts)$/.test(f) && !SKIP.some(s => relative(root, f).startsWith(s))).map(f => readFileSync(f, 'utf8')).join('\n')
const inUi = l => ui.includes(l) || ui.includes(l.replace(/&/g, '&amp;'))
const FORBIDDEN = /\b(recorded|mock|demo mode|fixtures?|replay(ed|s)?)\b/i

const links = new Set()
const shots = new Set()
let labels = 0
for (const slug of HELP_SLUGS) {
  const res = await get(`/help/${slug}`)
  const html = await res.text()
  const doc = html.slice(html.indexOf('<article'), html.indexOf('</article>'))
  check(`/help/${slug} is 200 signed out`, res.status === 200, String(res.status))
  check(`/help/${slug} has its own title and description`, /<title>[^<]+· Help · Story Bible<\/title>/.test(html) && /<meta name="description" content="[^"]{20,}"/.test(html))
  check(`/help/${slug} is indexable`, !/name="robots" content="[^"]*noindex/.test(html) && !/noindex/.test(res.headers.get('x-robots-tag') ?? ''))
  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) if (!href.startsWith('/_nuxt/') && !/\.(png|ico|svg|webmanifest|webp)$/.test(href)) links.add(href)
  for (const [, src] of doc.matchAll(/(\/shots\/[^" ,]+\.webp)/g)) shots.add(src)
  const missing = [...doc.matchAll(/<b class="ui"[^>]*>(.*?)<\/b>/g)].map(m => decode(m[1])).filter((l) => { labels++; return !inUi(l) })
  check(`/help/${slug}: every label is in the app`, !missing.length, missing.join(' | '))
  const text = decode(doc.replace(/<[^>]+>/g, ' '))
  check(`/help/${slug}: no internal words`, !FORBIDDEN.test(text), text.match(FORBIDDEN)?.[0])
}
console.log(`    (${labels} labels checked)`)
for (const href of links) {
  const s = (await get(href)).status
  check(`link ${href} answers 200 signed out`, s === 200, String(s))
}
for (const src of shots) check(`screenshot ${src} exists`, (await get(src)).status === 200)

// ---------- 5. The ? on every app page ----------
let cookie = ''
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const data = await res.json().catch(() => null)
  assert.ok(res.ok, `${method} ${path}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`)
  return data
}
await api('/api/auth/signup', { method: 'POST', body: { name: 'Hel Probe', email: `help-${run}@probe.test`, password: 'correct horse battery' } })
const studio = await api('/api/studios', { method: 'POST', body: { name: 'Help Probe Studio' } })
const project = await api('/api/projects', { method: 'POST', body: { name: 'Help probe', studio_id: studio.id } })
await api('/api/demo/load', { method: 'POST', body: { set: 'broken-tide' } })
const doc = (await api('/api/documents'))[0]
const entity = (await api('/api/entities'))[0] ?? await api('/api/entities', { method: 'POST', body: { name: 'Mara', kind: 'character' } })
const note = await api('/api/research', { method: 'POST', body: { question: 'How far does Europa orbit from Jupiter, and what is the one-way light delay from Earth to Europa at 628 million km?' } })
const PATHS = {
  'index': '/', 'library': '/library', 'documents-id': `/documents/${doc.id}`, 'documents-id-history': `/documents/${doc.id}/history`,
  'documents-id-script': `/documents/${doc.id}/script`, 'write': '/write', 'review': '/review', 'canon': '/canon', 'entities': '/entities',
  'entities-id': `/entities/${entity.id}`, 'conflicts': '/conflicts', 'changes': '/changes', 'tasks': '/tasks', 'notes': '/notes', 'ask': '/ask',
  'research': '/research', 'research-id': `/research/${note.noteIds?.[0]}`, 'agents-runs': '/agents/runs', 'metrics': '/metrics', 'audit': '/audit',
  'export': '/export', 'settings': '/settings', 'settings-profile': '/settings/profile', 'settings-team': '/settings/team',
  'settings-projects': '/settings/projects', 'settings-projects-id': `/settings/projects/${project.id ?? project.project?.id}`,
  'settings-agents': '/settings/agents', 'onboarding': '/onboarding',
}
// The print view is a bare page for the browser's print dialog: mapped (for the table) but deliberately without a shell.
const NO_BUTTON = ['export-print']
for (const [name, slug] of Object.entries(HELP_ROUTES)) {
  if (!slug || NO_BUTTON.includes(name)) continue
  const path = PATHS[name]
  if (!path) { check(`${name}: has a probe path`, false); continue }
  const res = await get(path, cookie)
  const html = await res.text()
  const tag = html.match(/<a [^>]*aria-label="Help for this page"[^>]*>/)?.[0] ?? ''
  check(`${path} (${name}) has ? → /help/${slug} in a new tab`, res.status === 200 && tag.includes(`href="/help/${slug}"`) && tag.includes('target="_blank"') && tag.includes('rel="noopener"'), `${res.status} ${tag || 'no ? link'}`)
}

console.log(failures ? `\n${failures} failed` : '\nall help checks passed')
process.exit(failures ? 1 : 0)
