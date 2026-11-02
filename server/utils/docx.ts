import { crc32, inflateRawSync } from 'node:zlib'

// Word (.docx) → the Markdown-ish text that becomes the document's source text. No dependency: a .docx is a zip of XML parts,
// and only five or six of them matter. The zip is read defensively (a 1 MB upload can claim to unpack to gigabytes): entry
// count, declared total size and every part we actually inflate are capped, encrypted / macro-enabled / non-zip files are
// refused, and so is an archive that contradicts itself (duplicate names, a local header that disagrees with the central
// directory, a wrong checksum). The XML reader refuses DOCTYPEs and any entity but the five built-ins and valid numeric ones. Deterministic: same bytes → same text → same hash.
// Output: headings `#`, bold `**`, italic `*`, lists `-` / `1.`, one paragraph per passage (blank line between), tables as one
// line per row (cells joined by " | "), footnotes and endnotes as `[^n]` with a "Notes" section at the end. Tracked changes are
// read as accepted (insertions in, deletions out). Images, text boxes and field codes are dropped.

const MAX_ENTRIES = 2000
const MAX_DECLARED = 64_000_000 // all entries together, as the zip declares them
const MAX_PART = 8_000_000 // one XML part we inflate
const MAX_READ = 16_000_000 // every part we inflate, together
const MAX_DEPTH = 256 // XML nesting

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const unsupported = (message: string) => createError({ statusCode: 415, statusMessage: 'UNSUPPORTED_FILE', message })
const invalid = (message = 'This Word file is damaged or not a .docx file.') => createError({ statusCode: 422, statusMessage: 'INVALID_DOCX', message })

// ---- zip ----
function readZip(buf: Buffer) {
  if (buf.length < 22) throw invalid()
  if (buf.subarray(0, 4).equals(Buffer.from([0xD0, 0xCF, 0x11, 0xE0])))
    throw unsupported('This Word file is password-protected or in the old .doc format. Save it as an unprotected .docx and upload it again.')
  if (buf.readUInt32LE(0) !== 0x04034B50) throw invalid()
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054B50) { eocd = i; break }
  if (eocd < 0) throw invalid()
  const count = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOffset = buf.readUInt32LE(eocd + 16)
  if (count === 0xFFFF || cdOffset === 0xFFFFFFFF || cdOffset + cdSize > eocd) throw invalid()
  if (count > MAX_ENTRIES) throw invalid(`This Word file holds more than ${MAX_ENTRIES} parts; it is not imported.`)
  const entries = new Map<string, { flags: number, method: number, crc: number, size: number, csize: number, offset: number, name: Buffer }>()
  let at = cdOffset, declared = 0
  for (let n = 0; n < count; n++) {
    if (at + 46 > eocd || buf.readUInt32LE(at) !== 0x02014B50) throw invalid()
    const flags = buf.readUInt16LE(at + 8), method = buf.readUInt16LE(at + 10), crc = buf.readUInt32LE(at + 16)
    const csize = buf.readUInt32LE(at + 20), size = buf.readUInt32LE(at + 24), offset = buf.readUInt32LE(at + 42)
    const nameLen = buf.readUInt16LE(at + 28), skip = nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32)
    if (at + 46 + skip > cdOffset + cdSize) throw invalid()
    if (flags & 0x41) throw unsupported('This Word file is encrypted. Save it without a password and upload it again.')
    if (csize === 0xFFFFFFFF || size === 0xFFFFFFFF) throw invalid()
    declared += size
    if (declared > MAX_DECLARED) throw invalid('This Word file unpacks to more than 64 MB; it is not imported.')
    const raw = buf.subarray(at + 46, at + 46 + nameLen)
    const name = raw.toString('utf8')
    // Two entries under one name: which one a reader takes differs between readers, so the file is refused.
    if (entries.has(name)) throw invalid('This Word file lists the same part twice; it is not imported.')
    entries.set(name, { flags, method, crc, size, csize, offset, name: raw })
    at += 46 + skip
  }
  let budget = MAX_READ
  const read = (name: string) => {
    const e = entries.get(name)
    if (!e) return null
    if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== 0x04034B50) throw invalid()
    // The local header must agree with the central directory: name, encryption, method, and sizes (a data descriptor, flag
    // bit 3, may leave the local sizes zero).
    const lflags = buf.readUInt16LE(e.offset + 6), lmethod = buf.readUInt16LE(e.offset + 8)
    const lcsize = buf.readUInt32LE(e.offset + 18), lsize = buf.readUInt32LE(e.offset + 22), lnameLen = buf.readUInt16LE(e.offset + 26)
    const start = e.offset + 30 + lnameLen + buf.readUInt16LE(e.offset + 28)
    if (start + e.csize > buf.length) throw invalid()
    const sizesOk = (lcsize === e.csize && lsize === e.size) || (lflags & 8 && lcsize === 0 && lsize === 0)
    if ((lflags & 0x49) !== (e.flags & 0x49) || lmethod !== e.method || !sizesOk || !buf.subarray(e.offset + 30, e.offset + 30 + lnameLen).equals(e.name))
      throw invalid('This Word file is inconsistent inside (its parts are listed differently in two places); it is not imported.')
    const raw = buf.subarray(start, start + e.csize)
    const cap = Math.min(MAX_PART, budget)
    if (e.size > cap) throw invalid('A part of this Word file is too large once unpacked; it is not imported.')
    let out: Buffer
    if (e.method === 0) out = raw
    else if (e.method === 8) {
      // maxOutputLength stops a part that lies about its size (a zip bomb) as soon as it inflates past the cap.
      try { out = inflateRawSync(raw, { maxOutputLength: cap }) } catch { throw invalid('A part of this Word file could not be unpacked (damaged or too large).') }
    } else throw invalid()
    if (out.length !== e.size || crc32(out) !== e.crc) throw invalid()
    budget -= out.length
    return out.toString('utf8').replace(/^﻿/, '')
  }
  return { names: [...entries.keys()], read }
}

