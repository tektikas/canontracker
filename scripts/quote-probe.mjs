// Quote-matching probe against a running server: node scripts/quote-probe.mjs [baseUrl]
// A document full of typography (smart quotes, em/en dashes, …, *italic*, **bold**, a sentence wrapped over lines): a fact added
// from a plain-ASCII typed quote, a note and an MCP proposal all succeed and store the source's exact characters; an absent quote
// and one that runs across two paragraphs are refused; a re-wrapped new version moves the pending proposal and its quote.
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
const ok = (label, extra = '') => console.log(`ok  ${label}${extra ? ` (${extra})` : ''}`)
let cookie = ''
const a = async (path, { method = 'GET', body } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  return { status: res.status, data }
}

assert.equal((await a('/api/auth/signup', { method: 'POST', body: { name: 'Quinn', email: `quinn-${run}@probe.test`, password: 'correct horse' } })).status, 200)
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Quote Studio' } })).data
await a('/api/projects', { method: 'POST', body: { name: 'Typography', studio_id: studio.id } })

const scene = [
  '# The Keeper’s Oath',
  '',
  'Mara said “the tide is ours” — and nobody in Saltmere',
  'argued with her that night.',
  '',
  'The *Lantern* is **never** lit at dusk; the keeper’s rule… holds.',
  '',
  'Days 3–5 pass at sea.',
  '',
  '😀 Arin waits by the harbour; snake_case and 2*3 are written as is.',
  '',
  '2 *3 equals six today.',
  '',
  '*Bright*star shines all night.',
  '',
  '**Arin** waits at sea.',
  '',
  '2 - -3 equals five today.',
  '',
  'The `*never*` flag stays disabled all night.',
].join('\n')
const draft = (await a('/api/drafts', { method: 'POST', body: { title: 'The Keeper’s Oath', kind: 'lore', content: scene } })).data
const saved = (await a(`/api/drafts/${draft.id}/save`, { method: 'POST' })).data
assert.equal(saved.status, 'imported')
const doc = (await a(`/api/documents/${saved.document_id}`)).data
const [, oath, lantern, , emoji, star, bright, bold, dashes, code] = doc.passages
const fact = over => ({ to: 'canon', document_id: doc.id, kind: 'claim', subject: 'Mara', predicate: 'claims', object: 'Tide', ...over })
const evidenceOf = async id => (await a('/api/facts?status=canon')).data.concat((await a('/api/facts?status=pending')).data).find(f => f.id === id).evidence[0]

// Web: plain ASCII typed quote over smart quotes, an em dash and a line break.
const typed = 'Mara said "the tide is ours" - and nobody in Saltmere argued'
const want = 'Mara said “the tide is ours” — and nobody in Saltmere\nargued'
const r1 = await a('/api/facts', { method: 'POST', body: fact({ passage_id: oath.id, quote: typed, statement: 'Mara claims the tide.' }) })
assert.equal(r1.status, 200, JSON.stringify(r1.data))
const ev1 = await evidenceOf(r1.data.id)
assert.equal(ev1.quote, want)
assert.ok(oath.text.includes(ev1.quote) && ev1.verified)
ok('Add fact: ASCII quote over smart quotes, em dash and a line break stores the source characters', JSON.stringify(ev1.quote))

const r2 = await a('/api/facts', { method: 'POST', body: fact({ passage_id: lantern.id, quote: "The Lantern is never lit at dusk; the keeper's rule...", subject: 'Lantern', predicate: 'never_lit', object: null, statement: 'The Lantern is never lit at dusk.' }) })
assert.equal(r2.status, 200, JSON.stringify(r2.data))
assert.equal((await evidenceOf(r2.data.id)).quote, 'The *Lantern* is **never** lit at dusk; the keeper’s rule…')
ok('Add fact: Markdown emphasis, apostrophe and ellipsis', 'The *Lantern* is **never** lit at dusk; the keeper’s rule…')

const r3 = await a('/api/facts', { method: 'POST', body: fact({ passage_id: emoji.id, quote: 'Arin waits by the harbour', subject: 'Arin', predicate: 'waits_at', object: 'Harbour', statement: 'Arin waits by the harbour.' }) })
assert.equal(r3.status, 200, JSON.stringify(r3.data))
assert.equal((await evidenceOf(r3.data.id)).quote, 'Arin waits by the harbour')
ok('Add fact: an emoji before the quote does not shift it', 'Arin waits by the harbour')

const r4 = await a('/api/facts', { method: 'POST', body: fact({ passage_id: bright.id, quote: 'Brightstar shines all night', subject: 'Brightstar', predicate: 'shines', object: null, statement: 'Brightstar shines all night.' }) })
assert.equal(r4.status, 200, JSON.stringify(r4.data))
assert.equal((await evidenceOf(r4.data.id)).quote, '*Bright*star shines all night')
ok('Add fact: a closing * against the next word still pairs', '*Bright*star shines all night')

// A clause quoted the way models quote it: first letter capitalised, full stop added. Only those two characters may differ.
const r6 = await a('/api/facts', { method: 'POST', body: fact({ passage_id: oath.id, quote: 'Nobody in Saltmere argued with her.', subject: 'Saltmere', predicate: 'did_not_argue', object: null, statement: 'Nobody argued.' }) })
assert.equal(r6.status, 200, JSON.stringify(r6.data))
assert.equal((await evidenceOf(r6.data.id)).quote, 'nobody in Saltmere\nargued with her')
ok('Add fact: a capitalised first letter and an added full stop still cite the source', 'nobody in Saltmere\\nargued with her')

