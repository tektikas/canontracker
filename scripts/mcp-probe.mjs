// MCP probe against a running dev server: node scripts/mcp-probe.mjs [baseUrl]
// Drives the real /mcp endpoint with the official SDK client. Creates throwaway accounts (unique emails per run).
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
const ok = (label, extra = '') => console.log(`ok  ${label}${extra ? ` (${extra})` : ''}`)

function web() {
  let cookie = ''
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data; try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
}
async function account(name) {
  const c = web()
  const r = await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })
  assert.equal(r.status, 200, `signup ${name}`)
  return c
}
async function connect(secret) {
  const client = new Client({ name: 'mcp-probe', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { requestInit: { headers: { authorization: `Bearer ${secret}` } } }))
  return client
}
const call = async (client, name, args = {}) => {
  const r = await client.callTool({ name, arguments: args })
  return { isError: !!r.isError, data: JSON.parse(r.content[0].text) }
}

// Ada owns a studio with the demo data; Bo is a viewer in it; Cy has her own project.
const ada = await account('Ada')
const studio = (await ada('/api/studios', { method: 'POST', body: { name: 'Tidewright' } })).data
await ada('/api/projects', { method: 'POST', body: { name: 'Broken Tide', studio_id: studio.id } })
assert.equal((await ada('/api/demo/load', { method: 'POST' })).status, 200)
// Demo load only creates candidates; Ada accepts the verified ones as a human so there is canon to read.
for (const f of (await ada('/api/facts?status=pending')).data.filter(f => f.evidence.some(e => e.verified)))
  assert.equal((await ada(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'accept', rationale: 'probe setup' } })).status, 200)
const adaTok = (await ada('/api/agent-tokens', { method: 'POST', body: { name: 'Claude Code (Ada)' } })).data
assert.match(adaTok.secret, /^sb_/)
ok('token created, secret shown once')
const list = (await ada('/api/agent-tokens')).data.tokens
assert.ok(list.length === 1 && !JSON.stringify(list).includes(adaTok.secret), 'list never exposes the secret')
ok('token list has prefix only', list[0].prefix)

const bo = await account('Bo')
const invite = (await ada('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 7 } })).data
assert.ok(invite.token, 'invite created')
assert.equal((await bo(`/api/invites/${invite.token}/accept`, { method: 'POST' })).status, 200)
const boProject = (await bo('/api/me')).data.projects[0]
await bo(`/api/projects/${boProject.id}/switch`, { method: 'POST' })
const boTok = (await bo('/api/agent-tokens', { method: 'POST', body: { name: 'Bo reader' } })).data

const cy = await account('Cy')
const cyStudio = (await cy('/api/studios', { method: 'POST', body: { name: 'Other Studio' } })).data
await cy('/api/projects', { method: 'POST', body: { name: 'Elsewhere', studio_id: cyStudio.id } })
const cyTok = (await cy('/api/agent-tokens', { method: 'POST', body: { name: 'Cy agent' } })).data

// 401 without / with a bad token
for (const h of [{}, { authorization: 'Bearer sb_nope' }]) {
  const r = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...h }, body: '{}' })
  assert.equal(r.status, 401)
}
ok('no token / bad token', '401')

const c = await connect(adaTok.secret)
const tools = (await c.listTools()).tools.map(t => t.name).sort()
assert.deepEqual(tools, ['sb_get_context_pack', 'sb_get_fact', 'sb_get_impact', 'sb_list_conflicts', 'sb_list_projects', 'sb_propose_candidate', 'sb_search_facts'])
ok('lists tools', tools.length)
const proj = await call(c, 'sb_list_projects')
assert.equal(proj.data.projects[0].your_role, 'owner')
ok('sb_list_projects', proj.data.projects[0].name)

const pack = await call(c, 'sb_get_context_pack', { topic: 'Arin' })
assert.equal(pack.data.status, 'ok')
const withQuote = pack.data.facts.find(f => f.evidence[0]?.quote)
assert.ok(withQuote && withQuote.evidence[0].file && withQuote.evidence[0].lines, 'quote + source')
ok('context pack has quotes + source ids', `${pack.data.facts.length} facts`)
assert.equal((await call(c, 'sb_get_context_pack', { topic: 'zzzxqv nothing' })).data.status, 'unknown')
ok('unknown when canon has nothing')
assert.equal((await call(c, 'sb_get_fact', { fact_id: withQuote.id })).data.evidence.length > 0, true)
const impact = await call(c, 'sb_get_impact', { fact_id: withQuote.id })
assert.ok(Array.isArray(impact.data.items) && impact.data.scope.max_hops === 2)
ok('sb_get_fact / sb_get_impact', `${impact.data.items.length} impact items`)
assert.ok(Array.isArray((await call(c, 'sb_list_conflicts', { status: 'all' })).data.conflicts))
ok('sb_list_conflicts')

