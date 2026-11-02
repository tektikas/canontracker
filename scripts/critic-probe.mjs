// AI critic probe against a running server in recorded mode (MODEL_MODE=mock): node scripts/critic-probe.mjs [baseUrl]
// - cleanOpinions drops model output that doesn't hold together (offline asserts).
// - Broken Tide and The Ashbell Pass show their recorded opinions after a load: the figurative "sisters" candidates → reject
//   (figurative); a blocked candidate (quote not in the source) never gets an opinion, even when asked for directly.
// - Asking the Critic writes opinions and a model_calls row only: no fact, status or audit decision changes. Viewers get 403.
// - An opinion on an older form of a candidate (its source renamed since) is shown as not current and is no "keep".
// - "Accept all the AI critic keeps" (accept-verified with critic: true) is fingerprint-bound: a fingerprint without the
//   opinion, or a newer opinion since the sheet opened, refuses the lot (409, nothing accepted); a candidate the Critic doesn't
//   keep is skipped (critic_not_keep); the accepted ones carry the opinion id in their audit events.
import assert from 'node:assert/strict'
import { candidateFingerprint, cleanOpinions } from '../shared/utils/review.ts'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual).slice(0, 80)})`) }

// Offline: what survives cleaning.
const canonFor = new Map([['f1', new Set(['c1'])], ['f2', new Set()], ['f3', new Set()], ['f4', new Set()]])
const sug = { statement: 'Ves is at Saltgate on Day 3.', subject: 'Ves', predicate: 'located_at', object: 'Saltgate' }
const cleaned = cleanOpinions([
  { id: 'f1', verdict: 'reject', reason: 'duplicate', duplicate_of: 'c1', explanation: 'Same as canon.' },
  { id: 'f1', verdict: 'keep', reason: 'ok', explanation: 'Second opinion on the same id.' },
  { id: 'f2', verdict: 'reject', reason: 'duplicate', duplicate_of: 'c9', explanation: 'Invented canon id.' },
  { id: 'f3', verdict: 'needs_edit', reason: 'ambiguous_time_place', explanation: 'No suggestion.' },
  { id: 'f4', verdict: 'keep', reason: 'figurative', explanation: 'Keep with a reject reason.' },
  { id: 'f4', verdict: 'toString', reason: 'ok', explanation: 'Not a verdict.' },
  { id: 'nope', verdict: 'keep', reason: 'ok', explanation: 'Not asked.' },
  { id: 'f3', verdict: 'needs_edit', reason: 'ambiguous_time_place', explanation: '  Time is   only "afternoon". ', suggestion: { ...sug, quote: 'never kept' } },
], canonFor)
check('clean: only coherent opinions on asked candidates survive', cleaned.kept.map(o => [o.fact_id, o.verdict, o.reason, o.duplicate_of]), [['f1', 'reject', 'duplicate', 'c1'], ['f3', 'needs_edit', 'ambiguous_time_place', null]])
check('clean: dropped count', cleaned.dropped, 6)
check('clean: a suggestion has no quote; text is trimmed', [cleaned.kept[1].suggestion, cleaned.kept[1].explanation], [sug, 'Time is only "afternoon".'])
check('clean: not an array → nothing', cleanOpinions({ opinions: 'x' }, canonFor), { kept: [], dropped: 0 })

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
async function account(name, project) {
  const c = client()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  if (project) {
    const studio = (await c('/api/studios', { method: 'POST', body: { name: `${name} Studio` } })).data
    await c('/api/projects', { method: 'POST', body: { name: project, studio_id: studio.id } })
  }
  return c
}
const verified = f => f.evidence.some(e => e.verified)
const a = await account('Cleo', 'Critic Probe')
const pending = async () => (await a('/api/facts?status=pending')).data
// Everything a person decides on: the facts as stored, in every status.
const factState = async () => (await Promise.all(['pending', 'canon', 'rejected', 'superseded'].map(s => a(`/api/facts?status=${s}`))))
  .flatMap(r => r.data.map(f => [f.id, f.status, f.statement, f.subject, f.predicate, f.object, f.evidence.map(e => [e.id, e.quote, e.verified])]))

// Broken Tide: recorded opinions after the load.
check('Broken Tide loads', (await a('/api/demo/load', { method: 'POST' })).status, 200)
let list = await pending()
const sister = list.find(f => f.statement === 'Mara and Leya are sisters.')
const blocked = list.find(f => !verified(f))
check('the figurative "sisters" candidate: reject, figurative', [sister.critic?.verdict, sister.critic?.reason, sister.critic?.current], ['reject', 'figurative', true])
check('the blocked candidate (quote not in the source) has no opinion', blocked.critic, null)
check('every verified candidate has a recorded opinion', list.filter(verified).every(f => f.critic), true)
const calls = (await a('/api/model-calls')).data.filter(c => c.purpose === 'critic')
check('critic calls are in model_calls with the prompt version', calls.length > 0 && calls.every(c => c.prompt_version === 'critic-v1' && c.status === 'ok'), true)

// Asking changes no fact.
const factsBefore = await factState()
const statsBefore = (await a('/api/stats')).data
const auditBefore = (await a('/api/audit')).data.length
const callsBefore = (await a('/api/model-calls')).data.length
const asked = await a('/api/facts/critic', { method: 'POST', body: { ids: list.map(f => f.id) } })
check('ask the Critic on the whole queue', [asked.status, asked.data.asked, asked.data.unverified], [200, list.filter(verified).length, list.length - list.filter(verified).length])
check('asking writes no fact change', await factState(), factsBefore)
check('asking changes no counts', (await a('/api/stats')).data, statsBefore)
check('asking writes no audit decision', (await a('/api/audit')).data.length, auditBefore)
check('asking is traced in model_calls', (await a('/api/model-calls')).data.length > callsBefore, true)
const direct = await a('/api/facts/critic', { method: 'POST', body: { ids: [blocked.id] } })
check('asked directly about the blocked candidate: not sent, no opinion', [direct.data.asked, direct.data.opinions, direct.data.unverified], [0, 0, 1])
check('… and still no opinion', (await pending()).find(f => f.id === blocked.id).critic, null)
check('no ids: 400', (await a('/api/facts/critic', { method: 'POST', body: {} })).status, 400)
check('ids not strings: 400', (await a('/api/facts/critic', { method: 'POST', body: { ids: [1] } })).status, 400)

// A viewer can read the opinions but not ask.
const link = (await a('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 1 } })).data
const v = await account('Vera')
await v(`/api/invites/${link.token}/accept`, { method: 'POST' })
await v(`/api/projects/${(await a('/api/me')).data.current.project.id}/switch`, { method: 'POST' })
check('viewer sees the opinions', (await v('/api/facts?status=pending')).data.find(f => f.id === sister.id).critic.verdict, 'reject')
check('viewer: ask 403', (await v('/api/facts/critic', { method: 'POST', body: { ids: [sister.id] } })).status, 403)

// An opinion on an older form of the candidate: rename its source document, so what the Critic read no longer matches.
list = await pending()
const keeps = list.filter(f => verified(f) && f.critic?.verdict === 'keep' && f.critic.current)
assert.ok(keeps.length >= 3, 'the recorded run keeps several candidates')
const renamedDoc = keeps[0].evidence.find(e => e.verified).document_id
check('rename a source document', (await a('/api/library/organise', { method: 'POST', body: { document_ids: [renamedDoc], title: `Renamed ${run}` } })).status, 200)
list = await pending()
const old = list.filter(f => f.evidence.some(e => e.document_id === renamedDoc) && f.critic)
check('its candidates\' opinions are no longer current', old.length > 0 && old.every(f => !f.critic.current), true)
const keepsNow = () => list.filter(f => verified(f) && f.critic?.verdict === 'keep' && f.critic.current)
check('… and are not counted as keeps', keepsNow().some(f => old.includes(f)), false)
const reasked = await a('/api/facts/critic', { method: 'POST', body: { ids: old.map(f => f.id) } })
check('asking again gives current opinions', reasked.data.opinions, old.filter(verified).length)
list = await pending()

// Bulk "Accept all the AI critic keeps".
const bulk = (facts, critic = true, fp = f => candidateFingerprint(f, critic)) => a('/api/facts/accept-verified', { method: 'POST', body: { items: facts.map(f => ({ id: f.id, fingerprint: fp(f) })), ...(critic && { critic: true }) } })
const shown = keepsNow()
const canonBefore = (await a('/api/stats')).data.canon
check('critic mode with fingerprints that leave out the opinion: 409', (await bulk(shown, true, f => candidateFingerprint(f))).status, 409)
// The sheet is open; meanwhile someone asks the Critic again about one of them (a new opinion row).
await a('/api/facts/critic', { method: 'POST', body: { ids: [shown[1].id] } })
const refused = await bulk(shown)
check('a newer opinion since the sheet opened: 409, named', [refused.status, refused.data.data?.changed], [409, [shown[1].id]])
check('… nothing accepted', (await a('/api/stats')).data.canon, canonBefore)
list = await pending()
const sisterNow = list.find(f => f.id === sister.id)
const sheet = [...keepsNow(), sisterNow]
const done = await bulk(sheet)
check('accept the keeps: all keeps accepted', [done.status, done.data.accepted.sort()], [200, keepsNow().map(f => f.id).sort()])
check('the Critic\'s reject is skipped, not accepted', done.data.skipped, [{ id: sister.id, reason: 'critic_not_keep' }])
check('the "sisters" candidate is still pending (a person decides)', (await pending()).some(f => f.id === sister.id), true)
check('canon grew by the keeps only', (await a('/api/stats')).data.canon, canonBefore + keepsNow().length)
const events = (await a('/api/audit')).data
const summary = events.find(e => e.event_type === 'candidate.bulk_accepted')
check('summary event says via critic_keeps', [summary.detail.via, summary.detail.accepted.length], ['critic_keeps', keepsNow().length])
const accEvents = events.filter(e => e.event_type === 'candidate.accepted' && e.detail.bulk === summary.detail.batch)
check('each accepted candidate names the opinion it was kept by', accEvents.length === keepsNow().length && accEvents.every(e => e.detail.critic_opinion_id === keepsNow().find(f => f.id === e.target_id).critic.id), true)
check('sending the same list again accepts nothing new', (await bulk(keepsNow())).data.accepted, [])

// The Ashbell Pass: its own recorded opinions.
check('Ashbell Pass loads', (await a('/api/demo/load', { method: 'POST', body: { set: 'ashbell-pass' } })).status, 200)
list = await pending()
const tamsin = list.find(f => f.statement === 'Tamsin and Ves are sisters.')
check('"Tamsin and Ves are sisters": reject, figurative', [tamsin.critic?.verdict, tamsin.critic?.reason], ['reject', 'figurative'])
const odo = list.find(f => f.statement === 'Odo buries the Bronze Clapper under the third lamp on Kiln Street.')
check('the S09 invented quote is blocked and has no opinion', [verified(odo), odo.critic], [false, null])
check('no blocked candidate has an opinion', list.filter(f => !verified(f)).every(f => !f.critic), true)
console.log('\ncritic probe: all checks passed')