// Inside a code span * is literal: typed with its marks it is cited exactly, typed without them it is refused.
const r5 = await a('/api/facts', { method: 'POST', body: fact({ passage_id: code.id, quote: 'The `*never*` flag stays disabled', subject: 'Never flag', predicate: 'stays', object: null, statement: 'The never flag stays disabled.' }) })
assert.equal(r5.status, 200, JSON.stringify(r5.data))
assert.equal((await evidenceOf(r5.data.id)).quote, 'The `*never*` flag stays disabled')
ok('Add fact: * inside a code span is typed as is', 'The `*never*` flag stays disabled')

// Unpaired marks and code-span marks are text, the minimum counts the typed words, and separate dash runs stay separate.
for (const [label, passage, quote] of [['unpaired * typed without it', star, '2 3 equals six today'], ['4-char quote padded by ** marks', bold, 'Arin'], ['two dash runs typed as one', dashes, '2-3 equals five today'], ['code-span * typed without it', code, 'The `never` flag stays disabled all night']]) {
  const r = await a('/api/facts', { method: 'POST', body: fact({ passage_id: passage.id, quote, statement: `Refused ${label}.` }) })
  assert.equal(r.status, 422, `${label}: ${JSON.stringify(r.data)}`)
  ok(`Add fact: ${label} is refused`, r.status)
}

for (const [label, quote] of [['absent quote', 'Mara said the sea is hers'], ['quote across two paragraphs', 'argued with her that night. The Lantern is never lit'], ['snake_case typed without _', 'snakecase and 2*3'], ['2*3 typed without *', 'snake_case and 23 are'], ['a capital inside the quote', 'nobody in Saltmere Argued']]) {
  const r = await a('/api/facts', { method: 'POST', body: fact({ quote, statement: `Refused ${label}.` }) })
  assert.equal(r.status, 422, label)
  ok(`Add fact: ${label} is refused`, r.status)
}

// Note: the selected words are stored as the passage writes them.
const note = (await a('/api/notes', { method: 'POST', body: { document_id: doc.id, passage_id: lantern.id, quote: 'Lantern is never lit', body: 'Check with design.' } })).data
assert.equal(note.quote, '*Lantern* is **never** lit')
ok('note quote keeps the source characters', note.quote)
assert.equal((await a('/api/audit')).data.find(x => x.event_type === 'note.created' && x.target_id === note.id)?.detail.quote, '*Lantern* is **never** lit')
ok('note.created audit stores the source characters too')

// MCP proposal with an ASCII quote.
const tok = (await a('/api/agent-tokens', { method: 'POST', body: { name: 'Quote probe' } })).data
const client = new Client({ name: 'quote-probe', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { authorization: `Bearer ${tok.secret}` } } }))
const propose = async (quote, statement) => {
  const r = await client.callTool({ name: 'sb_propose_candidate', arguments: { document: doc.id, quote, statement, kind: 'claim', subject: 'Days', predicate: 'at_sea' } })
  return { isError: !!r.isError, data: JSON.parse(r.content[0].text) }
}
const good = await propose('Days 3-5 pass at sea', `The crew is at sea days 3 to 5 (${run}).`)
assert.equal(good.isError, false, JSON.stringify(good.data))
const ev2 = await evidenceOf(good.data.fact_id)
assert.equal(ev2.quote, 'Days 3–5 pass at sea')
ok('MCP: ASCII quote over an en dash is accepted and stores the source characters', ev2.quote)
const bad = await propose('Days 3-6 pass at sea', `Absent ${run}.`)
assert.ok(bad.isError && bad.data.error.code === 'QUOTE_NOT_VERBATIM', JSON.stringify(bad.data))
ok('MCP: absent quote refused', bad.data.error.code)
await client.close()

// A new version that re-wraps and retypes the line: the pending proposal moves, its quote becomes v2's exact characters.
const v2 = scene.replace('Days 3–5 pass at sea.', 'Days 3 - 5\npass at sea.')
const draft2 = (await a('/api/drafts', { method: 'POST', body: { document_id: doc.id } })).data
await a(`/api/drafts/${draft2.id}`, { method: 'PUT', body: { content: v2 } })
const saved2 = (await a(`/api/drafts/${draft2.id}/save`, { method: 'POST' })).data
assert.equal(saved2.version, 2, JSON.stringify(saved2))
assert.equal(saved2.evidence_moved, 1, JSON.stringify(saved2))
const ev3 = await evidenceOf(good.data.fact_id)
assert.equal(ev3.quote, 'Days 3 - 5\npass at sea')
assert.equal(ev3.document_version, 2)
ok('new version: pending proposal moved, quote re-read from v2', JSON.stringify(ev3.quote))

// The moved quote still passes the accept gate (raw verbatim re-check).
const acc = await a(`/api/facts/${good.data.fact_id}/review`, { method: 'POST', body: { decision: 'accept', rationale: 'quote probe' } })
assert.equal(acc.status, 200, JSON.stringify(acc.data))
ok('accept re-checks the stored quote verbatim and passes')
console.log('quote probe passed')
