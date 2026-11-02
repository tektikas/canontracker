// Library probe against a running server: node scripts/library-probe.mjs [baseUrl]
// A fresh owner with the demo set: upload many files at once (bad type, too big and empty ones refused), a same-named file
// becomes a new version and unchanged text is skipped, folders/tags/kind/title never touch a document's text or hash,
// a version diff names the changed passages and the canon citing them (also in a 2,002-passage document), re-extract only adds
// pending candidates and skips what the project already has, an upload skips candidates already decided, a version is matched
// by name within its folder (moves keep identity), a new version carries pending candidates whose quote appears exactly once
// (never canon), audit/MCP/source refs show the file name and current folder (never the internal key), and another studio gets
// 404 while a viewer gets 403. The history page opens on a non-empty older → newer diff from any version.
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
const count = (text, q) => text.split(q).length - 1
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
const upTo0 = async (name, text, f) => (await a('/api/documents', { method: 'POST', form: filesForm([[name, text]], f) })).data.results[0]
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

// 2. Same name in the same folder → new version; same text → skipped, naming the version it matches.
const v2 = (await a('/api/documents', { method: 'POST', form: filesForm([['note-1.md', '# Note 1\n\nThe tide turns on day 9.\n\nKeeper 1 lights the lamp.']], folder.id) })).data.results[0]
check('same filename in the same folder becomes version 2', v2.version, 2)
check('the result says where the version landed', v2.folder, 'Notes')
const again = (await a('/api/documents', { method: 'POST', form: filesForm([['note-1.md', '# Note 1\n\nThe tide turns on day 9.\n\nKeeper 1 lights the lamp.']], folder.id) })).data.results[0]
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
// Extraction dedup (lead c18r #3): re-extracting S04 replays its recorded candidates; the accepted one and the still pending
// one are already in the project, so nothing new waits for review.
check('re-extracting S04 adds no candidate the project already has', ((r) => [r.created, r.skipped])((await a(`/api/documents/${s04.id}/extract`, { method: 'POST' })).data), [0, 2])
const s04v2 = (await a('/api/documents', { method: 'POST', form: filesForm([['S04.md', text]], sub.id) })).data.results[0]
check('S04 v2 imported', s04v2.version, 2)
// Recorded output belongs to the sample's own text: the edited v2 has none, so its upload proposes nothing.
check('S04 v2 (edited text) gets no recorded candidates', [s04v2.candidates, s04v2.skipped], [0, 0])
check('the accepted candidate does not come back as pending', (await a('/api/facts?status=pending')).data.filter(f => f.statement === cand.statement).length, 0)
// Pending evidence follows the new version when its quote appears exactly once there (lead c18r2 ruling b); canon never moves.
const pendingS04 = pending.filter(f => f.id !== cand.id && f.evidence.some(e => e.document_id === s04.id && e.verified))
const follows = pendingS04.filter(f => count(text, f.evidence[0].quote) === 1).map(f => f.id)
check('S04 has pending candidates whose quote is still there once', follows.length > 0, true)
check('the upload says how many pending candidates now cite v2', s04v2.evidence_moved, follows.length)
const afterS04 = new Map((await a('/api/facts?status=pending')).data.map(f => [f.id, f]))
check('those candidates cite v2, the passage with their quote', pendingS04.map(f => afterS04.get(f.id).evidence.map(e => [e.document_id === s04v2.document_id, e.verified, e.quote])),
  pendingS04.map(f => f.evidence.map(e => [follows.includes(f.id), 1, e.quote])))
