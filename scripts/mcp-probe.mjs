// MCP probe against a running server: node scripts/mcp-probe.mjs <baseUrl> [<server cwd>/.data/storybible.db]
// Drives the real /mcp endpoint with the official SDK client on the Ashbell Pass demo: every tool and prompt, auth (401, revoked),
// roles (viewer reads, cannot propose), scope (another project's token sees nothing), input errors (JSON error codes), the
// size caps (413 body, paging) and the per-token rate limit. Creates throwaway accounts (unique emails per run).
// With the db path it also checks that injected non-verbatim evidence can't be accepted.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { candidateFingerprint } from '../shared/utils/review.ts'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)
const ok = (label, extra = '') => console.log(`ok  ${label}${extra ? ` (${extra})` : ''}`)
const gold = JSON.parse(readFileSync(new URL('../server/assets/ashbell-pass/gold.json', import.meta.url), 'utf8'))
const v2Text = readFileSync(new URL('../server/assets/ashbell-pass/v2/S03-the-kettle-and-coal.md', import.meta.url), 'utf8')

function web() {
  let cookie = ''
  return async (path, { method = 'GET', body, form } = {}) => {
    const res = await fetch(base + path, { method, headers: form ? { cookie } : { 'content-type': 'application/json', cookie }, body: form ?? (body && JSON.stringify(body)) })
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
  return { isError: !!r.isError, data: JSON.parse(r.content[0].text), size: r.content[0].text.length }
}
const refused = (r, code, label) => assert.ok(r.isError && r.data.error?.code === code, `${label}: expected ${code}, got ${JSON.stringify(r.data).slice(0, 300)}`)
const rawMcp = (headers, body) => fetch(base + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body })

// Ada owns a studio with the Ashbell Pass demo, accepted, scanned, one change applied (tasks) and S03 v2 imported (re-check).
const ada = await account('Ada')
const studio = (await ada('/api/studios', { method: 'POST', body: { name: 'Ashbell Studio' } })).data
await ada('/api/projects', { method: 'POST', body: { name: 'The Ashbell Pass', studio_id: studio.id } })
assert.equal((await ada('/api/demo/load', { method: 'POST', body: { set: 'ashbell-pass' } })).status, 200)
const pendingAll = (await ada('/api/facts?status=pending')).data
assert.equal((await ada('/api/facts/accept-verified', { method: 'POST', body: { items: pendingAll.map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) })) } })).status, 200)
assert.equal((await ada('/api/conflicts/scan', { method: 'POST' })).status, 200)
let canon = (await ada('/api/facts?status=canon')).data
const fact = s => { const f = canon.find(x => x.statement === s); assert.ok(f, `canon fact: ${s}`); return f }
const r1 = fact('Whoever rings the Ashbell loses their voice until the next sunrise.')
const ch = (await ada('/api/changes', { method: 'POST', body: { target_fact_id: r1.id, proposed_statement: gold.after_change[0].rule_statement, rationale: 'probe' } })).data
assert.equal((await ada(`/api/changes/${ch.id}/decision`, { method: 'POST', body: { decision: 'accept', rationale: 'probe' } })).data.status, 'applied')
let docs = (await ada('/api/documents')).data
const s03v1 = docs.find(d => d.name === gold.recheck.file)
const fd = new FormData()
fd.append('folder_id', s03v1.folder_id)
fd.append('files', new Blob([v2Text], { type: 'text/markdown' }), gold.recheck.file)
const s03v2 = (await ada('/api/documents', { method: 'POST', form: fd })).data.results[0]
assert.equal(s03v2.version, 2)
canon = (await ada('/api/facts?status=canon')).data
docs = (await ada('/api/documents')).data
ok('setup: Ashbell Pass accepted, scanned, change applied, S03 v2 imported', `${canon.length} canon facts, ${docs.length} documents`)

const adaTok = (await ada('/api/agent-tokens', { method: 'POST', body: { name: 'Claude Code (Ada)' } })).data
assert.match(adaTok.secret, /^sb_/)
const list = (await ada('/api/agent-tokens')).data.tokens
assert.ok(list.length === 1 && !JSON.stringify(list).includes(adaTok.secret), 'list never exposes the secret')
ok('token created, secret shown once; list has prefix only', list[0].prefix)

