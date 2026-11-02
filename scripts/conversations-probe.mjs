// Conversations probe against a running server: node scripts/conversations-probe.mjs <baseUrl>
// Ask as shared team conversations on the Ashbell Pass demo (accepted): two members post in one conversation and each sees
// the other's messages (and the cheap ?since= poll notices), a follow-up question ("where was she at dusk?") answered by a
// teammate continues the same turn, the page's entity fills in "he", an unsupported question stays "unknown", research
// answers are labelled and never touch canon, viewers can post but not rename, another studio gets 404, a removed member's
// messages keep their name, and bad bodies are 400. Creates throwaway accounts (unique emails per run).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { candidateFingerprint } from '../shared/utils/review.ts'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
const ok = (label, extra = '') => console.log(`ok  ${label}${extra ? ` (${extra})` : ''}`)
const gold = JSON.parse(readFileSync(new URL('../server/assets/ashbell-pass/gold.json', import.meta.url), 'utf8'))

function web() {
  let cookie = ''
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data; try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
}
async function account(name) {
  const c = web()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  return c
}
async function join(c, owner, role, projectId) {
  const invite = (await owner('/api/team/invites', { method: 'POST', body: { role, days: 7 } })).data
  assert.equal((await c(`/api/invites/${invite.token}/accept`, { method: 'POST' })).status, 200)
  await c(`/api/projects/${projectId}/switch`, { method: 'POST' })
  return (await c('/api/me')).data.user.id
}
const reply = msgs => msgs.at(-1).parts[0]

// Ada owns the Ashbell Pass demo, every candidate accepted. Bo is an editor, Vi a viewer, Cy has her own studio.
const ada = await account('Ada')
const studio = (await ada('/api/studios', { method: 'POST', body: { name: 'Conversation Studio' } })).data
const project = (await ada('/api/projects', { method: 'POST', body: { name: 'The Ashbell Pass', studio_id: studio.id } })).data
assert.equal((await ada('/api/demo/load', { method: 'POST', body: { set: 'ashbell-pass' } })).status, 200)
const pending = (await ada('/api/facts?status=pending')).data
assert.equal((await ada('/api/facts/accept-verified', { method: 'POST', body: { items: pending.map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) })) } })).status, 200)
const canonCount = async () => (await ada('/api/facts?status=canon')).data.length
const canonBefore = await canonCount()
const bo = await account('Bo')
const boId = await join(bo, ada, 'editor', project.id)
const vi = await account('Vi')
await join(vi, ada, 'viewer', project.id)
const cy = await account('Cy')
const cyStudio = (await cy('/api/studios', { method: 'POST', body: { name: 'Elsewhere' } })).data
await cy('/api/projects', { method: 'POST', body: { name: 'Other', studio_id: cyStudio.id } })
ok('setup', `${canonBefore} canon facts; Ada owner, Bo editor, Vi viewer, Cy elsewhere`)

// --- Ada starts a conversation; the title is her first question.
const q1 = 'Who stands watch at the Bell Gate on Day 2?'
const started = await ada('/api/conversations', { method: 'POST', body: { text: q1 } })
assert.equal(started.status, 200, JSON.stringify(started.data).slice(0, 300))
const conv = started.data.conversation
assert.equal(conv.title, q1)
assert.equal(conv.mode, 'canon')
assert.equal(started.data.messages.length, 2)
const a1 = reply(started.data.messages)
assert.equal(a1.type, 'canon')
assert.ok(['supported', 'source_only'].includes(a1.status) && a1.cited.length && a1.cited.every(f => f.status === 'canon' && f.evidence.some(e => e.verified)), `grounded: ${JSON.stringify(a1).slice(0, 300)}`)
ok('a new conversation is titled from its first question; the answer cites accepted canon', `${a1.status}, ${a1.cited.length} facts`)