check('they keep their origin and model', pendingS04.map(f => [afterS04.get(f.id).origin, afterS04.get(f.id).model_id]), pendingS04.map(f => [f.origin, f.model_id]))
const canonS04 = (await a('/api/facts?status=canon')).data.find(f => f.id === cand.id)
check('the accepted (canon) citation stays on v1, stale', [canonS04.evidence[0].document_id, canonS04.evidence[0].latest_version], [s04.id, 2])
const moved = (await a('/api/audit')).data.filter(e => e.event_type === 'candidate.evidence_moved' && e.target_id === follows[0])
check('the audit records where the quote was and where it is now', moved.map(e => [e.detail.filename, e.detail.from.version, e.detail.to.version, e.detail.to.document_id]), [['S04.md', 1, 2, s04v2.document_id]])
check('v2 keeps the folder, tags and kind', [(await a(`/api/documents/${s04v2.document_id}`)).data.folder?.id, (await a(`/api/documents/${s04v2.document_id}`)).data.tags.length], [sub.id, 2])
const diff = (await a(`/api/documents/${s04v2.document_id}/diff?from=${s04.id}`)).data
const changedRow = diff.rows.find(r => r.op === 'changed' && r.from.id === cited.id)
check('diff marks the cited passage as changed', !!changedRow, true)
check('word diff shows exactly the added words', changedRow.words.filter(w => w.t === 'ins').map(w => w.text).join('').trim(), 'Then the bell rang twice.')
check('every other passage is unchanged', [diff.counts.same, diff.counts.removed, diff.counts.added], [s04v1.passages.length - 1, 0, 0])
check('the changed passage lists the canon fact citing it', changedRow.facts.map(f => f.id), [cand.id])
check('re-check count', diff.recheck, 1)
const n4 = docs.find(d => d.filename === 'note-4.md')
await upTo0('note-4.md', '# Note 4\n\nThe tide turns on day 4.\n\nKeeper 4 lights the lamp.\n\nThe gulls circle the north wall.', folder.id)
const n4v1 = (await a('/api/documents')).data.find(d => d.name === 'note-4.md')
const fact4 = async (to, quote) => (await a('/api/facts', { method: 'POST', body: { to, document_id: n4v1.id, quote, kind: 'claim', subject: 'Note 4', predicate: 'says', statement: `${quote} (${to}, ${run}).` } })).data
const pAmb = await fact4('review', 'The tide turns on day 4')
const pGone = await fact4('review', 'Keeper 4 lights the lamp')
const pOnce = await fact4('review', 'The gulls circle the north wall')
const cOnce = await fact4('canon', 'The gulls circle the north')
check('pending and canon facts on note-4', [pAmb.status, pGone.status, pOnce.status, cOnce.status], ['pending', 'pending', 'pending', 'canon'])
const n4v2 = await upTo0('note-4.md', '# Note 4\n\nThe tide turns on day 4.\n\nThe tide turns on day 4, again.\n\nThe gulls circle the north wall at noon.', folder.id)
check('only the quote found exactly once moves', n4v2.evidence_moved, 1)
const cites = async (status, id) => (await a(`/api/facts?status=${status}`)).data.find(f => f.id === id).evidence[0].document_id
check('once: now cites v2; twice: stays (ambiguous); gone: stays; canon: stays', [await cites('pending', pOnce.id), await cites('pending', pAmb.id), await cites('pending', pGone.id), await cites('canon', cOnce.id)],
  [n4v2.document_id, n4v1.id, n4v1.id, n4v1.id])