// Propose: verbatim quote -> pending in review; fabricated -> refused, nothing stored.
const docs = (await ada('/api/documents')).data
const lore = docs.find(d => d.kind === 'lore')
const full = (await ada(`/api/documents/${lore.id}`)).data
const text = (full.passages ?? []).find(p => p.text.length > 40)?.text ?? full.content
const quote = text.split('\n')[0].slice(0, 60)
const pendingBefore = (await ada('/api/facts?status=pending')).data.length
const good = await call(c, 'sb_propose_candidate', { document: lore.filename, quote, statement: `Probe fact ${run}`, kind: 'claim', subject: 'Probe', predicate: 'is_probed' })
assert.equal(good.isError, false, JSON.stringify(good.data))
const pending = (await ada('/api/facts?status=pending')).data
assert.equal(pending.length, pendingBefore + 1)
const made = pending.find(f => f.id === good.data.fact_id)
assert.equal(made.status, 'pending'); assert.equal(made.agent_name, 'Claude Code (Ada)'); assert.equal(made.proposed_by_name, 'Ada')
assert.ok(made.evidence[0].verified)
ok('verified proposal is pending with agent + owner', made.id)
assert.equal((await ada('/api/facts?status=canon')).data.some(f => f.id === made.id), false)
const fake = await call(c, 'sb_propose_candidate', { document: lore.filename, quote: 'This sentence was never written anywhere.', statement: `Fake ${run}`, kind: 'claim', subject: 'Fake', predicate: 'x' })
assert.ok(fake.isError && fake.data.error.code === 'QUOTE_NOT_VERBATIM')
assert.equal((await ada('/api/facts?status=pending')).data.length, pendingBefore + 1)
ok('fabricated quote refused, nothing stored')
for (const q of [' \n\t ', 'a', quote.slice(0, 5)]) {
  const blank = await call(c, 'sb_propose_candidate', { document: lore.filename, quote: q, statement: `Blank ${run} ${q.length}`, kind: 'claim', subject: 'Blank', predicate: 'x' })
  assert.ok(blank.isError && blank.data.error.code === 'QUOTE_NOT_VERBATIM', JSON.stringify(blank.data))
}
assert.equal((await ada('/api/facts?status=pending')).data.length, pendingBefore + 1)
ok('blank / too-short quotes refused, nothing stored')
// Padded quote: stored trimmed and verbatim in its cited passage.
const padded = await call(c, 'sb_propose_candidate', { document: lore.filename, quote: `  \n${quote}\t `, statement: `Padded ${run}`, kind: 'claim', subject: 'Padded', predicate: 'x' })
assert.equal(padded.isError, false, JSON.stringify(padded.data))
const pf = (await ada('/api/facts?status=pending')).data.find(f => f.id === padded.data.fact_id)
assert.equal(pf.evidence[0].quote, quote.trim())
assert.ok(text.includes(pf.evidence[0].quote))
ok('padded quote stored without padding, verbatim in passage')
// Injected bad evidence rows (needs the dev server's DB: cwd/.data/storybible.db or argv[3]) -> accept 422.
const db = new DatabaseSync(process.argv[3] ?? '.data/storybible.db')
for (const bad of [` ${quote} `, 'never written in this passage at all']) {
  db.prepare('update evidence set quote = ? where fact_id = ?').run(bad, pf.id)
  const r = await ada(`/api/facts/${pf.id}/review`, { method: 'POST', body: { decision: 'accept' } })
  assert.equal(r.status, 422, JSON.stringify(r.data))
}
db.prepare('update evidence set quote = ? where fact_id = ?').run(quote.trim(), pf.id)
db.close()
assert.equal((await ada(`/api/facts/${pf.id}/review`, { method: 'POST', body: { decision: 'accept', rationale: 'probe' } })).status, 200)
ok('injected padded / non-verbatim evidence -> accept 422; restored -> 200')
const pend = await call(c, 'sb_get_fact', { fact_id: made.id })
assert.ok(pend.isError && pend.data.error.code === 'NOT_CANON')
ok('sb_get_fact refuses pending fact')
await c.close()

// Viewer token: reads fine, cannot propose.
const b = await connect(boTok.secret)
assert.equal((await call(b, 'sb_get_context_pack', { topic: 'Arin' })).data.status, 'ok')
const viewerPropose = await call(b, 'sb_propose_candidate', { document: lore.filename, quote, statement: `Viewer ${run}`, kind: 'claim', subject: 'V', predicate: 'x' })
assert.ok(viewerPropose.isError && viewerPropose.data.error.code === 'FORBIDDEN')
ok('viewer token reads, propose refused')
await b.close()

// Another studio's token sees nothing of this project.
const o = await connect(cyTok.secret)
assert.equal((await call(o, 'sb_get_context_pack', { topic: 'Arin' })).data.status, 'unknown')
assert.equal((await call(o, 'sb_get_fact', { fact_id: withQuote.id })).data.error.code, 'NOT_FOUND')
assert.equal((await call(o, 'sb_get_impact', { fact_id: withQuote.id })).data.error.code, 'NOT_FOUND')
assert.equal((await call(o, 'sb_propose_candidate', { document: lore.filename, quote, statement: 'x', kind: 'claim', subject: 'x', predicate: 'x' })).data.error.code, 'DOCUMENT_NOT_FOUND')
ok("other project's token gets nothing")
await o.close()

// Revoked token -> 401.
assert.equal((await ada(`/api/agent-tokens/${adaTok.id}`, { method: 'DELETE' })).status, 200)
const rev = await fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${adaTok.secret}` }, body: '{}' })
assert.equal(rev.status, 401)
ok('revoked token', '401')
const after = (await ada('/api/agent-tokens')).data.tokens[0]
assert.ok(after.revoked_at && after.last_used_at)
ok('last-used and revoked recorded')
console.log('\nmcp probe passed')
