// Word import probe against a running server: node scripts/docx-probe.mjs <baseUrl> [server cwd, default: here]
// Builds small .docx files here (no third-party documents) and uploads them: headings, bold/italic, lists, a footnote, a
// tracked insertion + deletion, a table and an image convert to the expected text; the same file again is skipped (same text,
// same hash); the original .docx is served byte for byte and only inside its project; a Word comment becomes a note by the
// uploader; v2 with one changed sentence flags only the fact citing it; zip bombs, too many parts, encrypted, macro-enabled,
// old .doc, wrong MIME and damaged files are refused with 415/422 and nothing is stored; so are invalid or undeclared XML
// entities, a DOCTYPE, duplicate zip entries, a local header that disagrees with the central directory (for any entry, read or
// not), a wrong checksum, more than 1,000 comment ranges open at once and more than 4 MB of converted text. Comment ranges
// cost linear time: 10,000 ranges import in under 200 ms, 1,000 comments (also across bold marks) in under 3 s.
// The original is written before the import commits: with the project's originals folder read-only, the upload fails, stores
// nothing, and the retry imports (needs the server's cwd to reach .data/originals).
import assert from 'node:assert/strict'
import { chmodSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

const base = process.argv[2] ?? 'http://localhost:3000'
const serverCwd = process.argv[3] ?? process.cwd()
const run = Date.now().toString(36)
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function client() {
  let cookie = ''
  return async (path, { method = 'GET', body, form, raw } = {}) => {
    const headers = form ? { cookie } : { 'content-type': 'application/json', cookie }
    const res = await fetch(base + path, { method, headers, body: form ?? (body && JSON.stringify(body)) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    if (raw) return { status: res.status, headers: res.headers, data: Buffer.from(await res.arrayBuffer()) }
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
}
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual).slice(0, 80)})`) }

// ---- a minimal zip writer (deflate), with knobs to build broken archives (`local` overrides the local header only) ----
function zip(files) {
  const locals = [], centrals = []
  let offset = 0
  for (const f of files) {
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data)
    const body = f.stored ? data : deflateRawSync(data)
    const name = Buffer.from(f.name)
    const size = f.claimSize ?? data.length
    const head = (sig, central) => {
      const o9 = central ? {} : (f.local ?? {})
      const nm = o9.name !== undefined ? Buffer.from(o9.name) : name
      const b = Buffer.alloc(central ? 46 : 30)
      b.writeUInt32LE(sig, 0)
      let o = 4
      if (central) { b.writeUInt16LE(20, o); o += 2 }
      b.writeUInt16LE(20, o); b.writeUInt16LE(o9.flags ?? f.flags ?? 0, o + 2); b.writeUInt16LE(o9.method ?? (f.stored ? 0 : 8), o + 4)
      b.writeUInt16LE(0, o + 6); b.writeUInt16LE(0x21, o + 8); b.writeUInt32LE(f.crc ?? crc32(data), o + 10)
      b.writeUInt32LE(o9.csize ?? body.length, o + 14); b.writeUInt32LE(o9.size ?? size, o + 18); b.writeUInt16LE(nm.length, o + 22)
      if (central) b.writeUInt32LE(offset, 42)
      return Buffer.concat([b, nm])
    }
    const local = Buffer.concat([head(0x04034B50, false), body])
    centrals.push(head(0x02014B50, true))
    locals.push(local)
    offset += local.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
const types = (main = `${DOCX.replace('.document', '.document.main+xml')}`) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="${main}"/></Types>`
const r = (t, rPr = '') => `<w:r>${rPr && `<w:rPr>${rPr}</w:rPr>`}<w:t xml:space="preserve">${t}</w:t></w:r>`
const p = (inner, pPr = '') => `<w:p>${pPr && `<w:pPr>${pPr}</w:pPr>`}${inner}</w:p>`
const li = (numId, t) => p(r(t), `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`)
const styles = `<w:styles ${NS}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Heading1"/></w:style></w:styles>`
const numbering = `<w:numbering ${NS}><w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="11"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="11"/></w:num></w:numbering>`
const footnotes = `<w:footnotes ${NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
<w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r>${r(' The ferry schedule changed in the second edition.')}</w:p></w:footnote></w:footnotes>`
const comments = `<w:comments ${NS}><w:comment w:id="0" w:author="Juno Vale" w:date="2026-10-01T10:00:00Z"><w:p>${r('Is this still true in act two?')}</w:p></w:comment></w:comments>`
const story = winter => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>
${p(r('The Lantern Keeper'), '<w:pStyle w:val="Heading1"/>')}
${p(r('Mira keeps the ') + r('north lantern', '<w:b/>') + r(' lit through the ') + r(winter, '<w:i/>') + r('.'))}
${p(`${r('The ferry leaves at ')}<w:del w:id="5" w:author="Ed"><w:r><w:delText>dawn</w:delText></w:r></w:del><w:ins w:id="6" w:author="Ed">${r('dusk')}</w:ins>${r(' on day three.')}<w:r><w:footnoteReference w:id="1"/></w:r>`)}
${li(1, 'Salt')}${li(1, 'Rope')}${li(2, 'Light the lamp')}${li(2, 'Ring the bell')}
${p(`${r('Old Tamsin ')}<w:commentRangeStart w:id="0"/>${r('never crosses the causeway')}<w:commentRangeEnd w:id="0"/>${r(' after dark.')}<w:r><w:commentReference w:id="0"/></w:r>`)}
${p(r('Records'), '<w:pStyle w:val="Heading2"/>')}
<w:tbl><w:tblPr/><w:tr><w:tc>${p(r('Name'))}</w:tc><w:tc>${p(r('Role'))}</w:tc></w:tr><w:tr><w:tc>${p(r('Mira'))}</w:tc><w:tc>${p(r('Keeper'))}</w:tc></w:tr></w:tbl>
${p('<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><a:t>image text</a:t></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')}
<w:sectPr/></w:body></w:document>`
const docx = (winter = 'long winter', extra = {}) => zip([
  { name: '[Content_Types].xml', data: types(extra.main) },
  { name: 'word/document.xml', data: story(winter) },
  { name: 'word/styles.xml', data: styles },
  { name: 'word/numbering.xml', data: numbering },
  { name: 'word/footnotes.xml', data: footnotes },
  { name: 'word/comments.xml', data: comments },
  ...(extra.files ?? []),
])
const EXPECTED = `# The Lantern Keeper

Mira keeps the **north lantern** lit through the *long winter*.

The ferry leaves at dusk on day three.[^1]

- Salt

- Rope

1. Light the lamp

2. Ring the bell

Old Tamsin never crosses the causeway after dark.

## Records

Name | Role
Mira | Keeper

# Notes

[^1]: The ferry schedule changed in the second edition.
`

const form = (name, data, type = DOCX) => {
  const f = new FormData()
  f.append('files', new Blob([data], { type }), name)
  return f
}
async function account(name) {
  const c = client()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  const studio = (await c('/api/studios', { method: 'POST', body: { name: `${name} Studio` } })).data
  await c('/api/projects', { method: 'POST', body: { name: `${name} Docs`, studio_id: studio.id } })
  return c
}

const a = await account('Ada')
const up = async (name, data, type) => (await a('/api/documents', { method: 'POST', form: form(name, data, type) })).data.results[0]
const v1bytes = docx()

// 1. Conversion.
const v1 = await up('lantern.docx', v1bytes)
check('a .docx imports', [v1.status, v1.version], ['imported', 1])
check('its Word comment became one note', v1.word_notes, 1)
const doc1 = (await a(`/api/documents/${v1.document_id}`)).data
check('converted text: headings, emphasis, lists, accepted changes, table, footnote; image dropped', doc1.content, EXPECTED)
check('title from the first heading, name kept', [doc1.title, doc1.name], ['The Lantern Keeper', 'lantern.docx'])
check('one paragraph = one passage', doc1.passages.map(x => x.text), ['The Lantern Keeper', 'Mira keeps the **north lantern** lit through the *long winter*.', 'The ferry leaves at dusk on day three.[^1]',
  '- Salt', '- Rope', '1. Light the lamp', '2. Ring the bell', 'Old Tamsin never crosses the causeway after dark.', 'Records', 'Name | Role\nMira | Keeper', 'Notes',
  '[^1]: The ferry schedule changed in the second edition.'])
check('the document says it has an original', doc1.original, true)

// 2. Deterministic: the same file again is the same text and hash → skipped.
const again = await up('lantern.docx', v1bytes)
check('same file again is skipped', [again.status, again.same_as?.version], ['duplicate', 1])

// 3. The original, byte for byte, behind the project guard.
const orig = await a(`/api/documents/${v1.document_id}/original`, { raw: true })
check('original served as uploaded', [orig.status, orig.headers.get('content-type'), Buffer.compare(orig.data, v1bytes)], [200, DOCX, 0])
check('original downloads under its file name', /filename="lantern\.docx"/.test(orig.headers.get('content-disposition') ?? ''), true)
const b = await account('Bea')
check('another studio gets 404 on the original', (await b(`/api/documents/${v1.document_id}/original`)).status, 404)
check('another studio gets 404 on the document', (await b(`/api/documents/${v1.document_id}`)).status, 404)
const md = (await a('/api/documents', { method: 'POST', form: form('plain.md', '# Plain\n\nNo Word here at all.', 'text/markdown') })).data.results[0]
check('a Markdown document has no original', [(await a(`/api/documents/${md.document_id}`)).data.original, (await a(`/api/documents/${md.document_id}/original`)).status], [false, 404])

// 4. Word comment → note by the uploader, pinned to the commented words.
const note = doc1.notes.find(n => n.body.startsWith('From Word comment'))
check('the note names the comment author', note.body, 'From Word comment by Juno Vale: Is this still true in act two?')
check('the note is pinned to the commented words, by the uploader', [note.quote, doc1.passages.find(x => x.id === note.passage_id)?.ordinal, note.created_by_name], ['never crosses the causeway', 8, 'Ada'])
const noteAudit = (await a('/api/audit')).data.find(e => e.event_type === 'note.created' && e.target_id === note.id)
check('audited as a note from a Word comment', [noteAudit?.detail.from, noteAudit?.detail.comment_author], ['word_comment', 'Juno Vale'])

// 5. Canon on v1, then v2 with one changed sentence: only the fact citing it is outdated.
const fact = async (quote, statement) => (await a('/api/facts', { method: 'POST', body: { to: 'canon', document_id: v1.document_id, quote, kind: 'claim', subject: 'Mira', predicate: 'says', statement: `${statement} (${run})` } }))
const fa = await fact('lit through the long winter', 'The north lantern burns all winter')
const faQuote = (await a('/api/facts?status=canon')).data.find(f => f.id === fa.data.id)?.evidence[0]?.quote
check('a quote across emphasis is verified and stored verbatim', [fa.status, faQuote], [200, 'lit through the *long winter*'])
const fb = await fact('never crosses the causeway after dark', 'Tamsin avoids the causeway at night')
check('a second canon fact', fb.status, 200)
const v2 = await up('lantern.docx', docx('long spring'))
check('same name, changed text → v2', [v2.status, v2.version], ['imported', 2])
check('v2: one outdated of two canon facts', [v2.outdated_facts, v2.stale_facts], [1, 2])
check('v2: the same comment is not noted twice', v2.word_notes, 0)
const canon = new Map((await a('/api/facts?status=canon')).data.map(f => [f.id, f.recheck]))
check('only the fact on the changed sentence is outdated', [canon.get(fa.data.id), canon.get(fb.data.id)], ['outdated', 'unchanged'])
const diff = (await a(`/api/documents/${v2.document_id}/diff?from=${v1.document_id}`)).data
check('the diff shows one changed passage citing that fact', [diff.counts.changed, diff.rows.find(x => x.op === 'changed')?.facts.map(f => f.id)], [1, [fa.data.id]])
check('each version keeps its own original', Buffer.compare((await a(`/api/documents/${v2.document_id}/original`, { raw: true })).data, docx('long spring')), 0)

// 6. Refusals: 415 for formats we don't take, 422 for broken or oversized archives. Nothing is stored.
const before = (await a('/api/documents')).data.length
const refused = async (label, name, data, code, type) => {
  const res = await up(name, data, type)
  check(label, [res.status, res.code], ['error', code])
  return res
}
const big = Buffer.alloc(20_000_000, 0x20)
await refused('zip bomb (declares 20 MB) refused', 'bomb.docx', zip([{ name: '[Content_Types].xml', data: types() }, { name: 'word/document.xml', data: big }]), 422)
await refused('zip bomb (lies about its size) refused', 'liar.docx', zip([{ name: '[Content_Types].xml', data: types() }, { name: 'word/document.xml', data: big, claimSize: 1000 }]), 422)
await refused('more than 2,000 parts refused', 'parts.docx', zip([{ name: '[Content_Types].xml', data: types() }, ...Array.from({ length: 2001 }, (_, i) => ({ name: `x/${i}`, data: '', stored: true }))]), 422)
const docm = await refused('a .docm file refused', 'macro.docm', docx(), 415)
check('…with a reason a writer can act on', docm.error, 'Macro-enabled Word files are not imported. Save it as a Word Document (.docx).')
await refused('a macro-enabled file renamed .docx refused', 'renamed.docx', docx('long winter', { main: 'application/vnd.ms-word.document.macroEnabled.main+xml' }), 415)
await refused('a .docx carrying vbaProject.bin refused', 'vba.docx', docx('long winter', { files: [{ name: 'word/vbaProject.bin', data: 'x' }] }), 415)
await refused('an encrypted zip entry refused', 'locked.docx', zip([{ name: '[Content_Types].xml', data: types(), flags: 1 }]), 415)
await refused('a password-protected / old .doc container refused', 'old.docx', Buffer.concat([Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), Buffer.alloc(600)]), 415)
await refused('an old .doc by name refused', 'old.doc', Buffer.alloc(600), 415)
await refused('a .docx sent as an image refused', 'image.docx', v1bytes, 415, 'image/png')
await refused('not a zip at all refused', 'text.docx', Buffer.from('Just some text pretending.'), 422)
await refused('a truncated archive refused', 'cut.docx', v1bytes.subarray(0, v1bytes.length - 40), 422)
await refused('a zip without a Word document refused', 'nodoc.docx', zip([{ name: '[Content_Types].xml', data: '<Types/>' }]), 422)
await refused('malformed XML refused', 'badxml.docx', zip([{ name: '[Content_Types].xml', data: types() }, { name: 'word/document.xml', data: `<w:document ${NS}><w:body><w:p></w:body></w:document>` }]), 422)
await refused('a Word file with no text refused', 'empty.docx', zip([{ name: '[Content_Types].xml', data: types() }, { name: 'word/document.xml', data: `<w:document ${NS}><w:body><w:p/></w:body></w:document>` }]), 422)

// 7. Malformed XML and self-contradicting archives (review c66r): 422, never an untyped error, never accepted text.
const withDoc = (xml, extra = []) => zip([{ name: '[Content_Types].xml', data: types() }, { name: 'word/document.xml', data: xml }, ...extra])
const one = t => `<w:document ${NS}><w:body>${p(r(t))}</w:body></w:document>`
await refused('a numeric reference past Unicode refused', 'bigref.docx', withDoc(one('Mira &#999999999999; waits.')), 422)
await refused('a surrogate reference refused', 'surrogate.docx', withDoc(one('Mira &#xD800; waits.')), 422)
await refused('a NUL reference refused', 'nul.docx', withDoc(one('Mira &#0; waits.')), 422)
await refused('a DOCTYPE with an external entity refused', 'xxe.docx', withDoc(`<?xml version="1.0"?><!DOCTYPE w:document [<!ENTITY ext SYSTEM "file:///etc/hostname">]><w:document ${NS}><w:body>${p(r('Mira &ext; waits.'))}</w:body></w:document>`), 422)
await refused('an undeclared entity refused', 'undeclared.docx', withDoc(one('Mira &ext; waits.')), 422)
await refused('a bare ampersand refused', 'amp.docx', withDoc(one('Salt & rope')), 422)
const plain = one('Mira waits.')
const parts = local => zip([{ name: '[Content_Types].xml', data: types() }, { name: 'word/document.xml', data: plain, ...local }])
await refused('a duplicate word/document.xml refused', 'dup.docx', withDoc(plain, [{ name: 'word/document.xml', data: one('Another text.') }]), 422)
await refused('a local file name unlike the central one refused', 'lname.docx', parts({ local: { name: 'word/documenX.xml' } }), 422)
await refused('a local encrypted flag under a clear central one refused', 'lflag.docx', parts({ local: { flags: 1 } }), 422)
await refused('a local compression method unlike the central one refused', 'lmethod.docx', parts({ local: { method: 0 } }), 422)
await refused('a local size unlike the central one refused', 'lsize.docx', parts({ local: { size: 5 } }), 422)
await refused('a wrong checksum refused', 'crc.docx', parts({ crc: 1234 }), 422)
// Every entry's local header is checked, also parts the converter never reads (review c66r attempt 2).
await refused('an unread part whose local name differs from the central one refused', 'media.docx', withDoc(plain, [{ name: 'word/media/pic.jpg', data: 'img', local: { name: 'word/media/pic.png' } }]), 422)
await refused('an unread part whose local size differs refused', 'msize.docx', withDoc(plain, [{ name: 'word/media/pic.jpg', data: 'img', local: { size: 9 } }]), 422)
// Comment ranges cost linear time: 10,000 range starts + 10,000 runs in one paragraph.
const starts = n => Array.from({ length: n }, (_, i) => `<w:commentRangeStart w:id="${i}"/>`).join('')
const runs = r('x ').repeat(10_000)
const commentsOf = n => ({ name: 'word/comments.xml', data: `<w:comments ${NS}>${Array.from({ length: n }, (_, i) => `<w:comment w:id="${i}" w:author="QA"><w:p>${r(`Note ${i}`)}</w:p></w:comment>`).join('')}</w:comments>` })
await refused('more than 1,000 comments open at once refused', 'open.docx', withDoc(`<w:document ${NS}><w:body><w:p>${starts(10_000)}${runs}</w:p></w:body></w:document>`, [commentsOf(10_000)]), 422)
check('nothing refused was stored', (await a('/api/documents')).data.length, before)
const timed = async (name, bytes) => {
  const t = performance.now()
  const res = await up(name, bytes)
  return [res, Math.round(performance.now() - t)]
}
const [noComments, ms1] = await timed('ranges.docx', withDoc(`<w:document ${NS}><w:body><w:p>${starts(10_000)}${runs}</w:p></w:body></w:document>`))
console.log(`    10,000 ranges, no comments part: ${ms1} ms`)
check('10,000 ranges without a comments part import in < 200 ms, no notes', [noComments.status, noComments.word_notes ?? 0, ms1 < 200], ['imported', 0, true])
const [manyOpen, ms2] = await timed('open1000.docx', withDoc(`<w:document ${NS}><w:body><w:p>${starts(1000)}${r('y ').repeat(10_000)}</w:p></w:body></w:document>`, [commentsOf(1000)]))
console.log(`    1,000 open comments over 10,000 runs: ${ms2} ms`)
check('1,000 open comments over 10,000 runs import in < 3 s, one note each', [manyOpen.status, manyOpen.word_notes, ms2 < 3000], ['imported', 1000, true])
// Commented words split by bold marks are pinned by the folding match, which stops at its first hit (a repetitive passage
// has a hit per word): 1,000 comments over a 140 KB paragraph of alternating bold words.
const [folded, ms3] = await timed('folded.docx', withDoc(`<w:document ${NS}><w:body><w:p>${starts(1000)}${(r('y', '<w:b/>') + r(' z ')).repeat(20_000)}</w:p></w:body></w:document>`, [commentsOf(1000)]))
console.log(`    1,000 comments across bold marks: ${ms3} ms`)
const foldedNote = (await a(`/api/documents/${folded.document_id}`)).data.notes[0]
check('…import in < 3 s, pinned to the words with their marks', [folded.status, folded.word_notes, ms3 < 3000, foldedNote?.quote.startsWith('**y** z **y** z')], ['imported', 1000, true, true])
await refused('more than 4 MB of converted text refused', 'long.docx', withDoc(one('a'.repeat(4_100_000))), 422)
const ok = await up('entities.docx', withDoc(one('Salt &amp; rope &#x2014; Mira&#8217;s &lt;lamp&gt; &quot;lit&quot;')))
check('valid built-in and numeric references still import', [ok.status, (await a(`/api/documents/${ok.document_id}`)).data.content], ['imported', 'Salt & rope — Mira’s <lamp> "lit"\n'])

// 8. The original is stored before anything commits: a failed write leaves no document, and the retry imports.
const project = (await a('/api/me')).data.current.project.id
const dir = join(serverCwd, '.data', 'originals', project)
if (!existsSync(dir)) console.log(`SKIP write failure: ${dir} not found (pass the server's cwd as the second argument)`)
else {
  const retryBytes = docx('short summer')
  const count = (await a('/api/documents')).data.length
  chmodSync(dir, 0o555)
  let failed
  try { failed = await up('retry.docx', retryBytes) } finally { chmodSync(dir, 0o755) }
  check('original not writable → the upload fails, saying nothing was imported', [failed.status, failed.code, /nothing was imported/.test(failed.error)], ['error', 500, true])
  check('…and stores no document', (await a('/api/documents')).data.length, count)
  check('…and leaves no temp file behind', readdirSync(dir).filter(f => !/^[0-9a-f]{64}\.docx$/.test(f)), [])
  const retry = await up('retry.docx', retryBytes)
  check('the retry imports (not skipped as a duplicate)', [retry.status, retry.version], ['imported', 1])
  check('…with its original', (await a(`/api/documents/${retry.document_id}`)).data.original, true)
}

console.log('\ndocx probe: all checks passed')
