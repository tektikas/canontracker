// Library probe against a running server: node scripts/library-probe.mjs [baseUrl]
// A fresh owner with the demo set: upload many files at once (bad type, too big and empty ones refused), a same-named file
// becomes a new version and unchanged text is skipped, folders/tags/kind/title never touch a document's text or hash,
// a version diff names the changed passages and the canon citing them, re-extract only adds pending candidates and skips
// what the project already has, and another studio gets 404 while a viewer gets 403.
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
  return call
}
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual).slice(0, 80)})`) }
async function account(name) {
  const c = client()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  return c
}
const filesForm = (files, folder) => {
  const f = new FormData()
  for (const [name, text] of files) f.append('files', new Blob([text], { type: 'text/markdown' }), name)
  if (folder) f.append('folder_id', folder)
  return f
}

const a = await account('Ada')
const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Library Studio' } })).data
await a('/api/projects', { method: 'POST', body: { name: 'Broken Tide', studio_id: studio.id } })
check('demo set loads', (await a('/api/demo/load', { method: 'POST' })).status, 200)
const demoDocs = (await a('/api/documents')).data
check('demo has 13 documents', demoDocs.length, 13)

// 1. Upload many at once, with the refusals a person can hit.
const folder = (await a('/api/library/folders', { method: 'POST', body: { name: 'Notes' } })).data
const many = [1, 2, 3, 4, 5].map(i => [`note-${i}.md`, `# Note ${i}\n\nThe tide turns on day ${i}.\n\nKeeper ${i} lights the lamp.`])
const big = 'x'.repeat(1_000_001)
const up = (await a('/api/documents', { method: 'POST', form: filesForm([...many, ['cover.pdf', '%PDF'], ['huge.md', big], ['empty.md', '\n\n']], folder.id) })).data.results
check('five files import in one request', up.filter(r => r.status === 'imported').length, 5)
check('a .pdf is refused with a plain reason', up.find(r => r.filename === 'cover.pdf').error, 'Not a text file: use .md or .txt.')
check('a file over 1 MB is refused', up.find(r => r.filename === 'huge.md').error, 'Too big: the limit is 1 MB per file.')
check('an empty file is refused', up.find(r => r.filename === 'empty.md').status, 'error')
let docs = (await a('/api/documents')).data
check('uploaded files land in the chosen folder', docs.filter(d => d.filename.startsWith('note-')).every(d => d.folder_id === folder.id), true)

// 2. Same name → new version; same text → skipped, naming the version it matches.
const v2 = (await a('/api/documents', { method: 'POST', form: filesForm([['note-1.md', '# Note 1\n\nThe tide turns on day 9.\n\nKeeper 1 lights the lamp.']]) })).data.results[0]
check('same filename becomes version 2', v2.version, 2)
const again = (await a('/api/documents', { method: 'POST', form: filesForm([['note-1.md', '# Note 1\n\nThe tide turns on day 9.\n\nKeeper 1 lights the lamp.']]) })).data.results[0]
check('unchanged text is skipped', again.status, 'duplicate')
check('the skip names the matching version', again.same_as.version, 2)
const note1 = (await a(`/api/documents/${v2.document_id}`)).data
check('version 2 stays in the folder of version 1', note1.folder?.id, folder.id)
check('the document lists both versions', note1.versions.map(v => v.version), [2, 1])
check('versions say who and how', [note1.versions[0].created_by_name, note1.versions[0].origin], ['Ada', 'import'])