// ---- XML: a small, non-validating reader. No DTD, no entity expansion beyond the five built-ins and numeric references. ----
interface El { name: string, attrs: Record<string, string>, kids: (El | string)[] }
const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: '\'' }
// A character XML allows (Char production): no NUL or other C0 controls but tab/LF/CR, no surrogates, no U+FFFE/U+FFFF.
const xmlChar = (c: number) => c === 0x9 || c === 0xA || c === 0xD || (c >= 0x20 && c <= 0xD7FF) || (c >= 0xE000 && c <= 0xFFFD) || (c >= 0x10000 && c <= 0x10FFFF)
const badEntity = () => invalid('This Word file uses XML entities Word does not write; it is not imported.')
const decode = (s: string) => s.replace(/&(?:#x([0-9a-fA-F]{1,6})|#([0-9]{1,7})|(lt|gt|amp|quot|apos));|&/g, (all, hex?: string, dec?: string, named?: string) => {
  if (named) return ENTITIES[named]!
  if (!hex && !dec) throw badEntity() // `&ext;`, `&#999999999999;`, a bare `&`
  const c = hex ? Number.parseInt(hex, 16) : Number(dec)
  if (!xmlChar(c)) throw badEntity()
  return String.fromCodePoint(c)
})
const local = (n: string) => n.slice(n.indexOf(':') + 1)