const bo = await account('Bo')
const invite = (await ada('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 7 } })).data
assert.equal((await bo(`/api/invites/${invite.token}/accept`, { method: 'POST' })).status, 200)
const boProject = (await bo('/api/me')).data.projects[0]
await bo(`/api/projects/${boProject.id}/switch`, { method: 'POST' })
const boTok = (await bo('/api/agent-tokens', { method: 'POST', body: { name: 'Bo reader' } })).data

const cy = await account('Cy')
const cyStudio = (await cy('/api/studios', { method: 'POST', body: { name: 'Other Studio' } })).data
await cy('/api/projects', { method: 'POST', body: { name: 'Elsewhere', studio_id: cyStudio.id } })
const cyTok = (await cy('/api/agent-tokens', { method: 'POST', body: { name: 'Cy agent' } })).data

// --- Transport: auth and body size
for (const h of [{}, { authorization: 'Bearer sb_nope' }, { authorization: `Basic ${adaTok.secret}` }])
  assert.equal((await rawMcp(h, '{}')).status, 401)
ok('no token / bad token / wrong scheme', '401')
const big = await rawMcp({ authorization: `Bearer ${adaTok.secret}` }, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'x'.repeat(300_000) } }))
assert.equal(big.status, 413)
ok('oversized request body', '413 TOO_LARGE')

// --- Discovery: tools with examples and schemas, prompts
const c = await connect(adaTok.secret)
const tools = (await c.listTools()).tools
const TOOL_NAMES = ['sb_ask', 'sb_check_facts', 'sb_get_context_pack', 'sb_get_entity', 'sb_get_fact', 'sb_get_impact', 'sb_get_timeline', 'sb_list_conflicts',
  'sb_list_documents', 'sb_list_entities', 'sb_list_projects', 'sb_list_recheck', 'sb_list_tasks', 'sb_propose_candidate', 'sb_read_document', 'sb_search_facts']