// 3. Folders and tags.
const sub = (await a('/api/library/folders', { method: 'POST', body: { name: 'Islands', parent_id: folder.id } })).data
check('a subfolder is allowed', typeof sub.id, 'string')
check('a third level is refused', (await a('/api/library/folders', { method: 'POST', body: { name: 'Deep', parent_id: sub.id } })).status, 400)
check('a duplicate folder name is refused', (await a('/api/library/folders', { method: 'POST', body: { name: 'notes' } })).status, 409)
check('a blank folder name is refused', (await a('/api/library/folders', { method: 'POST', body: { name: '  ' } })).status, 400)
check('rename a folder', (await a(`/api/library/folders/${folder.id}`, { method: 'PATCH', body: { name: 'Field notes' } })).data.name, 'Field notes')
const tag = (await a('/api/library/tags', { method: 'POST', body: { name: 'Act 1', color: 'good' } })).data
const tag2 = (await a('/api/library/tags', { method: 'POST', body: { name: 'Needs pass', color: 'warn' } })).data
check('a colour outside the design tokens is refused', (await a('/api/library/tags', { method: 'POST', body: { name: 'Hot', color: '#ff0000' } })).status, 400)
check('recolour a tag', (await a(`/api/library/tags/${tag2.id}`, { method: 'PATCH', body: { color: 'bad' } })).data.color, 'bad')

// 4. Organising never touches text or hash.
const s04 = demoDocs.find(d => d.filename === 'S04.md')
const lore = demoDocs.find(d => d.filename === 'lore-chord-stone.md')
const before = await Promise.all([s04, lore, ...docs.filter(d => d.filename.startsWith('note-'))].map(async d => (await a(`/api/documents/${d.id}`)).data))
const ids = [s04.id, lore.id]
check('move to a folder', (await a('/api/library/organise', { method: 'POST', body: { document_ids: ids, folder_id: sub.id } })).status, 200)
check('add tags', (await a('/api/library/organise', { method: 'POST', body: { document_ids: [...ids, note1.id], add_tags: [tag.id, tag2.id] } })).status, 200)
check('remove a tag', (await a('/api/library/organise', { method: 'POST', body: { document_ids: [note1.id], remove_tags: [tag2.id] } })).status, 200)
check('set kind', (await a('/api/library/organise', { method: 'POST', body: { document_ids: [lore.id], kind: 'location' } })).status, 200)
check('a kind outside the list is refused', (await a('/api/library/organise', { method: 'POST', body: { document_ids: [lore.id], kind: 'poem' } })).status, 400)
check('rename a document', (await a('/api/library/organise', { method: 'POST', body: { document_ids: [note1.id], title: 'Day nine note' } })).status, 200)
check('renaming two at once is refused', (await a('/api/library/organise', { method: 'POST', body: { document_ids: ids, title: 'x' } })).status, 400)
check('an empty action is refused', (await a('/api/library/organise', { method: 'POST', body: { document_ids: ids } })).status, 400)
const after = await Promise.all(before.map(async d => (await a(`/api/documents/${d.id}`)).data))
check('text, hash and passages are unchanged after organising', after.map(d => [d.content, d.sha256, d.passages.map(p => p.text).join('|')]), before.map(d => [d.content, d.sha256, d.passages.map(p => p.text).join('|')]))
const v1note = (await a(`/api/documents/${note1.versions[1].id}`)).data
check('labels apply to every version', [v1note.title, v1note.folder?.id], ['Day nine note', folder.id])
docs = (await a('/api/documents')).data
const row = fn => docs.find(d => d.filename === fn)
check('list carries folder, tags and kind', [row('S04.md').folder_id, row('S04.md').tags.length, row('lore-chord-stone.md').kind], [sub.id, 2, 'location'])
check('note-1 keeps one tag', row('note-1.md').tags, [tag.id])