// --- Bo sees it, polls, and posts in the same conversation.
const list = (await bo('/api/conversations')).data
const row = list.find(c => c.id === conv.id)
assert.ok(row && row.created_by_name === 'Ada' && row.questions === 1, JSON.stringify(row))
const seen = (await bo(`/api/conversations/${conv.id}`)).data
assert.equal((await bo(`/api/conversations/${conv.id}?since=${encodeURIComponent(seen.conversation.updated_at)}`)).data.unchanged, true)
const boPost = await bo(`/api/conversations/${conv.id}/messages`, { method: 'POST', body: { text: 'Who rings the Ashbell at dusk?' } })
assert.equal(boPost.status, 200, JSON.stringify(boPost.data).slice(0, 300))
const polled = (await ada(`/api/conversations/${conv.id}?since=${encodeURIComponent(seen.conversation.updated_at)}`)).data
assert.ok(!polled.unchanged && polled.messages.length === 4, 'the poll returns the new messages')
assert.deepEqual(polled.messages.map(m => `${m.role}:${m.author.name}`), ['user:Ada', 'assistant:Ada', 'user:Bo', 'assistant:Bo'])
assert.equal(polled.conversation.updated_by_name, 'Bo')
assert.equal((await ada('/api/conversations')).data.find(c => c.id === conv.id).people, 'Ada, Bo')
ok('a teammate sees the conversation and posts in it; ?since= polling notices; each message keeps its author')

// --- Follow-up: a pronoun with several people in matching canon gets a question back; Bo's answer continues Ada's turn.
const dusk = (await ada('/api/conversations', { method: 'POST', body: { text: 'Where was she at dusk?' } })).data
const fu = reply(dusk.messages)
assert.equal(fu.type, 'followup', JSON.stringify(fu).slice(0, 300))
assert.ok(fu.options.length >= 2 && fu.question.includes('she'), JSON.stringify(fu))
const pick = fu.options[0]
const cont = (await bo(`/api/conversations/${dusk.conversation.id}/messages`, { method: 'POST', body: { text: pick } })).data.messages
assert.equal(cont[0].reply_to, dusk.messages[1].id, 'the reply continues the follow-up')
const answered = reply(cont)
assert.equal(answered.type, 'canon')
assert.ok(answered.asked_as.includes(pick) && answered.asked_as.includes('dusk'), answered.asked_as)
ok('follow-up: ambiguous "she" asks back with options; a teammate\'s reply continues the turn', `${fu.options.join(' / ')} -> "${answered.asked_as}" ${answered.status}`)

// --- The page's entity fills in the pronoun: no follow-up, asked about that person.
const corin = (await ada('/api/entities')).data.find(e => e.name === 'Corin')
assert.ok(corin, 'Corin has a page')
const paged = (await ada(`/api/conversations/${dusk.conversation.id}/messages`, { method: 'POST', body: { text: 'Where was he at dusk?', context: [{ type: 'entity', id: corin.id, label: 'not this label' }] } })).data.messages
assert.deepEqual(paged[0].context, [{ type: 'entity', id: corin.id, label: 'Corin' }], 'labels come from the database')
assert.equal(reply(paged).type, 'canon')
assert.match(reply(paged).asked_as, /Corin/)
ok('the page\'s entity resolves "he"; context labels are the server\'s', reply(paged).asked_as)

// --- Unknown stays unknown.
const unk = (await ada(`/api/conversations/${conv.id}/messages`, { method: 'POST', body: { text: gold.unknown_questions[0] } })).data.messages
assert.deepEqual([reply(unk).type, reply(unk).status, reply(unk).fact_ids.length], ['canon', 'unknown', 0])
ok('no evidence -> unknown, nothing cited', gold.unknown_questions[0])

