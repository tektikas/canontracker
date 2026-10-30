// Studio isolation + role probe against a running dev server: node scripts/isolation-probe.mjs [baseUrl]
// Creates throwaway accounts (unique emails per run) and asserts that one studio can't read or write another's data.
import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)

function client() {
  let cookie = ''
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
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

const b = await account('Bo')
check('B with no project is refused content', (await b('/api/facts?status=pending')).status, 409)
const studioB = (await b('/api/studios', { method: 'POST', body: { name: 'Other Studio' } })).data
await b('/api/projects', { method: 'POST', body: { name: 'Other Game', studio_id: studioB.id } })
check('B sees none of A’s candidates', (await b('/api/facts?status=pending')).data.length, 0)
check('B gets 404 reviewing A’s fact', (await b(`/api/facts/${factA.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 404)
check('B gets 404 reading A’s document', (await b(`/api/documents/${docA.id}`)).status, 404)
const projA = (await a('/api/me')).data.current.project.id
check('B gets 404 switching into A’s project', (await b(`/api/projects/${projA}/switch`, { method: 'POST' })).status, 404)
check('Signed-out caller gets 401', (await client()('/api/stats')).status, 401)

const viewerLink = (await a('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 7 } })).data
const v = await account('Vee')
check('Viewer accepts invite', (await v(`/api/invites/${viewerLink.token}/accept`, { method: 'POST' })).status, 200)
check('Viewer can read canon', (await v('/api/facts?status=pending')).status, 200)
check('Viewer can ask', (await v('/api/qa', { method: 'POST', body: { question: 'Where is Mira?' } })).status, 200)
check('Viewer gets 403 on accept', (await v(`/api/facts/${factA.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 403)
check('Used invite link is refused', (await b(`/api/invites/${viewerLink.token}/accept`, { method: 'POST' })).status, 410)

const editorLink = (await a('/api/team/invites', { method: 'POST', body: { role: 'editor', days: 1 } })).data
const e = await account('Eli')
await e(`/api/invites/${editorLink.token}/accept`, { method: 'POST' })
const verified = (await e('/api/facts?status=pending')).data.find(f => f.evidence.some(x => x.verified))
check('Editor can accept a candidate', (await e(`/api/facts/${verified.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 200)
const audit = (await a('/api/audit')).data
check('Audit names the editor', audit.find(x => x.event_type === 'candidate.accepted')?.actor_name, 'Eli')
check('Editor gets 403 inviting', (await e('/api/team/invites', { method: 'POST', body: { role: 'viewer' } })).status, 403)

const me = (await a('/api/me')).data.user.id
check('Last owner cannot step down', (await a(`/api/team/${me}`, { method: 'PATCH', body: { role: 'admin' } })).status, 409)
console.log('all checks passed')