const n2 = docs.find(d => d.filename === 'note-2.md')
const n2v2 = (await a('/api/documents', { method: 'POST', form: filesForm([['note-2.md', '# Note 2\n\nKeeper 2 lights the lamp.\n\nA new closing line.']], folder.id) })).data.results[0]
const d2 = (await a(`/api/documents/${n2v2.document_id}/diff?from=${n2.id}`)).data
check('diff marks a removed and an added passage', d2.rows.map(r => r.op), ['same', 'removed', 'same', 'added'])
check('nothing cites the removed text, so nothing to re-check', d2.recheck, 0)
// A passage removed right before an edited one: the edit pairs with its own old text, not with the removed one.
const n3 = docs.find(d => d.filename === 'note-3.md')
const n3v2 = (await a('/api/documents', { method: 'POST', form: filesForm([['note-3.md', '# Note 3\n\nKeeper 3 lights the big lamp.']], folder.id) })).data.results[0]
const d3 = (await a(`/api/documents/${n3v2.document_id}/diff?from=${n3.id}`)).data
check('a removal next to an edit is told apart', d3.rows.map(r => r.op), ['same', 'removed', 'changed'])
check('the edit pairs with its own old text', d3.rows[2].from.text, 'Keeper 3 lights the lamp.')
check('same text on both sides has no changes', (await a(`/api/documents/${s04v2.document_id}/diff?from=${s04v2.document_id}`)).data.counts.changed, 0)
check('diff across two documents is refused', (await a(`/api/documents/${s04v2.document_id}/diff?from=${lore.id}`)).status, 404)
docs = (await a('/api/documents')).data
check('the list counts the stale fact on S04', row('S04.md').stale_facts, 1)
// Large documents keep exact alignment (lead c18r #1): 2,002 passages, only the first and the last edited.
const bigText = n => Array.from({ length: n }, (_, i) => `Passage ${i}: the keeper counts tide ${i} at the north wall.`)
const bigV1 = bigText(2002)
const big1 = (await a('/api/documents', { method: 'POST', form: filesForm([['big.md', bigV1.join('\n\n')]]) })).data.results[0]
check('a 2,002-passage document imports', big1.passages, 2002)
const bigDoc = (await a(`/api/documents/${big1.document_id}`)).data
const midPassage = bigDoc.passages[1000]
const midFact = (await a('/api/facts', { method: 'POST', body: { to: 'canon', document_id: big1.document_id, passage_id: midPassage.id, quote: 'the keeper counts tide 1000', kind: 'claim', subject: 'Keeper', predicate: 'counts', object: 'Tide', statement: `The keeper counts tide 1000 (${run}).` } })).data
check('a canon fact cites an untouched middle passage', midFact.status, 'canon')
const bigV2 = [...bigV1]
bigV2[0] = 'Passage 0: the keeper counts tide 0 at the south wall.'
bigV2[2001] = 'Passage 2001: the keeper counts tide 2001 at the south wall.'
const big2 = (await a('/api/documents', { method: 'POST', form: filesForm([['big.md', bigV2.join('\n\n')]]) })).data.results[0]
const bigDiff = (await a(`/api/documents/${big2.document_id}/diff?from=${big1.document_id}`)).data
check('large diff: exactly the two edited passages changed', [bigDiff.counts.changed, bigDiff.counts.removed, bigDiff.counts.added, bigDiff.counts.same], [2, 0, 0, 2000])
check('large diff: the untouched citation is not flagged', [bigDiff.recheck, bigDiff.unchanged_citations], [0, 1])
const bigV3 = [...bigV2]
bigV3.splice(1000, 1, 'Passage 1000: the keeper counts tide 1000 at the south wall.')
bigV3.splice(500, 1)
bigV3.splice(1500, 0, 'A new passage in the middle of the night.')
const big3 = (await a('/api/documents', { method: 'POST', form: filesForm([['big.md', bigV3.join('\n\n')]]) })).data.results[0]
const bigDiff3 = (await a(`/api/documents/${big3.document_id}/diff?from=${big1.document_id}`)).data
check('large diff v1→v3: three edits, a removal and an insertion', [bigDiff3.counts.changed, bigDiff3.counts.removed, bigDiff3.counts.added, bigDiff3.counts.same], [3, 1, 1, 1998])
check('large diff: the edited cited passage is flagged', bigDiff3.rows.filter(r => r.facts.length).map(r => [r.op, r.facts[0].id]), [['changed', midFact.id]])
// The history page (server-rendered) never opens on an empty diff and always shows older → newer, from whichever version you came.
const comparing = async path => (/Comparing v(\d+) with v(\d+)/.exec((await a(path)).data) ?? []).slice(1).map(Number)
check('history opened from v1 compares the latest with the one before it', await comparing(`/documents/${big1.document_id}/history`), [2, 3])
check('history opened from v2 compares v2 with v1', await comparing(`/documents/${big2.document_id}/history`), [1, 2])
check('history opened from v3 compares v3 with v2', await comparing(`/documents/${big3.document_id}/history`), [2, 3])
check('a pair picked the wrong way round is swapped', await comparing(`/documents/${big1.document_id}/history?from=${big3.document_id}&to=${big1.document_id}`), [1, 3])
check('only "to" = the first version compares it with the next', await comparing(`/documents/${big1.document_id}/history?to=${big1.document_id}`), [1, 2])
check('a two-version document opened from v1 compares v1 with v2', await comparing(`/documents/${s04.id}/history`), [1, 2])

