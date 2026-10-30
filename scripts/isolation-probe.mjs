// Studio isolation + role probe against a running dev server: node scripts/isolation-probe.mjs [baseUrl]
// Creates throwaway accounts (unique emails per run) and asserts that one studio can't read or write another's data.
import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)

function client() {
  let cookie = ''
  const call = async (path, { method = 'GET', body, form } = {}) => {
    const headers = form ? { cookie } : { 'content-type': 'application/json', cookie }
    const res = await fetch(base + path, { method, headers, body: form ?? (body && JSON.stringify(body)) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
  call.cookie = () => cookie
  call.absorb = (headers) => { const set = headers.map(c => c.split(';')[0]); if (set.length) cookie = set.join('; ') }
  return call
}
async function account(name) {
  const c = client()
  const r = await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })
  assert.equal(r.status, 200, `signup ${name}: ${JSON.stringify(r.data)}`)
  return c
}
const check = (label, actual, expected) => { assert.equal(actual, expected, label); console.log(`ok  ${label} (${actual})`) }

const a = await account('Ada')
const studioA = (await a('/api/studios', { method: 'POST', body: { name: 'Tidewright' } })).data
await a('/api/projects', { method: 'POST', body: { name: 'Broken Tide', studio_id: studioA.id } })
check('A loads demo into own project', (await a('/api/demo/load', { method: 'POST' })).status, 200)
const factA = (await a('/api/facts?status=pending')).data[0]
const docA = (await a('/api/documents')).data[0]
assert.ok(factA && docA, 'A has data')

// Entity wiki: A gets a page with a portrait (a real 1x1 PNG).
const entA = (await a('/api/entities', { method: 'POST', body: { name: 'Probe Keeper', kind: 'character' } })).data
const png = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA6300010000050001A5F645400000000049454E44AE426082', 'hex')
const portraitForm = () => { const f = new FormData(); f.append('file', new Blob([png], { type: 'image/png' }), 'p.png'); return f }
check('A uploads a portrait', (await a(`/api/entities/${entA.id}/portrait`, { method: 'POST', form: portraitForm() })).status, 200)
check('A reads own portrait', (await a(`/api/entities/${entA.id}/portrait`)).status, 200)
const entA2 = (await a('/api/entities', { method: 'POST', body: { name: 'Probe Keeper Dup', kind: 'character' } })).data

const b = await account('Bo')
check('B with no project is refused content', (await b('/api/facts?status=pending')).status, 409)
const studioB = (await b('/api/studios', { method: 'POST', body: { name: 'Other Studio' } })).data
await b('/api/projects', { method: 'POST', body: { name: 'Other Game', studio_id: studioB.id } })
check('B sees none of A’s candidates', (await b('/api/facts?status=pending')).data.length, 0)
check('B gets 404 reviewing A’s fact', (await b(`/api/facts/${factA.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 404)
check('B gets 404 reading A’s document', (await b(`/api/documents/${docA.id}`)).status, 404)
check('B gets 404 on A’s entity', (await b(`/api/entities/${entA.id}`)).status, 404)
check('B gets 404 on A’s portrait', (await b(`/api/entities/${entA.id}/portrait`)).status, 404)
check('B gets 404 editing A’s entity', (await b(`/api/entities/${entA.id}`, { method: 'PATCH', body: { summary: 'x' } })).status, 404)
check('B gets 404 merging into A’s entity', (await b(`/api/entities/${entA2.id}/merge`, { method: 'POST', body: { into: entA.id } })).status, 404)
check('B sees none of A’s entities', (await b('/api/entities')).data.length, 0)
const projA = (await a('/api/me')).data.current.project.id
check('B gets 404 switching into A’s project', (await b(`/api/projects/${projA}/switch`, { method: 'POST' })).status, 404)
check('Signed-out caller gets 401', (await client()('/api/stats')).status, 401)

const viewerLink = (await a('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 7 } })).data
const v = await account('Vee')
check('Viewer accepts invite', (await v(`/api/invites/${viewerLink.token}/accept`, { method: 'POST' })).status, 200)
check('Viewer can read canon', (await v('/api/facts?status=pending')).status, 200)
check('Viewer can ask', (await v('/api/qa', { method: 'POST', body: { question: 'Where is Mira?' } })).status, 200)
check('Viewer gets 403 on accept', (await v(`/api/facts/${factA.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 403)
check('Viewer can read an entity', (await v(`/api/entities/${entA.id}`)).status, 200)
check('Viewer gets 403 on entity edit', (await v(`/api/entities/${entA.id}`, { method: 'PATCH', body: { summary: 'x' } })).status, 403)
check('Viewer gets 403 on entity create', (await v('/api/entities', { method: 'POST', body: { name: 'Nope', kind: 'item' } })).status, 403)
check('Viewer gets 403 on entity merge', (await v(`/api/entities/${entA2.id}/merge`, { method: 'POST', body: { into: entA.id } })).status, 403)
check('Viewer gets 403 on portrait upload', (await v(`/api/entities/${entA.id}/portrait`, { method: 'POST', form: portraitForm() })).status, 403)
check('Viewer gets 403 on entity delete', (await v(`/api/entities/${entA2.id}`, { method: 'DELETE' })).status, 403)
check('Viewer gets 403 on impact re-run', (await v('/api/changes/chg_x/analyze', { method: 'POST' })).status, 403)
check('Used invite link is refused', (await b(`/api/invites/${viewerLink.token}/accept`, { method: 'POST' })).status, 410)

const editorLink = (await a('/api/team/invites', { method: 'POST', body: { role: 'editor', days: 1 } })).data
const e = await account('Eli')
await e(`/api/invites/${editorLink.token}/accept`, { method: 'POST' })
const verified = (await e('/api/facts?status=pending')).data.find(f => f.evidence.some(x => x.verified))
check('Editor can accept a candidate', (await e(`/api/facts/${verified.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 200)
check('Editor merges a duplicate entity', (await e(`/api/entities/${entA2.id}/merge`, { method: 'POST', body: { into: entA.id } })).status, 200)
const audit = (await a('/api/audit')).data
check('Audit names the editor on entity.merged', audit.find(x => x.event_type === 'entity.merged')?.actor_name, 'Eli')
check('Audit names the editor', audit.find(x => x.event_type === 'candidate.accepted')?.actor_name, 'Eli')
check('Editor gets 403 inviting', (await e('/api/team/invites', { method: 'POST', body: { role: 'viewer' } })).status, 403)

const me = (await a('/api/me')).data.user.id
check('Last owner cannot step down', (await a(`/api/team/${me}`, { method: 'PATCH', body: { role: 'admin' } })).status, 409)

// Removed member with another studio to fall back to: the SSR page load re-points the session and forwards the
// cookie, so the next content request lands on a valid project (no 409).
const eStudio = (await e('/api/studios', { method: 'POST', body: { name: 'Eli Games' } })).data
await e('/api/projects', { method: 'POST', body: { name: 'Eli Game', studio_id: eStudio.id } })
await e(`/api/projects/${projA}/switch`, { method: 'POST' })
check('Editor works in A’s project', (await e('/api/facts?status=pending')).status, 200)
check('Admin removes editor', (await a(`/api/team/${(await e('/api/me')).data.user.id}`, { method: 'DELETE' })).status, 200)
check('Stale cookie gets 409 on content', (await e('/api/facts?status=pending')).status, 409)
const page = await fetch(base + '/', { headers: { cookie: e.cookie() } })
check('SSR page for removed member is 200', page.status, 200)
const set = page.headers.getSetCookie()
check('SSR forwards the fallback session cookie', set.some(c => c.startsWith('nuxt-session=')), true)
e.absorb(set)
check('Removed member’s next request lands on a valid project', (await e('/api/facts?status=pending')).status, 200)

// A viewer can leave on their own.
check('Viewer leaves the studio', (await v(`/api/team/${(await v('/api/me')).data.user.id}`, { method: 'DELETE' })).status, 200)
check('Outsider can’t remove an owner', (await b(`/api/team/${me}`, { method: 'DELETE' })).status, 404)

// One invite link, two people accepting at once: exactly one membership.
const raceLink = (await a('/api/team/invites', { method: 'POST', body: { role: 'editor', days: 1 } })).data
const [r1, r2] = [await account('Rae'), await account('Rob')]
const res = await Promise.all([r1, r2].map(c => c(`/api/invites/${raceLink.token}/accept`, { method: 'POST' })))
check('Double accept: exactly one 200', res.filter(r => r.status === 200).length, 1)
const members = (await a('/api/team')).data.members
check('Double accept: one new membership', members.filter(m => /^Ra[e]|^Ro[b]/.test(m.name)).length, 1)
console.log('all checks passed')
