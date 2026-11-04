// MCP probe against a running server: node scripts/mcp-probe.mjs <baseUrl> [<server cwd>/.data/storybible.db]
// Drives the real /mcp endpoint with the official SDK client on the Ashbell Pass demo: every tool and prompt, auth (401, revoked),
// roles (viewer reads, cannot propose), scope (another project's token sees nothing), input errors (JSON error codes), the
// size caps (413 body, paging), the per-token rate limit, and that no token level can make a canon decision (FORBIDDEN; a person
// decides through the web API). Creates throwaway accounts (unique emails per run).
// With the db path it also checks that injected non-verbatim evidence can't be accepted.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { crc32 } from 'node:zlib'
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
// A minimal Word file: two stored (uncompressed) zip entries.
function makeDocx(text) {
  const parts = [['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`]]
  const locals = [], centrals = []
  let offset = 0
  for (const [n, d] of parts) {
    const name = Buffer.from(n), data = Buffer.from(d), crc = crc32(data)
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034B50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x21, 12)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014B50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    locals.push(local, name, data); centrals.push(central, name)
    offset += 30 + name.length + data.length
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0); end.writeUInt16LE(parts.length, 8); end.writeUInt16LE(parts.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

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
const chunked = await fetch(base + '/mcp', { method: 'POST', duplex: 'half', headers: { authorization: `Bearer ${adaTok.secret}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: new ReadableStream({ start(ctl) { const b = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'x'.repeat(300_000) } })); for (let i = 0; i < b.length; i += 65536) ctl.enqueue(b.subarray(i, i + 65536)); ctl.close() } }) })
assert.equal(chunked.status, 413)
ok('oversized chunked request body (no Content-Length)', '413 TOO_LARGE')

// --- Discovery: tools with examples and schemas, prompts
const c = await connect(adaTok.secret)
const tools = (await c.listTools()).tools
const TOOL_NAMES = ['sb_ask', 'sb_check_facts', 'sb_get_context_pack', 'sb_get_entity', 'sb_get_fact', 'sb_get_impact', 'sb_get_timeline', 'sb_list_conflicts',
  'sb_list_documents', 'sb_list_entities', 'sb_list_projects', 'sb_list_recheck', 'sb_list_tasks', 'sb_propose_candidate', 'sb_read_document', 'sb_search_facts']
// The panel tools (server/utils/mcp-panel.ts): one per area, an `action` enum each.
const PANEL_TOOLS = ['sb_agent_runs', 'sb_audit', 'sb_change', 'sb_conflict', 'sb_continuity', 'sb_conversation', 'sb_document', 'sb_draft', 'sb_entity', 'sb_export',
  'sb_images', 'sb_library', 'sb_metrics', 'sb_note', 'sb_project', 'sb_research', 'sb_review', 'sb_search', 'sb_share', 'sb_task', 'sb_team']
assert.deepEqual(tools.map(t => t.name).sort(), [...TOOL_NAMES, ...PANEL_TOOLS].sort())
for (const t of tools) {
  assert.ok(/Example: \{/.test(t.description), `${t.name} has an example`)
  assert.equal(t.inputSchema.type, 'object', `${t.name} has a JSON input schema`)
  if (TOOL_NAMES.includes(t.name)) assert.equal(t.annotations.readOnlyHint, t.name !== 'sb_propose_candidate', `${t.name} read-only hint`)
  else {
    assert.ok(t.inputSchema.properties.action.enum.length >= 1 && t.inputSchema.required.includes('action'), `${t.name} has an action enum`)
    const example = JSON.parse(t.description.match(/Example: (\{.*\})$/)[1])
    assert.ok(t.inputSchema.properties.action.enum.includes(example.action), `${t.name} example uses a real action`)
  }
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
assert.equal(proj.data.projects[0].open_tasks, 5) // 4 scenes + the bell lore page (every document kind counts)
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
// A single paragraph longer than the page budget comes in parts, and every character is reachable.
const longText = 'The bell rang over the pass and nobody spoke. '.repeat(800).slice(0, 35_001) + '!'
const lfd = new FormData()
lfd.append('files', new Blob([longText], { type: 'text/markdown' }), `long-paragraph-${run}.md`)
const longId = (await ada('/api/documents', { method: 'POST', form: lfd })).data.results[0].document_id
for (const [budget, want] of [[30_000, 2], [12_000, 3], [5_000, 8]]) {
  const parts = []
  let at
  do {
    const r = await call(c, 'sb_read_document', { document: longId, max_chars: budget, ...(at ? { cursor: at } : {}) })
    assert.ok(r.data.passages?.length === 1, `one part per page: ${JSON.stringify(r.data).slice(0, 200)}`)
    parts.push(r.data.passages[0]); at = r.data.next_cursor
  } while (at)
  assert.equal(parts.length, want)
  assert.ok(parts.every((p, i) => p.id === parts[0].id && p.part.from_char === (i ? parts[i - 1].part.to_char : 0) && p.part.of === longText.length))
  assert.equal(parts.map(p => p.text).join(''), longText, `budget ${budget}: the joined parts are the passage, character for character`)
}
refused(await call(c, 'sb_read_document', { document: longId, cursor: 'x:1' }), 'BAD_INPUT', 'malformed cursor')
ok('sb_read_document: a 35,002-character paragraph pages inside the passage', 'parts join back exactly')

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
// Canon facts come in pages (cursor / next_cursor): the first page has the whole brief, later pages only the next facts, and
// the pages together hold every fact once.
const odoFirst = (await call(c, 'sb_get_entity', { entity: 'Odo', facts_limit: 3 })).data
assert.ok(odo.data.canon.total_facts > 3 && odoFirst.canon.facts.length === 3 && odoFirst.canon.next_cursor && odoFirst.appearances, 'first page')
const paged = odoFirst.canon.facts.map(f => f.id)
for (let at = odoFirst.canon.next_cursor; at;) {
  const p = (await call(c, 'sb_get_entity', { entity: 'Odo', facts_limit: 3, cursor: at })).data
  assert.ok(p.canon.facts.length && !p.appearances && !p.editorial && p.canon.facts.every(f => f.evidence.length), 'a later page is facts only')
  paged.push(...p.canon.facts.map(f => f.id))
  at = p.canon.next_cursor
}
assert.deepEqual([paged.length, new Set(paged).size], [odo.data.canon.total_facts, odo.data.canon.total_facts])
assert.equal(odo.data.canon.next_cursor, odo.data.canon.total_facts > 40 ? '40' : null)
ok('sb_get_entity pages canon facts with a cursor', `${odo.data.canon.total_facts} facts in pages of 3`)

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
// Acts after death: someone who dies on D3 greets someone on D5 (flagged), and on D2 (not).
const death = await call(c, 'sb_check_facts', { facts: [
  { kind: 'event', subject: 'Probe Varek', predicate: 'dies', time_from: 'D3', statement: 'Probe Varek dies.' },
  { kind: 'event', subject: 'Probe Varek', predicate: 'greets', object: 'Odo', time_from: 'D5', statement: 'Probe Varek greets Odo.' },
  { kind: 'event', subject: 'Probe Varek', predicate: 'greets', object: 'Ves', time_from: 'D2', statement: 'Probe Varek greets Ves.' },
] })
assert.deepEqual(death.data.would_raise.map(h => [h.rule, h.left.proposed_index, h.right.proposed_index, h.severity]), [['ACTS_AFTER_DEATH', 0, 1, 'hard']])
ok('sb_check_facts: acts after death', death.data.would_raise[0].rationale)
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
assert.equal(tasks.data.total, 5) // 4 scenes + the bell lore page
assert.ok(tasks.data.tasks.every(t => t.status === 'open' && t.change.id === ch.id && t.path.length >= 2 && t.why && t.document.title && t.document.kind))
assert.equal((await call(c, 'sb_list_tasks', { status: 'done' })).data.total, 0)
ok('sb_list_recheck / sb_list_tasks', `${rc.data.total} facts to re-check, ${tasks.data.total} open tasks`)

// --- Earlier tools on the same data
const pack = await call(c, 'sb_get_context_pack', { topic: 'Captain Rourke' })
assert.equal(pack.data.status, 'ok')
const withQuote = pack.data.facts.find(f => f.evidence[0]?.quote)
assert.ok(withQuote && withQuote.evidence[0].file && withQuote.evidence[0].lines, 'quote + source')
assert.equal((await call(c, 'sb_get_context_pack', { topic: 'zzzxqv qqwwxy' })).data.status, 'unknown')
// A capped pack says so: how many facts matched and that some were left out.
const smallPack = (await call(c, 'sb_get_context_pack', { topic: 'Odo', limit: 2 })).data
assert.ok(smallPack.facts.length === 2 && smallPack.truncated === true && smallPack.total > 2 && smallPack.note.includes(`of ${smallPack.total}`), JSON.stringify({ total: smallPack.total, truncated: smallPack.truncated }))
assert.ok(pack.data.total >= pack.data.facts.length && pack.data.truncated === pack.data.total > pack.data.facts.length)
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

// ===================== Panel tools: the project's work by token level and live role; canon decisions by no token =====================
// adaTok is a "propose" token (the default); adaFull edits as Ada (editorial only). Bo (viewer) has a full token: his live role still refuses
// writes. Cy's full token belongs to another studio: ids from this project are NOT_FOUND there.
const adaFullTok = (await ada('/api/agent-tokens', { method: 'POST', body: { name: 'Agent full (Ada)', level: 'full' } })).data
assert.equal(adaFullTok.level, 'full')
assert.equal((await ada('/api/agent-tokens', { method: 'POST', body: { name: 'x', level: 'admin' } })).status, 400)
const levels = Object.fromEntries((await ada('/api/agent-tokens')).data.tokens.map(t => [t.name, t.level]))
assert.deepEqual([levels['Claude Code (Ada)'], levels['Agent full (Ada)']], ['propose', 'full'])
ok('token levels: propose by default, full on request, anything else 400')
const boFullTok = (await bo('/api/agent-tokens', { method: 'POST', body: { name: 'Bo full', level: 'full' } })).data
const cyFullTok = (await cy('/api/agent-tokens', { method: 'POST', body: { name: 'Cy full', level: 'full' } })).data
const P = await connect(adaTok.secret) // propose
const F = await connect(adaFullTok.secret) // full
const V = await connect(boFullTok.secret) // full token, viewer role
const X = await connect(cyFullTok.secret) // full token, other studio
// The panel section makes well over 120 calls a minute per token: wait out the per-token limit instead of failing.
const callR = async (client, name, args) => {
  for (;;) {
    const r = await call(client, name, args)
    if (r.data?.error?.code !== 'RATE_LIMITED') return r
    await new Promise(res => setTimeout(res, (r.data.error.retry_after_s + 1) * 1000))
  }
}
const okCall = async (client, name, args, label = `${name} ${args.action}`) => {
  const r = await callR(client, name, args)
  assert.equal(r.isError, false, `${label}: ${JSON.stringify(r.data).slice(0, 400)}`)
  return r.data
}
const tested = new Map() // tool -> { ok, refused }
const mark = (tool, kind) => tested.set(tool, { ...tested.get(tool), [kind]: true })
const yes = async (client, name, args, label) => { const d = await okCall(client, name, args, label); mark(name, 'ok'); return d }
const no = async (client, name, args, code, label = `${name} ${args.action}`) => { refused(await callR(client, name, args), code, label); mark(name, 'refused') }
const levelRefusal = async (name, args) => {
  const r = await callR(P, name, args)
  refused(r, 'FORBIDDEN', `${name} ${args.action} with a propose token`)
  assert.ok(r.data.error.message.includes('full-access token') && r.data.error.needed_level === 'full')
  mark(name, 'refused')
}
assert.deepEqual([(await callR(P, 'sb_list_projects')).data.token.level, (await call(F, 'sb_list_projects')).data.can_edit, (await call(V, 'sb_list_projects')).data.can_edit, (await call(F, 'sb_list_projects')).data.can_decide],
  ['propose', true, false, undefined])
ok('sb_list_projects says the token level and whether it can edit; no token can decide')
// No token level sees a decision: even a full token's tools list no decision tool, action or "to canon".
const fullTools = (await F.listTools()).tools
const actionsOf = Object.fromEntries(fullTools.map(t => [t.name, t.inputSchema.properties?.action?.enum]))
assert.deepEqual([actionsOf.sb_review, actionsOf.sb_change, actionsOf.sb_conflict, 'sb_recheck' in actionsOf], [['list', 'add', 'critic'], ['list', 'propose', 'analyze', 'export'], ['scan'], false])
assert.ok(!actionsOf.sb_entity.includes('merge') && actionsOf.sb_entity.includes('merge_preview'))
assert.deepEqual(fullTools.find(t => t.name === 'sb_review').inputSchema.properties.to.enum, ['review'])
ok('no decision tool or action is listed, even for a full token')
const HUMAN = 'Canon decisions are made by a person in CanonTracker, not through an agent.'
const humanOnly = async (client, name, args) => {
  const r = await callR(client, name, args)
  refused(r, 'FORBIDDEN', `${name} ${args.action} through an agent`)
  assert.ok(r.data.error.message.startsWith(HUMAN) && r.data.error.human_only === true, JSON.stringify(r.data))
  mark(name, 'refused')
}

// --- sb_review: five fresh candidates from a lore document (add to review works with a propose token)
const lorePs = full.passages.filter(p => p.text.length > 60 && !p.text.startsWith('#'))
const added = []
for (let i = 0; i < 5; i++) {
  added.push(await yes(P, 'sb_review', { action: 'add', to: 'review', document: lore.id, quote: lorePs[i % lorePs.length].text.split('\n')[0].slice(i * 3, i * 3 + 45).trim(),
    statement: `Panel probe ${i} ${run}.`, kind: 'claim', subject: `Probe${i}`, predicate: 'is_probed' }))
}
assert.ok(added.every(a => a.status === 'pending'))
await humanOnly(F, 'sb_review', { action: 'add', to: 'canon', document: lore.id, quote: lorePs[0].text.split('\n')[0].slice(0, 45), statement: `Straight to canon ${run}.`, subject: 'P', predicate: 'x' })
const queue = await yes(P, 'sb_review', { action: 'list', limit: 100 })
assert.ok(queue.facts.every(f => f.evidence.length && !('fingerprint' in f)), JSON.stringify(queue).slice(0, 300)) // fingerprints only served bulk accept, which agents don't do
const mineQ = added.map(a => queue.facts.find(f => f.id === a.id))
assert.ok(mineQ.every(Boolean), 'the added candidates are listed')
const [c1, c2, c3] = mineQ
const canonList = await yes(P, 'sb_review', { action: 'list', status: 'canon', limit: 2 })
assert.ok(canonList.total > 200 && canonList.next_cursor === '2')
// Canon decisions: refused for every token level, role and project before anything runs; the candidates stay pending.
for (const cl of [P, F, V, X]) {
  await humanOnly(cl, 'sb_review', { action: 'accept', fact_id: c1.id, rationale: 'x' })
  await humanOnly(cl, 'sb_review', { action: 'reject', fact_id: c2.id, rationale: 'x' })
}
await humanOnly(F, 'sb_review', { action: 'edit_accept', fact_id: c3.id, corrected: { statement: 'x' }, rationale: 'x' })
await humanOnly(F, 'sb_review', { action: 'accept_verified', items: mineQ.slice(3).map(f => ({ id: f.id, fingerprint: 'x' })) })
const stillPending = (await ada('/api/facts?status=pending')).data
assert.ok(mineQ.every(f => stillPending.some(x => x.id === f.id)), 'nothing an agent asked to decide was decided')
const advice = await callR(P, 'sb_review', { action: 'critic', ids: [made.id] })
assert.ok(!advice.isError || ['BAD_INPUT', 'INTERNAL'].includes(advice.data.error.code), JSON.stringify(advice.data).slice(0, 200))
// A person decides in the app.
assert.equal((await ada(`/api/facts/${c1.id}/review`, { method: 'POST', body: { decision: 'accept', rationale: 'Checked against the source.' } })).status, 200)
assert.equal((await ada(`/api/facts/${c2.id}/review`, { method: 'POST', body: { decision: 'reject', rationale: 'Figurative, not a fact.' } })).status, 200)
const decided = (await ada('/api/facts?status=canon')).data.find(f => f.id === c1.id)
assert.deepEqual([decided.decided_by_name, decided.decided_via ?? null], ['Ada', null])
ok('sb_review: list, add, critic; accept / edit_accept / reject / accept_verified / add to canon FORBIDDEN for every token; a person decides in the app')

// --- Re-check: confirming or keeping a citation is a person's call (sb_list_recheck reads; no tool settles one).
const outdated = (await callR(P, 'sb_list_recheck', { state: 'outdated' })).data.facts[0].citations[0].evidence_id
await humanOnly(F, 'sb_recheck', { action: 'confirm', fact_ids: [fact(gold.recheck.unchanged[0]).id] })
await humanOnly(F, 'sb_recheck', { action: 'keep', evidence_ids: [outdated] })
assert.equal((await callR(P, 'sb_list_recheck', { state: 'outdated' })).data.total, 2)
ok('sb_recheck: confirm and keep FORBIDDEN for a full token; citations unchanged')

// --- sb_change
const target = r1
const nowCanon = (await ada('/api/facts?status=canon')).data
const anyCanon = nowCanon.find(f => f.kind === 'claim' && f.evidence.length)
const proposed = await yes(P, 'sb_change', { action: 'propose', fact_id: anyCanon.id, proposed_statement: `${anyCanon.statement} (changed ${run})`, rationale: 'Probe: a propose token may propose.' })
assert.equal(proposed.status, 'ready_for_review')
await yes(P, 'sb_change', { action: 'analyze', change_id: proposed.id })
await no(V, 'sb_change', { action: 'propose', fact_id: anyCanon.id, proposed_statement: 'Viewer change', rationale: 'x' }, 'FORBIDDEN', 'viewer proposes a change')
// Accepting, rejecting or reverting a change is a person's call, in Changes.
for (const args of [{ action: 'decide', change_id: proposed.id, decision: 'accept', rationale: 'x' }, { action: 'accept', change_id: proposed.id }, { action: 'revert', change_id: proposed.id, rationale: 'x' }])
  await humanOnly(F, 'sb_change', args)
assert.equal((await ada(`/api/changes/${proposed.id}/decision`, { method: 'POST', body: { decision: 'accept', rationale: 'Approved by Ada.' } })).data.status, 'applied')
const md = await yes(P, 'sb_change', { action: 'export', change_id: proposed.id, format: 'md' })
assert.ok(md.text.startsWith(`# Impact manifest ${proposed.id}`))
assert.equal((await ada(`/api/changes/${proposed.id}/revert`, { method: 'POST', body: { rationale: 'Back to the original.' } })).status, 200)
await no(X, 'sb_change', { action: 'export', change_id: proposed.id }, 'NOT_FOUND', 'other project change')
const changesNow = await yes(P, 'sb_change', { action: 'list', status: 'reverted' })
const mine = changesNow.changes.find(x => x.id === proposed.id)
assert.deepEqual([mine.decided_via_agent ?? null, mine.reverted_via_agent ?? null, mine.decided_by], [null, null, 'Ada'])
ok('sb_change: propose + analyze (propose token), export; decide / accept / revert FORBIDDEN for a full token; a person applies and reverts in the app', target.id)

// --- sb_conflict
const scan = await yes(P, 'sb_conflict', { action: 'scan' })
assert.ok(typeof scan.created === 'number', JSON.stringify(scan).slice(0, 200))
const openOnes = (await callR(P, 'sb_list_conflicts', { status: 'open' })).data.conflicts
// Deciding a conflict or changing its severity is a person's call, in Conflicts.
for (const args of [{ action: 'decide', conflict_id: openOnes[0].id, decision: 'confirmed', rationale: 'x' }, { action: 'false_positive', conflict_id: openOnes[0].id },
  { action: 'severity', conflict_id: openOnes[1].id, severity: openOnes[1].severity === 'hard' ? 'soft' : 'hard', rationale: 'x' }])
  await humanOnly(F, 'sb_conflict', args)
assert.equal((await ada(`/api/conflicts/${openOnes[0].id}/decision`, { method: 'POST', body: { decision: 'confirmed', rationale: 'Real clash; fix in S04.' } })).status, 200)
const decidedConflict = (await ada('/api/conflicts')).data.find(x => x.id === openOnes[0].id)
assert.deepEqual([decidedConflict.status, decidedConflict.decided_by_name, decidedConflict.decided_via ?? null], ['confirmed', 'Ada', null])
ok('sb_conflict: scan (propose); decide / severity FORBIDDEN for a full token; a person decides in the app')

// --- sb_task
const task = (await callR(P, 'sb_list_tasks')).data.tasks[0]
await levelRefusal('sb_task', { action: 'update', task_id: task.id, status: 'done' })
assert.equal((await yes(F, 'sb_task', { action: 'update', task_id: task.id, status: 'done', comment: 'Re-read; consistent.' })).status, 'done')
await no(F, 'sb_task', { action: 'update', task_id: task.id, due_date: 'tomorrow' }, 'BAD_INPUT', 'bad due date')
ok('sb_task: update (full)')

// --- sb_entity
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
await levelRefusal('sb_entity', { action: 'create', name: `Ferryman ${run}`, type: 'character' })
const ferry = await yes(F, 'sb_entity', { action: 'create', name: `Ferryman ${run}`, type: 'character', summary: 'Runs the night ferry.' })
await yes(F, 'sb_entity', { action: 'update', entity: ferry.id, aliases: [`Old Ferry ${run}`], notes: 'Probe notes.' })
const twin = await yes(F, 'sb_entity', { action: 'create', name: `Ferry Twin ${run}`, type: 'character' })
const preview = await yes(P, 'sb_entity', { action: 'merge_preview', entity: twin.id, into: `Old Ferry ${run}` })
assert.ok('facts' in preview)
// A merge is an identity decision: a person makes it on the entity page.
await humanOnly(F, 'sb_entity', { action: 'merge', entity: twin.id, into: ferry.id })
await humanOnly(F, 'sb_entity', { action: 'merge', entity: twin.id, into: ferry.id, preview: false })
assert.ok((await ada('/api/entities')).data.some(e => e.id === twin.id), 'the duplicate page is still there')
await yes(F, 'sb_entity', { action: 'portrait_set', entity: ferry.id, image_base64: PNG, filename: 'ferry.png' })
await yes(F, 'sb_entity', { action: 'portrait_remove', entity: ferry.id })
await no(F, 'sb_entity', { action: 'delete', entity: 'Odo' }, 'BAD_INPUT', 'delete a page canon names (409)')
await yes(F, 'sb_entity', { action: 'delete', entity: twin.id })
await yes(F, 'sb_entity', { action: 'delete', entity: ferry.id })
await no(F, 'sb_entity', { action: 'update', entity: 'Nobody Atall', name: 'x' }, 'NOT_FOUND', 'unknown entity')
ok('sb_entity: create / update / portrait / delete (full), merge_preview (read); merge FORBIDDEN for a full token')

// --- sb_project
const proj0 = await yes(P, 'sb_project', { action: 'get' })
assert.ok(proj0.settings.medium === 'game' && proj0.role === 'owner')
await levelRefusal('sb_project', { action: 'update', research_profile: { period: '1890s' } })
await no(V, 'sb_project', { action: 'update', research_profile: { period: '1890s' } }, 'FORBIDDEN', 'viewer updates the project')
const upd = await yes(F, 'sb_project', { action: 'update', research_profile: { period: 'Late bronze age', place: 'The Ashbell Pass' } })
assert.equal(upd.research_profile.period, 'Late bronze age')
assert.ok((await yes(P, 'sb_project', { action: 'types' })).some(t => t.key === 'character'))
const ty = await yes(F, 'sb_project', { action: 'type_create', one: `Relic ${run}`, icon: 'item' })
await yes(F, 'sb_project', { action: 'type_update', key: ty.key, color: 'warn' })
await yes(F, 'sb_project', { action: 'type_delete', key: ty.key })
await no(F, 'sb_project', { action: 'type_delete', key: 'no_such_type' }, 'NOT_FOUND', 'unknown type')
ok('sb_project: get / types (read), update + type create/update/delete (full)')

// --- sb_team
const adminInvite = (await ada('/api/team/invites', { method: 'POST', body: { role: 'admin', days: 7 } })).data
const team = await yes(P, 'sb_team', { action: 'list' })
assert.ok(adminInvite.token && !('invites' in team) && !JSON.stringify(team).includes(adminInvite.token), 'sb_team list must never return invite tokens')
await ada(`/api/team/invites/${adminInvite.id}`, { method: 'DELETE' })
assert.ok(team.members.some(m => m.name === 'Bo' && m.role === 'viewer'))
// Team changes are not offered to agents at any level: the actions don't exist.
for (const [cl, action] of [[F, 'invite_create'], [F, 'set_role'], [F, 'remove'], [F, 'invite_revoke'], [V, 'invite_create']])
  await no(cl, 'sb_team', { action, role: 'editor', user_id: team.members[0].id }, 'BAD_INPUT', `sb_team ${action} is not offered`)
assert.deepEqual(tools.find(t => t.name === 'sb_team').inputSchema.properties.action.enum, ['list'])
ok('sb_team: list only; roles, removals and invites refused at every level')

// --- sb_document (import text and .docx, history, diff, extract, write)
await levelRefusal('sb_document', { action: 'import', filename: `probe-${run}.md`, text: 'x' })
await no(V, 'sb_document', { action: 'import', filename: `probe-${run}.md`, text: 'The bell keeper sleeps by day.' }, 'FORBIDDEN', 'viewer imports')
const imported = await yes(F, 'sb_document', { action: 'import', filename: `S29-the-ferry-${run}.md`, text: `# The ferry\n\nOdo waits at the Salt Gate for the night ferry, lantern in hand.\n\nThe ferry never sails when the Ashbell is silent.\n` })
assert.equal(imported.status, 'imported', JSON.stringify(imported))
await no(F, 'sb_document', { action: 'import', filename: `bad-${run}.pdf`, text: 'x' }, 'BAD_INPUT', 'unsupported file type')
await no(F, 'sb_document', { action: 'import', filename: 'x.md' }, 'BAD_INPUT', 'neither text nor docx')
const docxFile = makeDocx('Mira keeps the north lantern lit through the long winter.')
const wordDoc = await yes(F, 'sb_document', { action: 'import', filename: `lantern-${run}.docx`, docx_base64: docxFile.toString('base64') })
assert.equal(wordDoc.status, 'imported', JSON.stringify(wordDoc))
const hist = await yes(P, 'sb_document', { action: 'history', document: gold.recheck.file })
assert.deepEqual(hist.versions.map(v => v.version), [2, 1])
const diff = await yes(P, 'sb_document', { action: 'diff', document: gold.recheck.file })
assert.ok(diff.from.version === 1 && diff.to.version === 2 && diff.rows.length && diff.rows.every(r => r.op !== 'same'))
const ex = await yes(P, 'sb_document', { action: 'extract', document: imported.document_id })
assert.equal(ex.document_id, imported.document_id)
const written = await yes(F, 'sb_document', { action: 'write', document: imported.document_id, content: `# The ferry\n\nOdo waits at the Salt Gate for the night ferry.\n\nThe ferry never sails when the Ashbell is silent.\n` })
assert.equal(written.version, 2, JSON.stringify(written))
await no(X, 'sb_document', { action: 'history', document: imported.document_id }, 'NOT_FOUND', 'other project document')
ok('sb_document: import text + .docx, history, diff, extract (propose), write a new version (full)', `${imported.filename} v2`)

// --- sb_draft
await levelRefusal('sb_draft', { action: 'create', title: 'x' })
const dr = await yes(F, 'sb_draft', { action: 'create', title: `Night market ${run}`, content: 'Vendors close their stalls when the bell rings.' })
await yes(F, 'sb_draft', { action: 'update', draft_id: dr.id, content: 'Vendors close their stalls when the Ashbell rings at dusk.' })
assert.ok((await yes(P, 'sb_draft', { action: 'list' })).some(d => d.id === dr.id))
assert.equal((await yes(P, 'sb_draft', { action: 'get', draft_id: dr.id })).content.includes('dusk'), true)
const savedDraft = await yes(F, 'sb_draft', { action: 'save', draft_id: dr.id })
assert.equal(savedDraft.status, 'imported')
const dr2 = await yes(F, 'sb_draft', { action: 'create', title: 'Throwaway' })
await yes(F, 'sb_draft', { action: 'delete', draft_id: dr2.id })
await no(X, 'sb_draft', { action: 'get', draft_id: dr2.id }, 'NOT_FOUND', 'someone else\'s draft')
const draftEvents = (await yes(P, 'sb_audit', { action: 'list', type: 'draft', via_mcp: true, limit: 50 })).events.filter(e => [dr.id, dr2.id].includes(e.target_id))
assert.deepEqual(draftEvents.map(e => e.event_type).sort(), ['draft.created', 'draft.created', 'draft.deleted', 'draft.saved', 'draft.updated'])
assert.ok(draftEvents.every(e => e.detail.token_name === 'Agent full (Ada)' && !JSON.stringify(e.detail).includes('Vendors')), 'draft audit: token, never the text')
ok('sb_draft: create / update / list / get / save / delete (full); each audited with the token, no draft text')

// --- sb_note
await levelRefusal('sb_note', { action: 'create', document: imported.document_id, quote: 'the night ferry', body: 'x' })
const note = await yes(F, 'sb_note', { action: 'create', document: imported.document_id, quote: 'the night ferry', body: 'Does the ferry run in winter?' })
await yes(F, 'sb_note', { action: 'update', note_id: note.id, status: 'ready' })
assert.ok((await yes(P, 'sb_note', { action: 'list', status: 'ready' })).notes.some(n => n.id === note.id))
await no(F, 'sb_note', { action: 'create', document: imported.document_id, quote: 'the night ferry', body: '   ' }, 'BAD_INPUT', 'empty note')
ok('sb_note: create / update (full), list (read)')

// --- sb_library
const lib = await yes(P, 'sb_library', { action: 'get' })
assert.ok(lib.folders.length && lib.kinds.includes('scene'))
await levelRefusal('sb_library', { action: 'folder_create', name: 'x' })
const fld = await yes(F, 'sb_library', { action: 'folder_create', name: `Ferries ${run}` })
await yes(F, 'sb_library', { action: 'folder_rename', folder_id: fld.id, name: `Ferry runs ${run}` })
const tag = await yes(F, 'sb_library', { action: 'tag_create', name: `ferry-${run}`, color: 'good' })
await yes(F, 'sb_library', { action: 'tag_update', tag_id: tag.id, color: 'warn' })
await yes(F, 'sb_library', { action: 'organise', documents: [imported.filename], folder_id: fld.id, add_tags: [tag.id], kind: 'scene' })
await no(F, 'sb_library', { action: 'organise', documents: [imported.filename] }, 'BAD_INPUT', 'organise nothing')
// Archive (full): hidden from the document list (flagged in sb_list_documents), then back.
await levelRefusal('sb_library', { action: 'organise', documents: [imported.filename], archived: true })
await yes(F, 'sb_library', { action: 'organise', documents: [imported.filename], archived: true })
assert.equal((await ada('/api/documents')).data.some(d => d.id === imported.document_id), false, 'archived: not in the list')
assert.equal((await yes(P, 'sb_list_documents', { query: imported.filename.replace(/\.md$/, '') })).documents.find(d => d.file === imported.filename)?.archived, true)
await yes(F, 'sb_library', { action: 'organise', documents: [imported.filename], archived: false })
assert.equal((await ada('/api/documents')).data.some(d => d.filename === imported.filename), true, 'unarchived: back in the list')
await yes(F, 'sb_library', { action: 'tag_delete', tag_id: tag.id })
await yes(F, 'sb_library', { action: 'folder_delete', folder_id: fld.id })
ok('sb_library: folders, tags, organise, archive / unarchive (full)')

// --- sb_images
const odoId = odo.data.id
await levelRefusal('sb_images', { action: 'upload', target_type: 'entity', target: odoId, image_base64: PNG, filename: 'odo.png' })
const up = await yes(F, 'sb_images', { action: 'upload', target_type: 'entity', target: 'Odo', image_base64: PNG, filename: 'odo.png', caption: 'Concept' })
const img = up.image
assert.ok(img?.id && img.caption === 'Concept', JSON.stringify(up))
const imgs = await yes(P, 'sb_images', { action: 'list', target_type: 'entity', target: 'Odo' })
assert.ok(imgs.images.some(i => i.id === img.id))
await yes(F, 'sb_images', { action: 'caption', image_id: img.id, caption: 'Concept, v2' })
await yes(F, 'sb_images', { action: 'delete', image_id: img.id })
await no(F, 'sb_images', { action: 'generate', target_type: 'entity', target: 'Odo', prompt: 'Odo at dusk' }, 'BAD_INPUT', 'generate without an image model (409)')
await no(F, 'sb_images', { action: 'upload', target_type: 'entity', target: 'Odo', image_base64: Buffer.from('not an image').toString('base64'), filename: 'odo.png' }, 'BAD_INPUT', 'not an image')
ok('sb_images: upload / list / caption / delete; generate offline refused')

// --- sb_continuity (recorded run replays in mock mode)
const contText = JSON.parse(readFileSync(new URL('../server/assets/continuity/recorded.json', import.meta.url), 'utf8'))[0].text
const crun = await yes(P, 'sb_continuity', { action: 'run', text: contText })
assert.ok(crun.id && Array.isArray(crun.report?.findings ?? crun.findings), JSON.stringify(crun).slice(0, 300))
await yes(P, 'sb_continuity', { action: 'get', run_id: crun.id })
await no(P, 'sb_continuity', { action: 'get', run_id: 'ctn_nope' }, 'NOT_FOUND', 'unknown run')
await no(P, 'sb_continuity', { action: 'run' }, 'BAD_INPUT', 'no text')
ok('sb_continuity: run (propose) and get')

// --- sb_research (the recorded fixture answers in mock mode)
const RQ = 'How far does Europa orbit from Jupiter, and what is the one-way light delay from Earth to Europa at 628 million km?'
const rr = await yes(P, 'sb_research', { action: 'run', question: RQ })
const rnote = rr.notes[0]
assert.ok(rnote?.id, JSON.stringify(rr).slice(0, 300))
assert.ok((await yes(P, 'sb_research', { action: 'list' })).notes.some(n => n.id === rnote.id))
await yes(P, 'sb_research', { action: 'get', note_id: rnote.id })
const promoted = await yes(P, 'sb_research', { action: 'promote', note_id: rnote.id, as: 'fact', kind: 'claim', statement: `Europa orbits far from Jupiter (${run}).`, subject: 'Europa', predicate: 'orbits', object: 'Jupiter', quote: rnote.question.slice(0, 40) })
assert.equal(promoted.status, 'pending')
await levelRefusal('sb_research', { action: 'pin', note_id: rnote.id, document: imported.document_id, quote: 'the night ferry' })
await yes(F, 'sb_research', { action: 'pin', note_id: rnote.id, document: imported.document_id, quote: 'Odo waits at the Salt Gate' })
await yes(F, 'sb_research', { action: 'unpin', note_id: rnote.id })
await no(P, 'sb_research', { action: 'promote', note_id: rnote.id, as: 'fact', statement: 'x', subject: 'x', quote: 'words that are not in the note anywhere' }, 'BAD_INPUT', 'promote with a quote not in the note')
ok('sb_research: run / list / get / promote (propose), pin / unpin (full)')

// --- sb_conversation
// Posting in Ask is propose level (viewers post in the app too); renaming is full.
const conv = await yes(P, 'sb_conversation', { action: 'start', text: 'Who stands watch at the Bell Gate on Day 2?', mode: 'canon' })
const convId = conv.conversation.id
await yes(P, 'sb_conversation', { action: 'post', conversation_id: convId, text: 'And on Day 3?' })
await levelRefusal('sb_conversation', { action: 'rename', conversation_id: convId, title: 'x' })
await yes(F, 'sb_conversation', { action: 'rename', conversation_id: convId, title: 'Bell Gate watch' })
assert.ok((await yes(P, 'sb_conversation', { action: 'list' })).conversations.some(x => x.id === convId))
assert.ok((await yes(P, 'sb_conversation', { action: 'read', conversation_id: convId })).messages.length >= 4)
await no(X, 'sb_conversation', { action: 'read', conversation_id: convId }, 'NOT_FOUND', 'other project conversation')
const askEvents = (await yes(P, 'sb_audit', { action: 'list', via_mcp: true, limit: 100 })).events.filter(e => e.target_id === convId)
assert.deepEqual(askEvents.map(e => `${e.event_type}:${e.detail.token_name}`).sort(), ['conversation.created:Claude Code (Ada)', 'conversation.renamed:Agent full (Ada)', 'message.posted:Claude Code (Ada)', 'message.posted:Claude Code (Ada)'])
ok('sb_conversation: start / post (propose), rename (full), list / read; each post audited message.posted with the token')

// --- sb_export, sb_share, sb_audit, sb_metrics, sb_agent_runs, sb_search
const ex1 = await yes(V, 'sb_export', { action: 'bible', format: 'md', max_chars: 5000 })
assert.ok(ex1.text.startsWith('#') && ex1.total_chars > 5000 && ex1.next_cursor === '5000')
const ex2 = await yes(V, 'sb_export', { action: 'bible', format: 'md', max_chars: 5000, cursor: ex1.next_cursor })
assert.ok(ex2.text.length > 0 && ex2.text !== ex1.text)
const manu = await yes(P, 'sb_export', { action: 'bible', format: 'json', book: 'manuscript', scope: 'folder', folder_id: lib.folders[0].id })
assert.ok(manu.counts?.documents >= 0, JSON.stringify(manu).slice(0, 200))
await no(P, 'sb_export', { action: 'bible', scope: 'entities' }, 'BAD_INPUT', 'entities scope without entities')
await levelRefusal('sb_share', { action: 'create', name: 'x' })
await no(V, 'sb_share', { action: 'create', name: 'Viewer link' }, 'FORBIDDEN', 'viewer shares')
const share = await yes(F, 'sb_share', { action: 'create', name: `Writers ${run}`, days: 7 })
assert.ok(share.token && share.url.startsWith('/share/'))
assert.ok((await yes(P, 'sb_share', { action: 'list' })).some(sh => sh.id === share.id))
await yes(F, 'sb_share', { action: 'revoke', share_id: share.id })
const viaAgent = await yes(P, 'sb_audit', { action: 'list', via_mcp: true, limit: 200 })
const offAgent = viaAgent.events.filter(e => !(e.detail.via === 'mcp' && e.detail.token_id && e.detail.token_name && e.actor_name === (e.detail.token_name === 'Bo full' ? 'Bo' : 'Ada')))
assert.ok(viaAgent.events.length > 20 && !offAgent.length, JSON.stringify(offAgent.slice(0, 3)))
const types = new Set(viaAgent.events.map(e => e.event_type))
for (const t of ['change.created', 'note.created', 'document.imported', 'entity.created', 'share.created'])
  assert.ok(types.has(t), `audited via mcp: ${t}`)
for (const t of ['candidate.accepted', 'candidate.corrected_and_accepted', 'candidate.rejected', 'candidate.bulk_accepted', 'change.accepted', 'change.applied', 'change.rejected', 'change.reverted', 'citation.confirmed', 'citation.kept', 'conflict.confirmed', 'conflict.false_positive', 'conflict.uncertain', 'conflict.severity', 'entity.merged'])
  assert.ok(!types.has(t), `no canon decision via mcp: ${t}`)
const exportedAudit = await yes(P, 'sb_audit', { action: 'export', format: 'md' })
assert.ok(exportedAudit.text.startsWith('# CanonTracker audit log'))
await no(P, 'sb_audit', { action: 'list', limit: 1000 }, 'BAD_INPUT', 'limit over the cap')
const stats = await yes(V, 'sb_metrics', { action: 'stats' })
assert.ok(stats.canon > 0)
await yes(P, 'sb_metrics', { action: 'eval_runs' })
await yes(P, 'sb_metrics', { action: 'eval_run' })
await no(P, 'sb_metrics', { action: 'reset' }, 'BAD_INPUT', 'unknown action')
const runs = await yes(P, 'sb_agent_runs', { action: 'list', purpose: 'continuity', limit: 3 })
assert.ok(runs.runs.length >= 1 && runs.runs[0].agent === 'Continuity')
await no(P, 'sb_agent_runs', { action: 'list', purpose: 'mind_reading' }, 'BAD_INPUT', 'unknown purpose')
const found = await yes(V, 'sb_search', { action: 'search', query: 'salt' })
assert.ok(found.facts.length + found.entities.length + found.documents.length > 0)
await no(V, 'sb_search', { action: 'search', query: '' }, 'BAD_INPUT', 'empty search')
ok('sb_export (paged md, manuscript json), sb_share, sb_audit (via mcp + token on every agent write), sb_metrics, sb_agent_runs, sb_search')

// Viewer with a full token: reads work; every write is refused by the live role (spot-check one per area above, plus these).
for (const [name, args] of [['sb_note', { action: 'create', document: imported.document_id, quote: 'the night ferry', body: 'x' }], ['sb_entity', { action: 'create', name: 'Viewer page', type: 'character' }],
  ['sb_library', { action: 'tag_create', name: 'v' }], ['sb_draft', { action: 'create', title: 'v' }], ['sb_conflict', { action: 'scan' }], ['sb_task', { action: 'update', task_id: task.id, status: 'open' }]])
  await no(V, name, args, 'FORBIDDEN', `viewer ${name} ${args.action}`)
ok('viewer role refuses writes even with a full token')

// Body cap: a 400 KB document passes for sb_document; the same size for any other tool is a 413.
const bigText = `# Long scene\n\n${'The pass is quiet tonight. '.repeat(16_000)}\n`
const bigDoc = await yes(F, 'sb_document', { action: 'import', filename: `long-scene-${run}.md`, text: bigText })
assert.equal(bigDoc.status, 'imported')
const bigOther = await rawMcp({ authorization: `Bearer ${adaFullTok.secret}` }, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'sb_search', arguments: { action: 'search', query: 'x', pad: 'x'.repeat(400_000) } } }))
assert.equal(bigOther.status, 413)
ok('body cap: 400 KB through sb_document, 413 for other tools')

for (const t of PANEL_TOOLS) assert.ok(tested.get(t)?.ok && tested.get(t)?.refused, `${t}: a success and a refusal`)
ok('every panel tool has at least one success and one refusal', PANEL_TOOLS.length)
await P.close(); await F.close(); await V.close(); await X.close()

// ===================== End to end on a fresh Ashbell Pass project: agents read, check and propose; a person decides =====================
const homeProject = (await ada('/api/me')).data.projects.find(p => p.name === 'The Ashbell Pass')
const e2eProject = (await ada('/api/projects', { method: 'POST', body: { name: 'Ashbell E2E', studio_id: studio.id } })).data
assert.equal((await ada('/api/demo/load', { method: 'POST', body: { set: 'ashbell-pass' } })).status, 200)
// The demo's recorded candidates: a person accepts them in the app, one confirmation with the fingerprints Review showed.
const e2ePending = (await ada('/api/facts?status=pending')).data
assert.equal((await ada('/api/facts/accept-verified', { method: 'POST', body: { items: e2ePending.map(f => ({ id: f.id, fingerprint: candidateFingerprint(f) })) } })).status, 200)
const e2eFull = (await ada('/api/agent-tokens', { method: 'POST', body: { name: 'E2E agent', level: 'full' } })).data
const e2eProp = (await ada('/api/agent-tokens', { method: 'POST', body: { name: 'E2E proposer' } })).data
const E = await connect(e2eFull.secret)
const EP = await connect(e2eProp.secret)
assert.equal((await okCall(E, 'sb_list_projects', {})).projects[0].id, e2eProject.id)
const scene = `# The night ferry\n\nThe ferryman Halvard rows travellers across the Ember Well channel every night.\n\nHalvard refuses to sail when the Ashbell has rung that day.\n`
const e2eDoc = await okCall(E, 'sb_document', { action: 'import', filename: `S30-night-ferry-${run}.md`, text: scene })
const e2eEx = await okCall(EP, 'sb_document', { action: 'extract', document: e2eDoc.document_id })
assert.equal(e2eEx.created, 0) // recorded mode has no output for a new text, and says so
const cand = await okCall(EP, 'sb_review', { action: 'add', document: e2eDoc.filename, quote: 'The ferryman Halvard rows travellers across the Ember Well channel every night.',
  statement: 'Halvard rows travellers across the Ember Well channel every night.', kind: 'claim', subject: 'Halvard', predicate: 'rows_across', object: 'Ember Well channel' })
assert.equal(cand.status, 'pending')
const e2eCanon = (await okCall(EP, 'sb_review', { action: 'list', status: 'canon', limit: 1 })).facts[0]
const e2eChange = await okCall(EP, 'sb_change', { action: 'propose', fact_id: e2eCanon.id, proposed_statement: `${e2eCanon.statement.replace(/\.$/, '')} (revised ${run}).`, rationale: 'Pacing.' })
const reanalysed = await okCall(E, 'sb_change', { action: 'analyze', change_id: e2eChange.id })
assert.ok(Array.isArray(reanalysed.impact))
await okCall(E, 'sb_conflict', { action: 'scan' })
const e2eOpen = (await okCall(E, 'sb_list_conflicts', { status: 'open' })).conflicts[0]
await okCall(E, 'sb_note', { action: 'create', document: e2eDoc.document_id, quote: 'Halvard refuses to sail', body: 'Tie this to the Ashbell rule.' })
const e2eBible = await okCall(E, 'sb_export', { action: 'bible', format: 'md', max_chars: 50000 })
assert.ok(e2eBible.total_chars > 0 && e2eBible.text.includes('#'))
// The agent stops at proposals: deciding is refused for both tokens, and nothing it proposed is canon.
for (const [cl, name, args] of [[EP, 'sb_review', { action: 'accept', fact_id: cand.id }], [E, 'sb_review', { action: 'accept', fact_id: cand.id, rationale: 'Stated in the new scene.' }],
  [E, 'sb_change', { action: 'decide', change_id: e2eChange.id, decision: 'accept', rationale: 'Approved.' }], [E, 'sb_conflict', { action: 'decide', conflict_id: e2eOpen.id, decision: 'false_positive', rationale: 'Different evenings.' }]])
  refused(await callR(cl, name, args), 'FORBIDDEN', `e2e: ${name} ${args.action} through an agent`)
refused(await callR(EP, 'sb_get_fact', { fact_id: cand.id }), 'NOT_CANON', 'e2e: the proposal is not canon yet')
// A person accepts the pending proposal through the web API; the agent then reads it as canon, decided by that person.
assert.equal((await ada(`/api/facts/${cand.id}/review`, { method: 'POST', body: { decision: 'accept', rationale: 'Stated in the new scene.' } })).status, 200)
assert.equal((await okCall(EP, 'sb_get_fact', { fact_id: cand.id })).status, 'canon')
const e2eAccepted = (await ada('/api/facts?status=canon')).data.find(f => f.id === cand.id)
assert.deepEqual([e2eAccepted.decided_by_name, e2eAccepted.decided_via ?? null], ['Ada', null])
const e2eAudit = []
for (let at = '0'; at;) {
  const pg = await okCall(EP, 'sb_audit', { action: 'list', via_mcp: true, limit: 20, cursor: at })
  e2eAudit.push(...pg.events); at = pg.next_cursor
}
const e2eTypes = e2eAudit.map(e => `${e.event_type}:${e.detail.token_name}`)
for (const t of ['document.imported:E2E agent', 'document.reextracted:E2E proposer', 'fact.authored:E2E proposer', 'change.created:E2E proposer', 'note.created:E2E agent', 'bible.exported:E2E agent'])
  assert.ok(e2eTypes.includes(t), `e2e audit has ${t}: ${e2eTypes.join(' ')}`)
assert.ok(e2eAudit.every(e => e.detail.via === 'mcp' && e.detail.token_id && e.actor_name === 'Ada'))
assert.ok(!e2eAudit.some(e => ['candidate.accepted', 'candidate.corrected_and_accepted', 'candidate.rejected', 'candidate.bulk_accepted', 'change.accepted', 'change.applied', 'change.rejected', 'change.reverted', 'citation.confirmed', 'citation.kept', 'conflict.confirmed', 'conflict.false_positive', 'conflict.uncertain', 'conflict.severity', 'entity.merged'].includes(e.event_type)), `no decision via mcp: ${e2eTypes.join(' ')}`)
await E.close(); await EP.close()
await ada(`/api/projects/${homeProject.id}/switch`, { method: 'POST' })
ok('end to end: an agent imports, extracts, proposes, scans, notes and exports through MCP; its decisions are FORBIDDEN; a person accepts the pending proposal in the app', `${e2eAudit.length} agent events`)

// --- Viewer token: every read works, propose refused.
const b = await connect(boTok.secret)
const reads = { sb_list_projects: {}, sb_get_context_pack: { topic: 'Odo' }, sb_search_facts: { query: 'Ashbell' }, sb_get_fact: { fact_id: withQuote.id },
  sb_list_documents: {}, sb_read_document: { document: s03.id }, sb_list_entities: {}, sb_get_entity: { entity: 'Odo' }, sb_get_timeline: {},
  sb_ask: { question: 'Who stands watch at the Bell Gate?' }, sb_check_facts: { facts: [{ subject: 'Odo', predicate: 'located_at', object: 'Saltgate', time_from: 'D1 10:00' }] },
  sb_list_conflicts: {}, sb_get_impact: { fact_id: withQuote.id }, sb_list_recheck: {}, sb_list_tasks: {} }
assert.deepEqual(Object.keys(reads).sort(), TOOL_NAMES.filter(n => n !== 'sb_propose_candidate'))
// (The panel tools' viewer refusals are checked in the panel section above.)
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
const after = (await ada('/api/agent-tokens')).data.tokens.find(t => t.id === adaTok.id)
assert.ok(after.revoked_at && after.last_used_at)
ok('revoked token 401; last-used and revoked recorded')
console.log('\nmcp probe passed')
