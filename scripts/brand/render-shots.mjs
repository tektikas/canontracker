// Product screenshots for the marketing site, taken from the real app with the bundled samples.
//   node scripts/brand/render-shots.mjs <baseUrl> [shot...]
// Against a prod build on localhost with its own .data and the default AI mode (the samples replay their own AI output).
// Creates a throwaway account with four projects (Lantern Row, Broken Tide, Sherlock Holmes, The Ashbell Pass), accepts and
// scans Sherlock Holmes, walks the Ashbell Pass through review, scan, merge and a proposed change, then captures each page
// at 1280×800 in light and dark with the installed headless playwright-cli (session `shots`), and writes public/shots/<name>-<light|dark>-<1280|720>.webp.
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { candidateFingerprint } from '../../shared/utils/review.ts'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
const only = process.argv.slice(3)
if (!base) throw new Error('Usage: node scripts/brand/render-shots.mjs <baseUrl> [shot...]')
const run = Date.now().toString(36)

let cookie = ''
async function api(path, { method = 'GET', body, form } = {}) {
  const send = () => fetch(base + path, { method, headers: form ? { cookie } : { 'content-type': 'application/json', cookie }, body: form ?? (body && JSON.stringify(body)) })
  // A kept-alive socket can time out on the server while a screenshot runs: retry once on a fresh one.
  const res = await send().catch(send)
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`)
  return data
}
const pending = () => api('/api/facts?status=pending')
const canon = () => api('/api/facts?status=canon')
const by = (list, s) => { const f = list.find(x => x.statement === s); if (!f) throw new Error(`not found: ${s}`); return f }
// The server takes at most 500 per request (Sherlock Holmes has over a thousand candidates).
const acceptVerified = async () => {
  const items = (await pending()).map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) }))
  for (let i = 0; i < items.length; i += 500) await api('/api/facts/accept-verified', { method: 'POST', body: { items: items.slice(i, i + 500) } })
}

// ---------- Setup (real API calls, the same ones the UI makes) ----------
await api('/api/auth/signup', { method: 'POST', body: { name: 'Ada Marlow', email: `ada-${run}@shots.test`, password: 'correct horse battery' } })
const studio = await api('/api/studios', { method: 'POST', body: { name: 'Northlight Studio' } })
const project = async (name, set) => {
  const p = await api('/api/projects', { method: 'POST', body: { name, studio_id: studio.id } })
  await api('/api/demo/load', { method: 'POST', body: { set } })
  return p
}

await project('Lantern Row', 'lantern-row')
const lantern = await api('/api/me').then(m => m.current.project.id)
await project('Broken Tide', 'broken-tide')
const brokenTide = await api('/api/me').then(m => m.current.project.id)
const tideSister = (await pending()).find(f => /sister/i.test(f.statement))
// Sherlock Holmes: accept the verified candidates and scan, so Watson's wound (shoulder vs leg) is a conflict.
await project('Sherlock Holmes', 'sherlock-holmes')
const sherlock = await api('/api/me').then(m => m.current.project.id)
await acceptVerified()
await api('/api/conflicts/scan', { method: 'POST' })

await project('The Ashbell Pass', 'ashbell-pass')
const ashbell = await api('/api/me').then(m => m.current.project.id)
const gold = JSON.parse(readFileSync(new URL('../../server/assets/ashbell-pass/gold.json', import.meta.url), 'utf8'))
const docs = await api('/api/documents')
const doc = name => docs.find(d => d.name === name)
const reviewFact = (await pending()).find(f => f.statement === gold.figurative[0])

// Ashbell Pass: reject the figurative candidate, accept the verified ones, scan, settle a few conflicts, merge, propose R1.
await api(`/api/facts/${reviewFact.id}/review`, { method: 'POST', body: { decision: 'reject', rationale: 'Figurative: "sister of the road", no shared blood.' } })
await acceptVerified()
await api('/api/conflicts/scan', { method: 'POST' })
const conflicts = await api('/api/conflicts')
const pair = c => [c.left.statement, c.right.statement].sort().join('|')
const conflict = statements => conflicts.find(c => pair(c) === [...statements].sort().join('|'))
await api(`/api/conflicts/${conflict(gold.false_alarms[0].statements).id}/decision`, { method: 'POST', body: { decision: 'false_positive', rationale: 'The Kettle & Coal stands on the edge of Saltgate.' } })
await api(`/api/conflicts/${conflict(gold.conflicts.find(g => g.id === 'C1').statements).id}/decision`, { method: 'POST', body: { decision: 'confirmed', rationale: 'Rourke cannot be on watch and drinking at once.' } })
const entities = await api('/api/entities')
const ent = name => entities.find(e => e.name === name)
await api(`/api/entities/${ent('Salt Gate').id}/merge`, { method: 'POST', body: { into: ent('Saltgate').id } })
const r1 = by(await canon(), 'Whoever rings the Ashbell loses their voice until the next sunrise.')
const change = await api('/api/changes', { method: 'POST', body: { target_fact_id: r1.id, proposed_statement: gold.after_change[0].rule_statement, rationale: 'Design wants the bell usable mid-quest; a day without a voice breaks the dialogue system.' } })
// Voice: the sample take, linked to the town crier's script.
const take = new FormData()
take.append('file', new Blob([readFileSync(new URL('../../public/samples/harl-crier-take.wav', import.meta.url))]), 'harl-crier-take.wav')
take.append('script_document_id', doc('dlg-town-crier.md').id)
const recording = (await api('/api/recordings', { method: 'POST', form: take })).results[0]
// Ask: one canon question from the gold set.
const conversation = await api('/api/conversations', { method: 'POST', body: { text: 'When did Ysolde break her oath with Corin?', mode: 'canon' } })

// ---------- Shots ----------
// prep runs in the page after load (Playwright code). Each shot is the 1280×800 viewport unless `full` asks for the page.
const scrollTo = locator => `await ${locator}.evaluate(e => window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 16)); await page.waitForTimeout(300);`
const clickTab = name => `await page.getByRole('tab', { name: ${JSON.stringify(name)} }).first().click(); await page.waitForTimeout(900);`
const SHOTS = [
  { name: 'review', path: '/review' },
  { name: 'tide-review', path: `/review?fact=${tideSister.id}`, project: brokenTide },
  { name: 'canon', path: '/canon' },
  { name: 'graph', path: '/canon', prep: clickTab('Graph') },
  { name: 'timeline', path: '/canon', prep: clickTab('Timeline') },
  { name: 'conflicts', path: '/conflicts' },
  { name: 'impact', path: '/changes', prep: scrollTo("page.getByRole('heading', { name: 'Proposals' })") },
  { name: 'entity', path: `/entities/${ent('Saltgate').id}` },
  { name: 'library', path: '/library' },
  { name: 'reader', path: `/documents/${doc('S05-the-watch-at-the-bell-gate.md')?.id ?? docs[4].id}` },
  { name: 'voice', path: `/documents/${recording.document_id}/script` },
  { name: 'ask', path: `/ask?c=${conversation.conversation.id}` },
  { name: 'agent-activity', path: '/agents/runs' },
  { name: 'export', path: '/export' },
  { name: 'team', path: '/settings/team' },
  { name: 'mcp', path: '/settings/agents' },
  { name: 'lantern', path: '/canon', project: 'lantern' },
  // Help pages (/help/<slug>): one shot per screen that the marketing pages don't already show.
  { name: 'home', path: '/' },
  { name: 'history', path: `/documents/${doc('S05-the-watch-at-the-bell-gate.md')?.id ?? docs[4].id}/history` },
  { name: 'write', path: '/write' },
  { name: 'entities', path: '/entities' },
  { name: 'tasks', path: '/tasks' },
  { name: 'notes', path: '/notes' },
  { name: 'research', path: '/research' },
  { name: 'metrics', path: '/metrics' },
  { name: 'audit', path: '/audit' },
  { name: 'settings', path: '/settings' },
  { name: 'projects', path: '/settings/projects' },
  { name: 'profile', path: '/settings/profile' },
  // The pitch deck shows this one card full width: the element alone, at 2× zoom, light only.
  { name: 'watson-card', path: '/conflicts', project: sherlock, zoom: 2, themes: ['light'], widths: [1920, 960], element: "page.locator('article.conflict').filter({ hasText: 'on his shoulder' }).filter({ hasText: 'in his leg' }).first()" },
]

const out = new URL('../../public/shots/', import.meta.url).pathname
mkdirSync(out, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'story-bible-shots-'))
const cli = (...args) => {
  const output = execFileSync('playwright-cli', ['-s=shots', ...args], { encoding: 'utf8' })
  if (output.includes('### Error')) throw new Error(output.slice(0, 600))
}
function setSession() {
  const session = cookie.split('; ').map(c => c.split('=')).find(([k]) => k === 'nuxt-session')?.[1]
  if (!session) throw new Error('no session cookie')
  cli('cookie-set', 'nuxt-session', session, '--domain', new URL(base).hostname, '--path', '/', '--httpOnly')
}
const projectId = p => p === 'lantern' ? lantern : p ?? ashbell

try {
  cli('open', `${base}/login`)
  cli('resize', '1280', '800')
  setSession()
  let current = ashbell
  for (const shot of SHOTS.filter(s => !only.length || only.includes(s.name))) {
    const want = projectId(shot.project)
    // The session cookie carries the current project, so the browser takes the switched cookie.
    if (want !== current) { await api(`/api/projects/${want}/switch`, { method: 'POST' }); setSession(); current = want }
    for (const theme of shot.themes ?? ['light', 'dark']) {
      const png = join(tmp, `${shot.name}-${theme}.png`)
      cli('run-code', `async page => {
        await page.emulateMedia({ colorScheme: '${theme}', reducedMotion: 'reduce' });
        await page.goto(${JSON.stringify(base + shot.path)});
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        ${shot.prep ?? ''}
        await page.mouse.move(0, 799);
        await page.waitForTimeout(400);
        ${shot.zoom ? `await page.setViewportSize({ width: ${1280 * shot.zoom}, height: ${800 * shot.zoom} }); await page.evaluate(() => { document.documentElement.style.zoom = '${shot.zoom}' }); await page.waitForTimeout(600);` : ''}
        ${shot.element ? `await ${shot.element}.screenshot({ path: ${JSON.stringify(png)} });` : `await page.screenshot({ path: ${JSON.stringify(png)}, fullPage: ${!!shot.full} });`}
        ${shot.zoom ? 'await page.setViewportSize({ width: 1280, height: 800 });' : ''}
      }`)
      for (const w of shot.widths ?? [1280, 720]) {
        execFileSync('magick', [png, '-resize', `${w}x`, '-strip', '-quality', '78', '-define', 'webp:method=6', join(out, `${shot.name}-${theme}-${w}.webp`)])
      }
      console.log(`${shot.name} (${theme}): written`)
    }
  }
}
finally {
  if (cookie) await api(`/api/projects/${ashbell}/switch`, { method: 'POST' }).catch(() => {})
  try { cli('close') } catch {}
  rmSync(tmp, { recursive: true, force: true })
}