// 5. Diff + stale facts. Accept an S04 candidate, then upload S04 v2 with that passage edited, one removed, one added.
const pending = (await a('/api/facts?status=pending')).data
const cand = pending.find(f => f.evidence.some(e => e.document_filename === 'S04.md' && e.verified))
check('accept an S04 candidate', (await a(`/api/facts/${cand.id}/review`, { method: 'POST', body: { decision: 'accept' } })).data.status, 'canon')
const s04v1 = (await a(`/api/documents/${s04.id}`)).data
const cited = s04v1.passages.find(p => p.id === cand.evidence[0].passage_id)
const text = s04v1.content.replace(cited.text, `${cited.text} Then the bell rang twice.`)
const s04v2 = (await a('/api/documents', { method: 'POST', form: filesForm([['S04.md', text]]) })).data.results[0]
check('S04 v2 imported', s04v2.version, 2)
check('v2 keeps the folder, tags and kind', [(await a(`/api/documents/${s04v2.document_id}`)).data.folder?.id, (await a(`/api/documents/${s04v2.document_id}`)).data.tags.length], [sub.id, 2])
const diff = (await a(`/api/documents/${s04v2.document_id}/diff?from=${s04.id}`)).data
const changedRow = diff.rows.find(r => r.op === 'changed' && r.from.id === cited.id)
check('diff marks the cited passage as changed', !!changedRow, true)
check('word diff shows exactly the added words', changedRow.words.filter(w => w.t === 'ins').map(w => w.text).join('').trim(), 'Then the bell rang twice.')
check('every other passage is unchanged', [diff.counts.same, diff.counts.removed, diff.counts.added], [s04v1.passages.length - 1, 0, 0])
check('the changed passage lists the canon fact citing it', changedRow.facts.map(f => f.id), [cand.id])
check('re-check count', diff.recheck, 1)
const n2 = docs.find(d => d.filename === 'note-2.md')
const n2v2 = (await a('/api/documents', { method: 'POST', form: filesForm([['note-2.md', '# Note 2\n\nKeeper 2 lights the lamp.\n\nA new closing line.']]) })).data.results[0]
const d2 = (await a(`/api/documents/${n2v2.document_id}/diff?from=${n2.id}`)).data
check('diff marks a removed and an added passage', d2.rows.map(r => r.op), ['same', 'removed', 'same', 'added'])
check('nothing cites the removed text, so nothing to re-check', d2.recheck, 0)
// A passage removed right before an edited one: the edit pairs with its own old text, not with the removed one.
const n3 = docs.find(d => d.filename === 'note-3.md')
const n3v2 = (await a('/api/documents', { method: 'POST', form: filesForm([['note-3.md', '# Note 3\n\nKeeper 3 lights the big lamp.']]) })).data.results[0]
const d3 = (await a(`/api/documents/${n3v2.document_id}/diff?from=${n3.id}`)).data
check('a removal next to an edit is told apart', d3.rows.map(r => r.op), ['same', 'removed', 'changed'])
check('the edit pairs with its own old text', d3.rows[2].from.text, 'Keeper 3 lights the lamp.')
check('same text on both sides has no changes', (await a(`/api/documents/${s04v2.document_id}/diff?from=${s04v2.document_id}`)).data.counts.changed, 0)
check('diff across two documents is refused', (await a(`/api/documents/${s04v2.document_id}/diff?from=${lore.id}`)).status, 404)
docs = (await a('/api/documents')).data
check('the list counts the stale fact on S04', row('S04.md').stale_facts, 1)

// 6. Re-extract: only pending candidates, deduplicated.
const stats0 = (await a('/api/stats')).data
const re1 = (await a(`/api/documents/${s04v2.document_id}/extract`, { method: 'POST' })).data
check('re-extract of an already extracted document adds nothing', re1.created, 0)
check('it says what it skipped', re1.skipped > 0, true)
check('it says recorded mode covers this demo file', [re1.mode, re1.recorded_covers], ['mock', true])
const stats1 = (await a('/api/stats')).data
check('pending and canon counts are unchanged', [stats1.pending, stats1.canon], [stats0.pending, stats0.canon])
// A candidate a person corrected into something else: the model's original reading is new to the project again.
const s05 = demoDocs.find(d => d.filename === 'S05.md')
const c5 = pending.find(f => f.status === 'pending' && f.evidence.some(e => e.document_filename === 'S05.md' && e.verified))
await a(`/api/facts/${c5.id}/review`, { method: 'POST', body: { decision: 'correct_and_accept', corrected: { statement: `Probe correction ${run}.`, subject: `Probe ${run}`, object: null } } })
const stats2 = (await a('/api/stats')).data
const re2 = (await a(`/api/documents/${s05.id}/extract`, { method: 'POST' })).data
check('re-extract adds the one reading the project no longer has', re2.created, 1)
const stats3 = (await a('/api/stats')).data
check('it only adds a pending candidate; canon is untouched', [stats3.pending - stats2.pending, stats3.canon - stats2.canon], [1, 0])
check('running it again adds nothing', (await a(`/api/documents/${s05.id}/extract`, { method: 'POST' })).data.created, 0)
const re3 = (await a(`/api/documents/${note1.id}/extract`, { method: 'POST' })).data
check('recorded mode says it has no output for an own file', [re3.recorded_covers, re3.created], [false, 0])

