// Studio isolation + role probe against a running dev server: node scripts/isolation-probe.mjs [baseUrl] [dataDir]
// Creates throwaway accounts (unique emails per run) and asserts that one studio can't read or write another's data.
// With dataDir (the server's .data folder, read only) the image checks also look at stored rows and files.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const base = process.argv[2] ?? 'http://localhost:3000'
const dataDir = process.argv[3]
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

// Generated images need the live image model. Against a mock-mode server the route must refuse plainly (409); run the
// probe against a server pointed at scripts/image-stub.mjs to cover the cross-studio image checks.
const gen = await a('/api/images', { method: 'POST', body: { target_type: 'entity', target_id: entA.id, prompt: 'Probe portrait', style: 'none', n: 1 } })
const imgA = gen.status === 200 ? gen.data[0] : null
if (imgA) {
  check('A generates an image', gen.status, 200)
  check('A reads own generated image', (await a(`/api/images/${imgA.id}`)).status, 200)
  check('A applies it as portrait', (await a(`/api/images/${imgA.id}/apply`, { method: 'POST' })).status, 200)

  // Limits on what the image model sends back (prompt markers handled by scripts/image-stub.mjs).
  const genFor = (id, prompt, n = 1) => a('/api/images', { method: 'POST', body: { target_type: 'entity', target_id: id, prompt, style: 'none', n } })
  const many = await genFor(entA.id, 'stub:many')
  check('n=1 with 6 returned keeps 1', `${many.status} ${many.data.length}`, '200 1')
  check('model call says the extra images were not kept', /^1 image \(Muse Image returned 5 more/.test((await a('/api/model-calls')).data[0].output_summary), true)
  for (const [marker, label, pattern] of [['stub:loopback', 'loopback image URL refused', /private network/], ['stub:redirect', 'redirect to loopback refused', /private network/],
    ['stub:big', 'oversize API body refused', /larger than/], ['stub:junk', 'non-image payload refused', /not a PNG/]]) {
    const r = await genFor(entA.id, marker)
    check(label, r.status === 502 && pattern.test(r.data.message), true)
  }
  // The page is deleted while its image is being made: nothing may be saved for it.
  const projAId = (await a('/api/me')).data.current.project.id
  const files = () => (dataDir && existsSync(join(dataDir, 'portraits', projAId)) ? readdirSync(join(dataDir, 'portraits', projAId)).length : null)
  const gone = (await a('/api/entities', { method: 'POST', body: { name: 'Probe Vanishing', kind: 'character' } })).data
  const before = files()
  const pending = genFor(gone.id, 'stub:slow')
  await new Promise(r => setTimeout(r, 1500))
  check('page deleted during generation', (await a(`/api/entities/${gone.id}`, { method: 'DELETE' })).status, 200)
  const late = await pending
  check('generation for a deleted page is refused', `${late.status} ${late.data.statusMessage}`, '409 TARGET_GONE')
  check('no image.generated audit for the deleted page', (await a('/api/audit')).data.some(x => x.event_type === 'image.generated' && x.target_id === gone.id), false)
  if (dataDir) {
    const db = new DatabaseSync(join(dataDir, 'storybible.db'), { readOnly: true })
    check('no image row for the deleted page', db.prepare('select count(*) n from images where target_id = ?').get(gone.id).n, 0)
    db.close()
    check('no image file left behind', files(), before)
  }
} else {
  check('Mock-mode server refuses generation', `${gen.status} ${gen.data.statusMessage}`, '409 IMAGE_MODEL_OFFLINE')
  console.log('note: cross-studio generated-image checks need a server on the image stub (see scripts/image-stub.mjs)')
}

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
check('B gets 404 listing A’s entity images', (await b(`/api/images?target_type=entity&target_id=${entA.id}`)).status, 404)
check('B gets 404 generating for A’s entity', (await b('/api/images', { method: 'POST', body: { target_type: 'entity', target_id: entA.id, prompt: 'x', n: 1 } })).status, 404)
if (imgA) {
  check('B gets 404 on A’s generated image', (await b(`/api/images/${imgA.id}`)).status, 404)
  check('B gets 404 applying A’s generated image', (await b(`/api/images/${imgA.id}/apply`, { method: 'POST' })).status, 404)
  check('B gets 404 discarding A’s generated image', (await b(`/api/images/${imgA.id}`, { method: 'DELETE' })).status, 404)
}
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
check('Viewer gets 403 on generate', (await v('/api/images', { method: 'POST', body: { target_type: 'entity', target_id: entA.id, prompt: 'x', n: 1 } })).status, 403)
check('Viewer can list images', (await v(`/api/images?target_type=entity&target_id=${entA.id}`)).status, 200)
if (imgA) {
  check('Viewer can see a generated image', (await v(`/api/images/${imgA.id}`)).status, 200)
  check('Viewer gets 403 applying an image', (await v(`/api/images/${imgA.id}/apply`, { method: 'POST' })).status, 403)
}
check('Viewer gets 403 on impact re-run', (await v('/api/changes/chg_x/analyze', { method: 'POST' })).status, 403)
check('Used invite link is refused', (await b(`/api/invites/${viewerLink.token}/accept`, { method: 'POST' })).status, 410)

const editorLink = (await a('/api/team/invites', { method: 'POST', body: { role: 'editor', days: 1 } })).data
const e = await account('Eli')
await e(`/api/invites/${editorLink.token}/accept`, { method: 'POST' })
const verified = (await e('/api/facts?status=pending')).data.find(f => f.evidence.some(x => x.verified))
check('Editor can accept a candidate', (await e(`/api/facts/${verified.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 200)
// Generated images follow a merged page; the preview (a rolled-back merge) moves nothing.
const dupImg = imgA && (await a('/api/images', { method: 'POST', body: { target_type: 'entity', target_id: entA2.id, prompt: 'Probe dup', style: 'none', n: 1 } })).data[0]
if (dupImg) {
  await a(`/api/images/${dupImg.id}/apply`, { method: 'POST' })
  check('Merge preview counts the images that move', (await e(`/api/entities/${entA2.id}/merge`, { method: 'POST', body: { into: entA.id, preview: true } })).data.images_moved, 1)
  check('Merge preview leaves the images where they are', (await a(`/api/images?target_type=entity&target_id=${entA2.id}`)).data.images.length, 1)
}
check('Editor merges a duplicate entity', (await e(`/api/entities/${entA2.id}/merge`, { method: 'POST', body: { into: entA.id } })).status, 200)
if (dupImg) {
  const kept = (await a(`/api/images?target_type=entity&target_id=${entA.id}`)).data.images
  check('Merged page’s image moved to the kept page', kept.some(i => i.id === dupImg.id), true)
  check('Kept page still has exactly one applied portrait', kept.filter(i => i.applied).map(i => i.id).join(), imgA.id)
}
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