// --- Research: labelled as research (or a follow-up), never canon.
const res = (await bo(`/api/conversations/${conv.id}/messages`, { method: 'POST', body: { text: 'How far can a horse walk in a day on a mountain road?', mode: 'research' } })).data.messages
assert.equal(res[1].mode, 'research')
assert.ok(['research', 'followup'].includes(reply(res).type), JSON.stringify(reply(res)))
assert.equal((await ada(`/api/conversations/${conv.id}`)).data.conversation.mode, 'research', 'the switch follows the last message')
assert.equal(await canonCount(), canonBefore, 'research never touches canon')
ok('research answers are their own kind and leave canon alone', reply(res).type)

// --- Viewer: reads and posts; renaming is editor+.
assert.ok((await vi('/api/conversations')).data.some(c => c.id === conv.id))
assert.equal((await vi(`/api/conversations/${conv.id}/messages`, { method: 'POST', body: { text: 'Who rings the Ashbell?' } })).status, 200)
const viStarted = await vi('/api/conversations', { method: 'POST', body: { text: 'What is Corin\'s oath?' } })
assert.equal(viStarted.status, 200)
assert.equal((await vi(`/api/conversations/${conv.id}`, { method: 'PATCH', body: { title: 'Viewer rename' } })).status, 403)
const renamed = await bo(`/api/conversations/${conv.id}`, { method: 'PATCH', body: { title: '  Bell Gate watch  ' } })
assert.deepEqual([renamed.status, renamed.data.title], [200, 'Bell Gate watch'])
const afterRename = (await ada(`/api/conversations/${conv.id}?since=${encodeURIComponent(polled.conversation.updated_at)}`)).data
assert.ok(!afterRename.unchanged && afterRename.conversation.title === 'Bell Gate watch', 'a rename reaches pollers')
assert.ok((await ada('/api/audit')).data.some(e => e.event_type === 'conversation.renamed' && e.target_id === conv.id))
ok('viewer reads, starts and posts; rename is editor+ and audited')

// --- Another studio: nothing.
assert.equal((await cy(`/api/conversations/${conv.id}`)).status, 404)
assert.equal((await cy(`/api/conversations/${conv.id}/messages`, { method: 'POST', body: { text: 'Hello?' } })).status, 404)
assert.equal((await cy(`/api/conversations/${conv.id}`, { method: 'PATCH', body: { title: 'x' } })).status, 404)
assert.ok(!(await cy('/api/conversations')).data.some(c => c.id === conv.id))
// Ids from another project in context are dropped, never resolved.
const cyConv = (await cy('/api/conversations', { method: 'POST', body: { text: 'Anything here?', context: [{ type: 'entity', id: corin.id }] } })).data
assert.deepEqual(cyConv.messages[0].context, [])
ok('another studio: 404 for reads and writes, absent from its list; foreign context ids dropped')

// --- Search.
assert.ok((await ada('/api/conversations?q=dusk')).data.some(c => c.id === dusk.conversation.id))
assert.ok(!(await ada('/api/conversations?q=zzqx-nothing')).data.length)
ok('search matches titles and message text')

// --- Bad bodies.
for (const [body, code] of [[{}, 400], [{ text: '   ' }, 400], [{ text: 'x', mode: 'creative' }, 400], [{ text: 'x', context: 'page' }, 400], [{ text: 'x'.repeat(2001) }, 400], [[], 400]])
  assert.equal((await ada(`/api/conversations/${conv.id}/messages`, { method: 'POST', body })).status, code, JSON.stringify(body).slice(0, 60))
assert.equal((await ada('/api/conversations/cnv_nope/messages', { method: 'POST', body: { text: 'x' } })).status, 404)
ok('bad bodies are 400, unknown conversation 404')

// --- A removed member's messages keep their name.
assert.equal((await ada(`/api/team/${boId}`, { method: 'DELETE' })).status, 200)
const after = (await ada(`/api/conversations/${conv.id}`)).data.messages
assert.ok(after.some(m => m.author.name === 'Bo'))
assert.equal((await bo('/api/conversations')).status, 409, 'Bo has no project here any more')
ok('removed member: messages keep their name; they lose access')

console.log('\nconversations probe passed')