// 7. Audit sentences.
const events = new Set((await a('/api/audit')).data.map(e => e.event_type))
for (const t of ['folder.created', 'folder.renamed', 'tag.created', 'tag.updated', 'document.organised', 'document.version_added', 'document.reextracted'])
  check(`audit has ${t}`, events.has(t), true)

// 8. Another studio sees nothing; a viewer reads only.
const b = await account('Bea')
const sb = (await b('/api/studios', { method: 'POST', body: { name: 'Other Studio' } })).data
await b('/api/projects', { method: 'POST', body: { name: 'Other', studio_id: sb.id } })
check('other studio: document 404', (await b(`/api/documents/${s04.id}`)).status, 404)
check('other studio: diff 404', (await b(`/api/documents/${s04v2.document_id}/diff?from=${s04.id}`)).status, 404)
check('other studio: re-extract 404', (await b(`/api/documents/${s04.id}/extract`, { method: 'POST' })).status, 404)
check('other studio: organise 404', (await b('/api/library/organise', { method: 'POST', body: { document_ids: [s04.id], kind: 'lore' } })).status, 404)
check('other studio: rename folder 404', (await b(`/api/library/folders/${folder.id}`, { method: 'PATCH', body: { name: 'Mine' } })).status, 404)
check('other studio: delete tag 404', (await b(`/api/library/tags/${tag.id}`, { method: 'DELETE' })).status, 404)
check('other studio: upload into a foreign folder 404', (await b('/api/documents', { method: 'POST', form: filesForm([['x.md', '# X\n\nHello there world.']], folder.id) })).status, 404)
check('other studio sees no folders or tags', [(await b('/api/library')).data.folders.length, (await b('/api/library')).data.tags.length], [0, 0])

const link = (await a('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 1 } })).data
const v = await account('Vic')
await v(`/api/invites/${link.token}/accept`, { method: 'POST' })
await v(`/api/projects/${(await a('/api/me')).data.current.project.id}/switch`, { method: 'POST' })
check('viewer reads the library', (await v('/api/library')).data.folders.length, 2)
check('viewer reads a diff', (await v(`/api/documents/${s04v2.document_id}/diff?from=${s04.id}`)).status, 200)
check('viewer: upload 403', (await v('/api/documents', { method: 'POST', form: filesForm([['v.md', '# V\n\nViewer text here.']]) })).status, 403)
check('viewer: organise 403', (await v('/api/library/organise', { method: 'POST', body: { document_ids: [s04.id], kind: 'lore' } })).status, 403)
check('viewer: new folder 403', (await v('/api/library/folders', { method: 'POST', body: { name: 'V' } })).status, 403)
check('viewer: new tag 403', (await v('/api/library/tags', { method: 'POST', body: { name: 'V', color: 'good' } })).status, 403)
check('viewer: re-extract 403', (await v(`/api/documents/${s04.id}/extract`, { method: 'POST' })).status, 403)

// 9. Deleting a folder keeps its documents (they move up); deleting a tag only removes the label.
check('delete the subfolder', (await a(`/api/library/folders/${sub.id}`, { method: 'DELETE' })).data.documents, 2)
docs = (await a('/api/documents')).data
check('its documents moved up to the parent folder', [row('S04.md').folder_id, row('lore-chord-stone.md').folder_id], [folder.id, folder.id])
check('delete a tag', (await a(`/api/library/tags/${tag.id}`, { method: 'DELETE' })).data.documents, 3)
docs = (await a('/api/documents')).data
check('the label is gone, the documents stay', [row('note-1.md').tags.length, docs.length], [0, 13 + 5])
const ev2 = new Set((await a('/api/audit')).data.map(e => e.event_type))
check('audit has folder.deleted and tag.deleted', ev2.has('folder.deleted') && ev2.has('tag.deleted'), true)
console.log('\nlibrary probe: all checks passed')