function parseXml(xml: string): El {
  const root: El = { name: '#root', attrs: {}, kids: [] }
  const stack = [root]
  const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|([^<]+)|</g
  for (const m of xml.matchAll(re)) {
    const top = stack.at(-1)!
    if (m[6] !== undefined) { top.kids.push(decode(m[6])); continue }
    if (m[5] !== undefined) { top.kids.push(m[5]); continue }
    if (!m[2]) {
      if (m[0] === '<') throw invalid()
      // A DOCTYPE (with its entity declarations) or any other <!…> declaration: Word never writes one.
      if (m[0].startsWith('<!') && !m[0].startsWith('<!--')) throw invalid('This Word file declares a DOCTYPE, which Word does not write; it is not imported.')
      continue
    }
    const name = local(m[2])
    if (m[1]) {
      if (stack.length < 2 || top.name !== name) throw invalid()
      stack.pop()
      continue
    }
    const attrs: Record<string, string> = {}
    for (const a of m[3]!.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[local(a[1]!)] = decode(a[2] ?? a[3] ?? '')
    const el: El = { name, attrs, kids: [] }
    top.kids.push(el)
    if (!m[4]) {
      stack.push(el)
      if (stack.length > MAX_DEPTH) throw invalid()
    }
  }
  if (stack.length !== 1) throw invalid()
  return root
}
const els = (e: El | undefined) => (e?.kids.filter(k => typeof k !== 'string') ?? []) as El[]
const child = (e: El | undefined, name: string) => els(e).find(k => k.name === name)
const find = (e: El, name: string): El | undefined => {
  for (const k of els(e)) {
    if (k.name === name) return k
    const hit = find(k, name)
    if (hit) return hit
  }
}
const val = (e: El | undefined, name: string) => child(e, name)?.attrs.val
const on = (e: El | undefined) => !!e && !['0', 'false', 'off', 'none'].includes(e.attrs.val ?? '')

// ---- conversion ----
export interface WordComment { line: number, quote: string, author: string, text: string }

const SKIP = new Set(['del', 'moveFrom', 'drawing', 'pict', 'object', 'Fallback', 'instrText', 'delText', 'pPr', 'rPr', 'sectPr', 'tblPr', 'trPr', 'tcPr', 'tblGrid'])

export function docxToText(buf: Buffer): { text: string, comments: WordComment[] } {
  const zip = readZip(buf)
  const types = zip.read('[Content_Types].xml')
  if (types === null) throw invalid()
  const overrides = els(parseXml(types).kids.find((k): k is El => typeof k !== 'string')).filter(o => o.name === 'Override')
  if (overrides.some(o => /macroEnabled/i.test(o.attrs.ContentType ?? '')) || zip.names.some(n => /vbaProject\.bin$/i.test(n)))
    throw unsupported('This Word file contains macros. Save it as a plain .docx (Word Document) and upload it again.')
  const main = overrides.find(o => /wordprocessingml\.document\.main\+xml$/.test(o.attrs.ContentType ?? ''))?.attrs.PartName?.replace(/^\//, '')
  const docXml = main ? zip.read(main) : null
  if (docXml === null) throw invalid()
  const dir = main!.includes('/') ? main!.slice(0, main!.lastIndexOf('/') + 1) : ''
  const part = (n: string) => {
    const x = zip.read(dir + n)
    return x === null ? null : parseXml(x)
  }
  const body = find(parseXml(docXml), 'body')
  if (!body) throw invalid()

  // Styles: heading level and list numbering, following basedOn.
  const styleXml = part('styles.xml')
  const styles = new Map(els(styleXml ? find(styleXml, 'styles') : undefined).filter(s => s.name === 'style').map(s => [s.attrs.styleId ?? '', s]))
  const styleChain = (id: string | undefined) => {
    const out: El[] = []
    for (let s = id ? styles.get(id) : undefined; s && out.length < 10; s = styles.get(val(s, 'basedOn') ?? '')) out.push(s)
    return out
  }
  // Numbering: numId → abstractNum → per-level format and start.
  const numbering = part('numbering.xml')
  const nRoot = numbering ? find(numbering, 'numbering') : undefined
  const abstract = new Map(els(nRoot).filter(a => a.name === 'abstractNum').map(a => [a.attrs.abstractNumId ?? '', a]))
  const nums = new Map(els(nRoot).filter(n => n.name === 'num').map(n => [n.attrs.numId ?? '', abstract.get(val(n, 'abstractNumId') ?? '')]))
  const counters = new Map<string, number>()

  const notes: string[] = []
  const noteNo = new Map<string, number>()
  const noteParts = { footnoteReference: part('footnotes.xml'), endnoteReference: part('endnotes.xml') }
  const blocks: string[] = []
  const open = new Map<string, { block: number, text: string, live: boolean }>()

  type Seg = { t: string, b: boolean, i: boolean }
  // Inline content of a paragraph (runs, insertions, links, fields, content controls). `track`: record commented text.
  function inline(e: El, segs: Seg[], track: boolean) {
    for (const k of els(e)) {
      if (SKIP.has(k.name)) continue
      if (k.name === 'commentRangeStart' && track) open.set(k.attrs.id ?? '', { block: blocks.length, text: '', live: true })
      else if (k.name === 'commentRangeEnd' && track) {
        const c = open.get(k.attrs.id ?? '')
        if (c) c.live = false
      } else if (k.name === 'r') {
        const rPr = child(k, 'rPr')
        const fmt = { b: on(child(rPr, 'b')), i: on(child(rPr, 'i')) }
        const push = (t: string, text = true) => {
          segs.push({ t, ...fmt })
          if (text && track) for (const c of open.values()) if (c.live) c.text += t
        }
        for (const x of els(k)) {
          if (x.name === 't') push(x.kids.filter(s => typeof s === 'string').join(''))
          else if (x.name === 'tab') push('\t')
          else if ((x.name === 'br' && !x.attrs.type) || x.attrs.type === 'textWrapping' || x.name === 'cr') push('\n')
          else if (x.name === 'noBreakHyphen') push('-')
          else if (x.name === 'footnoteReference' || x.name === 'endnoteReference') push(`[^${noteRef(x.name, x.attrs.id ?? '')}]`, false)
        }
      } else if (['ins', 'moveTo', 'hyperlink', 'smartTag', 'customXml', 'sdt', 'sdtContent', 'fldSimple', 'dir', 'bdo', 'AlternateContent', 'Choice'].includes(k.name)) inline(k, segs, track)
    }
  }
  function noteRef(kind: 'footnoteReference' | 'endnoteReference', id: string) {
    const key = `${kind}:${id}`
    if (!noteNo.has(key)) {
      noteNo.set(key, noteNo.size + 1)
      const tag = kind === 'footnoteReference' ? 'footnote' : 'endnote'
      const root = noteParts[kind]
      const note = root && els(find(root, `${tag}s`)).find(n => n.name === tag && n.attrs.id === id)
      const out: string[] = []
      if (note) walk(note, out, false, true)
      notes.push(`[^${noteNo.get(key)}]: ${out.join(' ')}`)
    }
    return noteNo.get(key)!
  }
  // Emphasis markers sit inside the whitespace: `**bold** text`, never `**bold **text`.
  const render = (segs: Seg[], plain: boolean) => {
    const merged: Seg[] = []
    for (const s of segs) {
      const last = merged.at(-1)
      if (last && last.b === s.b && last.i === s.i) last.t += s.t
      else merged.push({ ...s })
    }
    return merged.map((s) => {
      const m = plain || !s.t.trim() ? '' : `${s.b ? '**' : ''}${s.i ? '*' : ''}`
      const [, lead, core, trail] = s.t.match(/^(\s*)([\s\S]*?)(\s*)$/)!
      return m ? `${lead}${m}${core}${[...m].reverse().join('')}${trail}` : s.t
    }).join('')
  }
  function paragraph(p: El, out: string[], track: boolean, plain: boolean) {
    const pPr = child(p, 'pPr')
    const chain = [...(pPr ? [pPr] : []), ...styleChain(val(pPr, 'pStyle')).map(s => child(s, 'pPr')).filter((x): x is El => !!x)]
    const styleName = styleChain(val(pPr, 'pStyle')).map(s => val(s, 'name') ?? '').find(n => /^(heading\s*[1-6]|title)$/i.test(n))
    const outline = chain.map(x => val(x, 'outlineLvl')).find(v => v !== undefined)
    const level = styleName ? (/title/i.test(styleName) ? 1 : Number(styleName.slice(-1))) : outline !== undefined && Number(outline) < 6 ? Number(outline) + 1 : 0
    const numPr = chain.map(x => child(x, 'numPr')).find(Boolean)
    const segs: Seg[] = []
    inline(p, segs, track)
    if (track) for (const c of open.values()) if (c.block === blocks.length) c.live = false // a comment's quote stays in its first paragraph
    let text = render(segs, plain || level > 0).replace(/[ \t]*\n\s*/g, '\n').trim()
    if (!text) return
    if (plain) return out.push(text)
    if (level) return out.push(`${'#'.repeat(level)} ${text.replace(/\n/g, ' ')}`)
    const numId = val(numPr, 'numId')
    if (numId && numId !== '0') {
      const ilvl = Number(val(numPr, 'ilvl') ?? 0)
      const lvl = els(nums.get(numId)).find(l => l.name === 'lvl' && Number(l.attrs.ilvl) === ilvl)
      for (const key of [...counters.keys()]) if (key.startsWith(`${numId}:`) && Number(key.split(':')[1]) > ilvl) counters.delete(key)
      const key = `${numId}:${ilvl}`
      const n = counters.get(key) ?? Number(val(lvl, 'start') ?? 1) - 1
      counters.set(key, n + 1)
      text = `${'  '.repeat(ilvl)}${['bullet', 'none', undefined].includes(val(lvl, 'numFmt')) ? '-' : `${n + 1}.`} ${text}`
    }
    out.push(text)
  }
  // Block content: paragraphs, tables (one line per row), content controls, tracked insertions.
  function walk(e: El, out: string[], track: boolean, plain = false) {
    for (const k of els(e)) {
      if (SKIP.has(k.name)) continue
      if (k.name === 'p') paragraph(k, out, track, plain)
      else if (k.name === 'tbl') {
        const rows = els(k).filter(r => r.name === 'tr').map(r => els(r).filter(c => c.name === 'tc').map((c) => {
          const cell: string[] = []
          walk(c, cell, track, true)
          return cell.join(' ')
        }).join(' | ').trim()).filter(r => r.replace(/\|/g, '').trim())
        if (rows.length) out.push(rows.join('\n'))
      } else walk(k, out, track, plain)
    }
  }
  walk(body, blocks, true)
  if (notes.length) blocks.push('# Notes', ...notes)

  // Comments: where the commented words start (line of their paragraph) and the words themselves.
  const starts: number[] = []
  blocks.reduce((line, b) => (starts.push(line), line + b.split('\n').length + 1), 1)
  const cRoot = part('comments.xml')
  const comments: WordComment[] = []
  for (const c of cRoot ? els(find(cRoot, 'comments')).filter(x => x.name === 'comment') : []) {
    const at = open.get(c.attrs.id ?? '')
    if (!at || at.block >= blocks.length) continue
    const out: string[] = []
    walk(c, out, false, true)
    const text = out.join('\n').trim()
    if (text) comments.push({ line: starts[at.block]!, quote: at.text.replace(/\s+/g, ' ').trim(), author: c.attrs.author?.trim() || 'unknown', text })
  }
  return { text: blocks.length ? `${blocks.join('\n\n')}\n` : '', comments }
}