assert.deepEqual(tools.map(t => t.name).sort(), TOOL_NAMES)
for (const t of tools) {
  assert.ok(/Example: \{/.test(t.description), `${t.name} has an example`)
  assert.equal(t.inputSchema.type, 'object', `${t.name} has a JSON input schema`)
  assert.equal(t.annotations.readOnlyHint, t.name !== 'sb_propose_candidate', `${t.name} read-only hint`)
}
assert.equal(tools.find(t => t.name === 'sb_list_documents').inputSchema.properties.kind.enum.includes('scene'), true)
assert.equal(tools.find(t => t.name === 'sb_check_facts').inputSchema.properties.facts.maxItems, 20)
ok('lists tools with examples, schemas, enums and limits', tools.length)
const prompts = (await c.listPrompts()).prompts.map(p => p.name).sort()
assert.deepEqual(prompts, ['brief-entity', 'continuity-check-scene'])
const brief = await c.getPrompt({ name: 'brief-entity', arguments: { entity: 'Odo' } })
assert.ok(brief.messages[0].content.text.includes('sb_get_entity') && brief.messages[0].content.text.includes('not canon'))
ok('prompts', prompts.join(', '))

const proj = await call(c, 'sb_list_projects')
assert.equal(proj.data.projects[0].your_role, 'owner')
assert.equal(proj.data.projects[0].documents, 28)
assert.equal(proj.data.projects[0].open_tasks, 4)
ok('sb_list_projects', `${proj.data.projects[0].name}: ${proj.data.projects[0].canon_facts} canon, ${proj.data.projects[0].open_tasks} open tasks`)

// --- Documents
const allDocs = await call(c, 'sb_list_documents', { limit: 100 })
assert.equal(allDocs.data.total, 28)
const s03 = allDocs.data.documents.find(d => d.file === gold.recheck.file)
assert.deepEqual([s03.version, s03.folder, s03.id], [2, 'Act 1 / Scenes', s03v2.document_id])
assert.ok(s03.recheck.facts > 0 && s03.recheck.outdated === 2, JSON.stringify(s03.recheck))
const scenes = await call(c, 'sb_list_documents', { kind: 'scene' })
assert.ok(scenes.data.total > 0 && scenes.data.documents.every(d => d.kind === 'scene'))
const act1 = await call(c, 'sb_list_documents', { folder: 'act 1' })
assert.ok(act1.data.total > 0 && act1.data.documents.every(d => d.folder.startsWith('Act 1')))
const spoiler = await call(c, 'sb_list_documents', { tag: 'Spoiler' })
assert.equal(spoiler.data.total, 6)
assert.deepEqual((await call(c, 'sb_list_documents', { needs_recheck: true })).data.documents.map(d => d.file), [gold.recheck.file])
const p1 = await call(c, 'sb_list_documents', { limit: 10 })
const p2 = await call(c, 'sb_list_documents', { limit: 10, cursor: p1.data.next_cursor })
const p3 = await call(c, 'sb_list_documents', { limit: 10, cursor: p2.data.next_cursor })
assert.deepEqual([p1.data.next_cursor, p2.data.next_cursor, p3.data.next_cursor, p3.data.documents.length], ['10', '20', null, 8])
assert.equal(new Set([...p1.data.documents, ...p2.data.documents, ...p3.data.documents].map(d => d.id)).size, 28)
ok('sb_list_documents: kind / folder / tag / re-check filters, 3 pages of 10', `${scenes.data.total} scenes, ${act1.data.total} in Act 1`)

const read = await call(c, 'sb_read_document', { document: gold.recheck.file })
assert.deepEqual([read.data.document.version, read.data.document.latest_version, read.data.note], [2, 2, undefined])
assert.ok(read.data.passages.every(p => /^\d+-\d+$/.test(p.lines) && p.text))
// Canon cites v1 until a person re-pins it, so v1's passages carry the citing facts and v2's carry none yet.
assert.ok(read.data.passages.every(p => !p.canon_fact_ids.length))
const old = await call(c, 'sb_read_document', { document: gold.recheck.file, version: 1 })
assert.ok(old.data.passages.some(p => p.canon_fact_ids.length), 'passages carry the canon facts citing them')
assert.ok(old.data.document.version === 1 && old.data.note.includes('latest is 2'))
assert.ok(old.data.passages.map(p => p.text).join('\n').includes(gold.recheck.outdated_gone.split(' ')[0]))
const ranged = await call(c, 'sb_read_document', { document: s03.id, from_line: 5, to_line: 12 })
assert.ok(ranged.data.passages.length && ranged.data.passages.every(p => { const [a, b] = p.lines.split('-').map(Number); return b >= 5 && a <= 12 }))
const one = await call(c, 'sb_read_document', { document: s03.id, passage_ids: [read.data.passages[2].id, 'pas_missing'] })
assert.deepEqual([one.data.passages.map(p => p.id), one.data.not_in_this_version], [[read.data.passages[2].id], ['pas_missing']])
// Paging by character budget: every passage exactly once, in order.
const longest = allDocs.data.documents.reduce((a, b) => (b.passages > a.passages ? b : a))
const whole = await call(c, 'sb_read_document', { document: longest.id, max_chars: 30000 })
const pages = []
let next
do {
  const r = await call(c, 'sb_read_document', { document: longest.id, max_chars: 600, ...(next ? { cursor: next } : {}) })
  pages.push(...r.data.passages); next = r.data.next_cursor
} while (next)
assert.deepEqual(pages.map(p => p.id), whole.data.passages.map(p => p.id))
refused(await call(c, 'sb_read_document', { document: 'no-such-file.md' }), 'NOT_FOUND', 'unknown document')
refused(await call(c, 'sb_read_document', { document: s03.id, version: 9 }), 'NOT_FOUND', 'unknown version')
ok('sb_read_document: latest, older version, line range, passage ids, paging', `${longest.file} in ${pages.length} passages`)

// --- Entities
const chars = await call(c, 'sb_list_entities', { type: 'character' })
assert.ok(chars.data.total > 0 && chars.data.entities.every(e => e.type === 'character') && chars.data.types.some(t => t.key === 'location'))
refused(await call(c, 'sb_list_entities', { type: 'dragon' }), 'BAD_INPUT', 'unknown entity type')
const odoRow = (await call(c, 'sb_list_entities', { query: 'odo' })).data.entities.find(e => e.name === 'Odo')
assert.ok(odoRow && odoRow.canon_facts > 0)
const odo = await call(c, 'sb_get_entity', { entity: 'Odo' })
assert.equal(odo.data.canon.status, 'ok')
assert.ok(odo.data.canon.facts.every(f => f.evidence.length && f.evidence.every(e => e.quote && e.file && e.lines)))
assert.ok(odo.data.editorial.not_canon.includes('NOT canon') && odo.data.appearances.documents > 0)
assert.ok(Array.isArray(odo.data.canon.relationships) && Array.isArray(odo.data.canon.timeline))
const ysolde = await call(c, 'sb_get_entity', { entity: 'Ysolde' })
assert.ok(ysolde.data.canon.relationships.some(r => r.other === 'Corin'), 'relationships from canon')
assert.ok(ysolde.data.open_conflicts.some(x => x.rule === 'RELATIONSHIP_AFTER_END'), 'open conflicts touching the entity')
assert.equal((await call(c, 'sb_get_entity', { entity: odo.data.id })).data.name, 'Odo')
refused(await call(c, 'sb_get_entity', { entity: 'Nobody Atall' }), 'NOT_FOUND', 'unknown entity')
ok('sb_list_entities / sb_get_entity: canon with quotes, relationships, conflicts, editorial marked not canon', `Odo: ${odo.data.canon.total_facts} facts, ${odo.data.appearances.documents} documents`)

// --- Timeline: pre-story days, day-only, windows, entity filter
const tl = await call(c, 'sb_get_timeline', { limit: 200 })
const starts = tl.data.events
assert.ok(starts[0].time.startsWith('D-3650') && starts[0].before_story, starts[0].time)
assert.ok(starts.some(e => e.time.startsWith('D0')) && starts.every(e => e.source?.quote))
const day2 = await call(c, 'sb_get_timeline', { from: 'D2', to: 'D2' })
assert.ok(day2.data.total > 0 && day2.data.events.every(e => /D2\b/.test(e.time)), JSON.stringify(day2.data.events.map(e => e.time)))
const rourke = await call(c, 'sb_get_timeline', { entity: 'Rourke' })
assert.ok(rourke.data.total > 0 && rourke.data.events.every(e => e.subject === 'Rourke' || e.object === 'Rourke'))
refused(await call(c, 'sb_get_timeline', { from: 'tomorrow' }), 'BAD_INPUT', 'bad story time')
ok('sb_get_timeline', `${tl.data.total} timed facts from ${starts[0].time}; D2 window ${day2.data.total}`)

// --- Ask: grounded or unknown
const asked = await call(c, 'sb_ask', { question: 'Who stands watch at the Bell Gate on Day 2?' })
assert.ok(['supported', 'source_only'].includes(asked.data.status) && asked.data.cited.some(f => f.statement.includes('Rourke')) && asked.data.trace_id)
assert.equal((await call(c, 'sb_ask', { question: gold.unknown_questions[0] })).data.status, 'unknown')
ok('sb_ask', `${asked.data.status}, ${asked.data.cited.length} facts cited; unsupported -> unknown`)

// --- Continuity check: the rules fire on proposed facts, nothing is stored
const factsBefore = (await ada('/api/stats')).data
const corinLater = fact(gold.conflicts.find(g => g.id === 'C2').statements[1])
const check = await call(c, 'sb_check_facts', { facts: [
  { kind: 'event', subject: 'Rourke', predicate: 'located_at', object: 'Saltgate', time_from: 'D2 21:15', statement: 'Rourke buys salt in Saltgate.' },
  { kind: 'event', subject: 'Ves', predicate: 'located_at', object: 'Saltgate', time_from: 'D3 14:20' },
  { kind: 'relationship', subject: corinLater.subject, predicate: corinLater.predicate, object: corinLater.object, time_from: 'D5 09:00' },
  { kind: 'event', subject: 'Rourke', predicate: 'located_at', object: 'Stillfire Abbey', time_from: 'D2' },
] })
const rules = check.data.would_raise.map(h => `${h.left.proposed_index ?? h.left.fact_id}:${h.rule}`)
assert.ok(check.data.would_raise.some(h => h.rule === 'EXACT_TIME_LOCATION_OVERLAP' && h.left.proposed_index === 0 && h.right.fact_id && h.right.source.quote && h.severity === 'hard'), rules.join(' '))
assert.ok(check.data.would_raise.some(h => h.rule === 'TRAVEL_TIME_TOO_SHORT' && [h.left.proposed_index, h.right.proposed_index].includes(1)), rules.join(' '))
assert.ok(check.data.would_raise.some(h => h.rule === 'RELATIONSHIP_AFTER_END' && h.right.proposed_index === 2), rules.join(' '))
assert.ok(!check.data.would_raise.some(h => [h.left.proposed_index, h.right.proposed_index].includes(3)), 'a day-only time never clashes on place')
assert.equal(check.data.stored, false)
const quiet = await call(c, 'sb_check_facts', { facts: [{ kind: 'event', subject: 'Odo', predicate: 'located_at', object: 'Saltgate', time_from: 'D40 10:00' }] })
assert.ok(quiet.data.would_raise.length === 0 && quiet.data.note.includes('not proof'))
refused(await call(c, 'sb_check_facts', { facts: [{ subject: 'x', predicate: 'located_at', time_from: 'noon' }] }), 'BAD_INPUT', 'bad time in check')
refused(await call(c, 'sb_check_facts', { facts: [{ subject: 'x', predicate: 'located_at', time_from: 'D2 10:00', time_to: 'D1 10:00' }] }), 'BAD_INPUT', 'reversed range')
refused(await call(c, 'sb_check_facts', { facts: Array.from({ length: 21 }, () => ({ subject: 'x', predicate: 'y' })) }), 'BAD_INPUT', '21 facts')
const factsAfter = (await ada('/api/stats')).data
assert.deepEqual([factsAfter.canon, factsAfter.pending, factsAfter.open_conflicts], [factsBefore.canon, factsBefore.pending, factsBefore.open_conflicts])
ok('sb_check_facts: exact overlap, travel, relationship after end; day-only quiet; nothing stored', rules.join(' '))

// --- Re-check and tasks
const rc = await call(c, 'sb_list_recheck')
const gone = rc.data.facts.find(f => f.statement === gold.recheck.outdated_gone)
assert.ok(gone && gone.state === 'outdated' && gone.citations[0].found_in_latest === 0 && gone.citations[0].cites.version === 1 && gone.citations[0].latest.version === 2)
assert.equal(rc.data.facts.find(f => f.statement === gold.recheck.outdated_twice).citations[0].found_in_latest, 2)
assert.ok(rc.data.facts.find(f => f.statement === gold.recheck.unchanged[0]).citations[0].now_at_line > 0)
assert.equal((await call(c, 'sb_list_recheck', { state: 'outdated' })).data.total, 2)
const tasks = await call(c, 'sb_list_tasks')
assert.equal(tasks.data.total, 4)
assert.ok(tasks.data.tasks.every(t => t.status === 'open' && t.change.id === ch.id && t.path.length >= 2 && t.why && t.scene.title))
assert.equal((await call(c, 'sb_list_tasks', { status: 'done' })).data.total, 0)
ok('sb_list_recheck / sb_list_tasks', `${rc.data.total} facts to re-check, ${tasks.data.total} open tasks`)

// --- Earlier tools on the same data
const pack = await call(c, 'sb_get_context_pack', { topic: 'Captain Rourke' })
assert.equal(pack.data.status, 'ok')
const withQuote = pack.data.facts.find(f => f.evidence[0]?.quote)
assert.ok(withQuote && withQuote.evidence[0].file && withQuote.evidence[0].lines, 'quote + source')
assert.equal((await call(c, 'sb_get_context_pack', { topic: 'zzzxqv qqwwxy' })).data.status, 'unknown')
assert.equal((await call(c, 'sb_search_facts', { query: 'zzzxqv' })).data.status, 'unknown')
assert.ok((await call(c, 'sb_get_fact', { fact_id: withQuote.id })).data.evidence.length > 0)
const impact = await call(c, 'sb_get_impact', { fact_id: withQuote.id })
assert.ok(Array.isArray(impact.data.items) && impact.data.scope.max_hops === 2)
assert.equal((await call(c, 'sb_get_impact', { change_id: ch.id })).data.status, 'applied')
refused(await call(c, 'sb_get_impact', {}), 'BAD_INPUT', 'impact needs one id')
const confl = await call(c, 'sb_list_conflicts', { status: 'all', limit: 3 })
assert.ok(confl.data.conflicts.length === 3 && confl.data.next_cursor === '3')
ok('context pack / search / fact / impact / conflicts (paged)', `${pack.data.facts.length} facts on Rourke`)

// Identity: after a person merges Salt Gate into Saltgate, the context pack for the kept page includes facts under the merged name.
const ents = (await ada('/api/entities')).data
const ent = n => ents.find(e => e.name === n)
const before = (await call(c, 'sb_get_context_pack', { topic: 'Saltgate', limit: 40 })).data.facts.length
assert.equal((await ada(`/api/entities/${ent('Salt Gate').id}/merge`, { method: 'POST', body: { into: ent('Saltgate').id } })).status, 200)
const merged = (await call(c, 'sb_get_context_pack', { topic: 'Saltgate', limit: 40 })).data
assert.ok(merged.entity.merged_names.includes('Salt Gate') && merged.facts.length > before, 'merged names feed the context pack')
assert.equal((await call(c, 'sb_get_entity', { entity: 'Salt Gate' })).data.name, 'Saltgate', 'a merged name opens the kept page')
const asKept = await call(c, 'sb_check_facts', { facts: [{ kind: 'event', subject: 'Mother Brisk', predicate: 'located_at', object: 'Salt Gate', time_from: 'D9 10:00' }] })
assert.equal(asKept.data.proposed[0].object, 'Saltgate', 'a merged-away name is checked under its kept name')
ok('context pack and entity follow identity (merged names)', `${before} -> ${merged.facts.length} facts`)

// --- Input errors: always JSON with a code
refused(await call(c, 'sb_search_facts', { query: 42 }), 'BAD_INPUT', 'wrong type')
refused(await call(c, 'sb_search_facts', { query: 'x'.repeat(201) }), 'BAD_INPUT', 'too long')
refused(await call(c, 'sb_list_documents', { cursor: 'abc' }), 'BAD_INPUT', 'bad cursor')
refused(await call(c, 'sb_list_documents', { kind: 'poem' }), 'BAD_INPUT', 'bad enum')
refused(await call(c, 'sb_no_such_tool', {}), 'BAD_INPUT', 'unknown tool')
ok('bad arguments / unknown tool', 'BAD_INPUT')

// --- Propose: verbatim quote -> pending in review; fabricated -> refused, nothing stored.
const lore = docs.find(d => d.kind === 'lore')
const full = (await ada(`/api/documents/${lore.id}`)).data
const text = full.passages.find(p => p.text.length > 40 && !p.text.startsWith('#')).text
const quote = text.split('\n')[0].slice(0, 60)
const pendingBefore = (await ada('/api/facts?status=pending')).data.length
const good = await call(c, 'sb_propose_candidate', { document: lore.name, quote, statement: `Probe fact ${run}`, kind: 'claim', subject: 'Probe', predicate: 'is_probed' })
assert.equal(good.isError, false, JSON.stringify(good.data))
assert.equal(good.data.cites.document_id, lore.id)
let pending = (await ada('/api/facts?status=pending')).data
assert.equal(pending.length, pendingBefore + 1)
const made = pending.find(f => f.id === good.data.fact_id)
assert.deepEqual([made.status, made.origin, made.agent_name, made.proposed_by_name, made.evidence[0].verified], ['pending', 'agent:mcp', 'Claude Code (Ada)', 'Ada', 1])
assert.equal((await ada('/api/facts?status=canon')).data.some(f => f.id === made.id), false)
ok('verified proposal is pending with agent + owner', made.id)
// An old version's id: the candidate cites the latest version (facts only cite the latest).
const v2Quote = (await call(c, 'sb_read_document', { document: s03.id })).data.passages.find(p => p.text.length > 30 && !p.text.startsWith('#')).text.slice(0, 40)
const viaOld = await call(c, 'sb_propose_candidate', { document: s03v1.id, quote: v2Quote, statement: `Old id ${run}`, kind: 'claim', subject: 'Probe', predicate: 'x' })
assert.equal(viaOld.data.cites.document_id, s03v2.document_id, JSON.stringify(viaOld.data))
ok('an older version id still cites the latest version')
const fake = await call(c, 'sb_propose_candidate', { document: lore.name, quote: 'This sentence was never written anywhere.', statement: `Fake ${run}`, kind: 'claim', subject: 'Fake', predicate: 'x' })
refused(fake, 'QUOTE_NOT_VERBATIM', 'fabricated quote')
for (const q of [' \n\t ', 'a', quote.slice(0, 5)])
  refused(await call(c, 'sb_propose_candidate', { document: lore.name, quote: q, statement: `Blank ${run} ${q.length}`, kind: 'claim', subject: 'Blank', predicate: 'x' }), 'QUOTE_NOT_VERBATIM', 'blank quote')
refused(await call(c, 'sb_propose_candidate', { document: lore.name, quote, statement: `Probe fact ${run}`, kind: 'claim', subject: 'Probe', predicate: 'is_probed' }), 'DUPLICATE', 'same statement twice')
refused(await call(c, 'sb_propose_candidate', { document: lore.name, quote, statement: `Timed ${run}`, kind: 'event', subject: 'P', predicate: 'x', time_from: 'D3', time_to: 'D2' }), 'BAD_INPUT', 'reversed time')
assert.equal((await ada('/api/facts?status=pending')).data.length, pendingBefore + 2)
ok('fabricated / blank / duplicate / bad-time proposals refused, nothing stored')
// Padded quote: stored trimmed and verbatim in its cited passage.
const padded = await call(c, 'sb_propose_candidate', { document: lore.name, quote: `  \n${quote}\t `, statement: `Padded ${run}`, kind: 'claim', subject: 'Padded', predicate: 'x' })
assert.equal(padded.isError, false, JSON.stringify(padded.data))
const pf = (await ada('/api/facts?status=pending')).data.find(f => f.id === padded.data.fact_id)
assert.equal(pf.evidence[0].quote, quote.trim())
assert.ok(text.includes(pf.evidence[0].quote))
ok('padded quote stored without padding, verbatim in passage')
if (process.argv[3]) {
  // Injected bad evidence rows -> accept 422.
  const db = new DatabaseSync(process.argv[3])
  for (const bad of [` ${quote} `, 'never written in this passage at all']) {
    db.prepare('update evidence set quote = ? where fact_id = ?').run(bad, pf.id)
    assert.equal((await ada(`/api/facts/${pf.id}/review`, { method: 'POST', body: { decision: 'accept' } })).status, 422)
  }
  db.prepare('update evidence set quote = ? where fact_id = ?').run(quote.trim(), pf.id)
  db.close()
  assert.equal((await ada(`/api/facts/${pf.id}/review`, { method: 'POST', body: { decision: 'accept', rationale: 'probe' } })).status, 200)
  ok('injected padded / non-verbatim evidence -> accept 422; restored -> 200')
}
refused(await call(c, 'sb_get_fact', { fact_id: made.id }), 'NOT_CANON', 'pending fact')
ok('sb_get_fact refuses a pending fact')
await c.close()

// --- Viewer token: every read works, propose refused.
const b = await connect(boTok.secret)
const reads = { sb_list_projects: {}, sb_get_context_pack: { topic: 'Odo' }, sb_search_facts: { query: 'Ashbell' }, sb_get_fact: { fact_id: withQuote.id },
  sb_list_documents: {}, sb_read_document: { document: s03.id }, sb_list_entities: {}, sb_get_entity: { entity: 'Odo' }, sb_get_timeline: {},
  sb_ask: { question: 'Who stands watch at the Bell Gate?' }, sb_check_facts: { facts: [{ subject: 'Odo', predicate: 'located_at', object: 'Saltgate', time_from: 'D1 10:00' }] },
  sb_list_conflicts: {}, sb_get_impact: { fact_id: withQuote.id }, sb_list_recheck: {}, sb_list_tasks: {} }
assert.deepEqual(Object.keys(reads).sort(), TOOL_NAMES.filter(n => n !== 'sb_propose_candidate'))
for (const [name, args] of Object.entries(reads)) {
  const r = await call(b, name, args)
  assert.equal(r.isError, false, `${name} as viewer: ${JSON.stringify(r.data).slice(0, 200)}`)
}
refused(await call(b, 'sb_propose_candidate', { document: lore.name, quote, statement: `Viewer ${run}`, kind: 'claim', subject: 'V', predicate: 'x' }), 'FORBIDDEN', 'viewer propose')
ok('viewer token: all 15 reads work, propose refused')
await b.close()

// --- Another studio's token sees nothing of this project.
const o = await connect(cyTok.secret)
assert.equal((await call(o, 'sb_get_context_pack', { topic: 'Odo' })).data.status, 'unknown')
assert.equal((await call(o, 'sb_list_documents')).data.total, 0)
assert.equal((await call(o, 'sb_get_timeline')).data.total, 0)
assert.equal((await call(o, 'sb_list_tasks')).data.total, 0)
assert.equal((await call(o, 'sb_list_recheck')).data.total, 0)
assert.equal((await call(o, 'sb_ask', { question: 'Who stands watch at the Bell Gate on Day 2?' })).data.status, 'unknown')
assert.equal((await call(o, 'sb_check_facts', { facts: [{ kind: 'event', subject: 'Rourke', predicate: 'located_at', object: 'Saltgate', time_from: 'D2 21:15' }] })).data.would_raise.length, 0)
for (const [name, args] of [['sb_get_fact', { fact_id: withQuote.id }], ['sb_get_impact', { fact_id: withQuote.id }], ['sb_get_impact', { change_id: ch.id }],
  ['sb_read_document', { document: s03.id }], ['sb_read_document', { document: gold.recheck.file }], ['sb_get_entity', { entity: odo.data.id }], ['sb_get_entity', { entity: 'Odo' }],
  ['sb_propose_candidate', { document: lore.id, quote, statement: 'x', kind: 'claim', subject: 'x', predicate: 'x' }]])
  refused(await call(o, name, args), 'NOT_FOUND', `other project ${name}`)
ok("other project's token gets nothing")

// --- Rate limit: per token, the other token is unaffected.
let limited
for (let i = 0; i < 125 && !limited; i++) {
  const r = await call(o, 'sb_list_projects')
  if (r.isError) limited = r
}
refused(limited, 'RATE_LIMITED', 'rate limit')
assert.ok(limited.data.error.retry_after_s > 0)
const b2 = await connect(boTok.secret)
assert.equal((await call(b2, 'sb_list_projects')).isError, false)
await b2.close(); await o.close()
ok('per-token rate limit', `RATE_LIMITED, retry in ${limited.data.error.retry_after_s} s; other token unaffected`)

// --- Revoked token -> 401.
assert.equal((await ada(`/api/agent-tokens/${adaTok.id}`, { method: 'DELETE' })).status, 200)
assert.equal((await rawMcp({ authorization: `Bearer ${adaTok.secret}` }, '{}')).status, 401)
const after = (await ada('/api/agent-tokens')).data.tokens[0]
assert.ok(after.revoked_at && after.last_used_at)
ok('revoked token 401; last-used and revoked recorded')
console.log('\nmcp probe passed')