// Version identity is the file name within its folder (lead c18r #2); moving a document keeps its identity.
const actA = (await a('/api/library/folders', { method: 'POST', body: { name: 'Act A' } })).data
const actB = (await a('/api/library/folders', { method: 'POST', body: { name: 'Act B' } })).data
const actC = (await a('/api/library/folders', { method: 'POST', body: { name: 'Act C' } })).data
const upTo = async (name, text, f) => (await a('/api/documents', { method: 'POST', form: filesForm([[name, text]], f) })).data.results[0]
const sceneA = await upTo('scene.md', '# Scene\n\nThe tide is out in Act A.', actA.id)
const sceneB = await upTo('scene.md', '# Scene\n\nThe storm breaks in Act B.', actB.id)
check('same name in another folder is a new document', [sceneB.status, sceneB.version, sceneB.document_id !== sceneA.document_id], ['imported', 1, true])
check('the result says where it landed and where the other one is', [sceneB.folder, sceneB.same_name_in?.folder], ['Act B', 'Act A'])
const sceneA2 = await upTo('scene.md', '# Scene\n\nThe tide is out in Act A, and back by night.', actA.id)
check('same name in the same folder is the next version of that one', [sceneA2.version, sceneA2.folder], [2, 'Act A'])
const sceneB2 = await upTo('scene.md', '# Scene\n\nThe storm breaks in Act B at dawn.', actB.id)
check('the Act B file keeps its own version line', sceneB2.version, 2)
const sceneDocB = (await a(`/api/documents/${sceneB2.document_id}`)).data
check('the Act B document lists only its own versions', sceneDocB.versions.map(v => v.id), [sceneB2.document_id, sceneB.document_id])
check('diff across the two same-named documents is refused', (await a(`/api/documents/${sceneB2.document_id}/diff?from=${sceneA.document_id}`)).status, 404)
docs = (await a('/api/documents')).data
check('the list has both, each in its folder, both called scene.md', docs.filter(d => d.name === 'scene.md').map(d => d.folder_id).sort(), [actA.id, actB.id].sort())
check('move the Act A scene to Act C', (await a('/api/library/organise', { method: 'POST', body: { document_ids: [sceneA2.document_id], folder_id: actC.id } })).status, 200)
const sceneA3 = await upTo('scene.md', '# Scene\n\nThe tide is out in Act C now.', actC.id)
check('a moved document keeps its identity: the next upload where it is now is v3', [sceneA3.version, sceneA3.folder], [3, 'Act C'])
// The key of the Act B scene carries a folder ("Act B/scene.md"); it is identity only. Move it and nothing shows the old folder.
check('move the Act B scene to a new folder', (await a('/api/library/organise', { method: 'POST', body: { document_ids: [sceneB2.document_id], folder_id: (await a('/api/library/folders', { method: 'POST', body: { name: 'Act D' } })).data.id } })).status, 200)
const sceneBDoc = (await a(`/api/documents/${sceneB2.document_id}`)).data
const factB = (await a('/api/facts', { method: 'POST', body: { to: 'canon', document_id: sceneB2.document_id, quote: 'The storm breaks in Act B', kind: 'claim', subject: 'Storm', predicate: 'breaks', statement: `The storm breaks in Act B (${run}).` } })).data
const evB = (await a('/api/facts?status=canon')).data.find(f => f.id === factB.id).evidence[0]
check('a source ref shows the file name and the folder it is in now', [evB.document_filename, evB.document_folder], ['scene.md', 'Act D'])
const sceneB3 = await upTo('scene.md', '# Scene\n\nThe storm breaks in Act B at dusk.', sceneBDoc.folder.id)
check('its next upload lands in Act D as v3', [sceneB3.version, sceneB3.folder], [3, 'Act D'])
const leak = (await a('/api/audit')).data.filter(e => JSON.stringify(e.detail).includes('Act B/'))
check('no audit event shows the internal key', leak.map(e => e.event_type), [])
check('the audit names the file and its folder', (await a('/api/audit')).data.filter(e => e.target_id === sceneB3.document_id && e.event_type === 'document.version_added').map(e => [e.detail.filename, e.detail.folder]), [['scene.md', 'Act D']])
check('…and its history runs v1 to v3', (await a(`/api/documents/${sceneA3.document_id}`)).data.versions.map(v => v.version), [3, 2, 1])
check('moving a second scene.md into Act C is refused', (await a('/api/library/organise', { method: 'POST', body: { document_ids: [sceneB2.document_id], folder_id: actC.id } })).status, 409)
const inner = (await a('/api/library/folders', { method: 'POST', body: { name: 'Inner', parent_id: actC.id } })).data
const sceneInner = await upTo('scene.md', '# Scene\n\nA quiet scene inside Act C.', inner.id)
check('a third scene.md in a subfolder is its own document', sceneInner.version, 1)
check('deleting the subfolder would put two scene.md in Act C: refused', (await a(`/api/library/folders/${inner.id}`, { method: 'DELETE' })).status, 409)
const sceneRoot = await upTo('scene.md', '# Scene\n\nOne more, not in a folder.')
check('a scene.md not in a folder is its own document too', [sceneRoot.version, sceneRoot.folder], [1, null])

// 6. Re-extract: only pending candidates, deduplicated.
// S05 still holds the demo's own text (S04 v2 does not, so recorded mode has nothing for it).
const s05 = demoDocs.find(d => d.filename === 'S05.md')
const stats0 = (await a('/api/stats')).data
const re1 = (await a(`/api/documents/${s05.id}/extract`, { method: 'POST' })).data
check('re-extract of an already extracted document adds nothing', re1.created, 0)
check('it says what it skipped', re1.skipped > 0, true)
check('it says recorded mode covers this demo file', [re1.mode, re1.recorded_covers], ['mock', true])
const stats1 = (await a('/api/stats')).data
check('pending and canon counts are unchanged', [stats1.pending, stats1.canon], [stats0.pending, stats0.canon])
check('recorded mode has no output for the edited S04 v2', (await a(`/api/documents/${s04v2.document_id}/extract`, { method: 'POST' })).data.recorded_covers, false)
// A candidate a person corrected into something else: the model's original reading is new to the project again.
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
check('viewer reads the library', (await v('/api/library')).data.folders.length, 7)
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
check('the label is gone, the documents stay', [row('note-1.md').tags.length, docs.length], [0, 13 + 5 + 1 + 4])
const ev2 = new Set((await a('/api/audit')).data.map(e => e.event_type))
check('audit has folder.deleted and tag.deleted', ev2.has('folder.deleted') && ev2.has('tag.deleted'), true)
console.log('\nlibrary probe: all checks passed')
