import type { Fact, PassageRow } from './db'

// Script vs recording: the transcript of a take aligned word by word with the script it was read from. Each script line is
// kept (said as written), changed (some words differ), or missing (not said); spoken runs that belong to no line are added
// (improvised). Facts the transcript's extraction found in changed or added lines are run through the same deterministic
// rules as MCP sb_check_facts (dryRunRules) against accepted canon, and any hit is flagged on its line. Derived on read;
// nothing is stored, and the flagged facts are still pending candidates a person reviews.

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu
// A dialogue line "NAME: words" (speaker in capitals, as scripts write it). Stage directions and notes are not spoken.
const SPEAKER = /^([\p{Lu}][\p{Lu}\p{N} .'’-]{0,40}):\s+/u

interface Tok { key: string, start: number, end: number, unit: number }
interface Unit { text: string, toks: Tok[] }
interface ScriptUnit extends Unit { passage_id: string, line: number, speaker: string | null }
interface SpokenUnit extends Unit { passage_id: string, start_ms: number | null, end_ms: number | null, speaker: string | null }

const tokens = (text: string, unit: number): Tok[] =>
  [...text.matchAll(WORD)].map(m => ({ key: m[0].toLowerCase().replace(/’/g, '\''), start: m.index!, end: m.index! + m[0].length, unit }))

/** The lines a script expects to be spoken: its "NAME: line" lines, or every non-heading line when it has none. */
export function scriptLines(passages: PassageRow[], content: string): ScriptUnit[] {
  const raw = content.split('\n')
  const all = passages.flatMap(p => p.text.split('\n').map((line, i) => ({ p, line, n: p.start_line + i })))
    .filter(x => !/^#/.test(raw[x.n - 1] ?? '') && x.line.trim() && !/^\(.*\)$/s.test(x.line.trim()))
  const dialogue = all.filter(x => SPEAKER.test(x.line))
  return (dialogue.length ? dialogue : all).map((x) => {
    const m = dialogue.length ? x.line.match(SPEAKER) : null
    const text = m ? x.line.slice(m[0].length) : x.line
    return { passage_id: x.p.id, line: x.n, speaker: m?.[1] ?? null, text, toks: [] as Tok[] }
  }).filter(u => tokens(u.text, 0).length).map((u, i) => ({ ...u, toks: tokens(u.text, i) }))
}

type Piece = { text: string, mark: boolean }
// The unit's text cut at word starts, so punctuation and spaces stay with the word before them; `marked` words are highlighted.
function pieces(u: Unit, toks: Tok[], marked: Set<Tok>): Piece[] {
  const out: Piece[] = []
  for (const t of toks) {
    const next = u.toks[u.toks.indexOf(t) + 1]
    const text = u.text.slice(u.toks[0] === t ? 0 : t.start, next ? next.start : u.text.length)
    const mark = marked.has(t)
    if (out.at(-1)?.mark === mark) out.at(-1)!.text += text // one highlight per run of words
    else out.push({ text, mark })
  }
  return out
}

export type AlignRow = {
  kind: 'kept' | 'changed' | 'added' | 'missing' | 'outside'
  script?: { passage_id: string, line: number, speaker: string | null, pieces: Piece[] }
  spoken?: { pieces: Piece[], passages: { passage_id: string, start_ms: number | null, end_ms: number | null }[], start_ms: number | null, end_ms: number | null, speaker: string | null }
  spans: Map<string, [number, number]> // spoken character range per transcript passage, for placing facts
}

export function alignScript(script: ScriptUnit[], spokenPassages: PassageRow[]): AlignRow[] {
  const spoken: SpokenUnit[] = spokenPassages.map((p, i) => ({ passage_id: p.id, start_ms: p.start_ms ?? null, end_ms: p.end_ms ?? null, speaker: p.speaker ?? null, text: p.text, toks: tokens(p.text, i) }))
  const A = script.flatMap(u => u.toks)
  const B = spoken.flatMap(u => u.toks)
  let ops = diffSeq(A, B, t => t.key)
  // Stray matches: a line that shares only scattered words with the take ("the", "Day", "and") was not said, and a word or two
  // matched far from the rest of a said line ("on the" in an ad-lib) belong to the ad-lib. Said means most of a line's words
  // match, or at least four in a row do. An unsaid line's words, and stray spoken words, are made unable to match and the take
  // is aligned again; freed words can land elsewhere, so repeat until nothing changes.
  const blockedA = new Set<number>()
  const blockedB = new Set<number>()
  for (let pass = 0; pass < 5; pass++) {
    const matched = new Map<number, { a: number, b: number }[]>()
    for (const o of ops) if (o.op === 'same') matched.set(A[o.a]!.unit, [...(matched.get(A[o.a]!.unit) ?? []), { a: o.a, b: o.b }])
    const moreA: number[] = []
    const moreB: number[] = []
    for (const [u, ms] of matched) {
      let run = 1
      let best = 1
      const clusters: { a: number, b: number }[][] = [[ms[0]!]]
      for (let i = 1; i < ms.length; i++) {
        run = ms[i]!.a === ms[i - 1]!.a + 1 && ms[i]!.b === ms[i - 1]!.b + 1 ? run + 1 : 1
        best = Math.max(best, run)
        if (ms[i]!.b - ms[i - 1]!.b > 4) clusters.push([])
        clusters.at(-1)!.push(ms[i]!)
      }
      if (ms.length / script[u]!.toks.length < 0.5 && best < 4) moreA.push(...ms.map(m => m.a))
      else {
        const main = clusters.reduce((x, y) => (y.length > x.length ? y : x))
        for (const c of clusters) if (c !== main && c.length <= 2) moreB.push(...c.map(m => m.b))
      }
    }
    if (!moreA.length && !moreB.length) break
    for (const a of moreA) blockedA.add(a)
    for (const b of moreB) blockedB.add(b)
    ops = diffSeq(A.map((t, i) => (blockedA.has(i) ? { ...t, key: `\0a${i}` } : t)), B.map((t, i) => (blockedB.has(i) ? { ...t, key: `\0b${i}` } : t)), t => t.key)
  }

  // Who owns each spoken word: the line whose matched words surround it, the line whose words it replaced (script words
  // dropped right before it: a reworded or ad-libbed ending, or a whole line said differently), the next line for a stray word
  // or two, or else a run of added (improvised) speech between lines.
  const lastSame = new Map<number, number>()
  ops.forEach((o, k) => { if (o.op === 'same') lastSame.set(A[o.a]!.unit, k) })
  const owner: string[] = []
  let cur: number | null = null
  let run = 0
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k]!
    if (o.op !== 'ins') {
      const u = A[o.a]!.unit
      if (o.op === 'same') cur = u
      owner[k] = `u${u}`
      continue
    }
    if (cur != null && k < lastSame.get(cur)!) { owner[k] = `u${cur}`; continue }
    // A run of spoken words between lines, cut where a turn ends (one turn of improvisation is one added row).
    let end = k
    while (end + 1 < ops.length && ops[end + 1]!.op === 'ins' && B[(ops[end + 1] as { b: number }).b]!.unit === B[o.b]!.unit) end++
    const nextSame = ops.slice(end + 1).find(x => x.op === 'same')
    // The script words dropped just before (diff order puts a gap's deletions first): the line they start in is the one replaced.
    let d = k
    while (d > 0 && ops[d - 1]!.op === 'del') d--
    const replaced = d < k ? A[(ops[d] as { a: number }).a]!.unit : null
    const key = end - k + 1 < 3 && (nextSame || cur != null) ? `u${nextSame?.op === 'same' ? A[nextSame.a]!.unit : cur}`
      : replaced != null ? `u${replaced}`
      : `a${run++}`
    for (let j = k; j <= end; j++) owner[j] = key
    k = end
  }

  const rows = new Map<string, { a: Tok[], del: Set<Tok>, b: Tok[], ins: Set<Tok> }>()
  ops.forEach((o, k) => {
    const r = rows.get(owner[k]!) ?? rows.set(owner[k]!, { a: [], del: new Set(), b: [], ins: new Set() }).get(owner[k]!)!
    if (o.op !== 'ins') r.a.push(A[o.a]!)
    if (o.op === 'del') r.del.add(A[o.a]!)
    if (o.op !== 'del') r.b.push(B[o.b]!)
    if (o.op === 'ins') r.ins.add(B[o.b]!)
  })
  // A replaced line's own words sit after the spoken run in diff order; show them in script order.
  for (const r of rows.values()) r.a.sort((x, y) => x.unit - y.unit || x.start - y.start)

  const out: AlignRow[] = [...rows].map(([key, r]) => {
    const su = key.startsWith('u') ? script[Number(key.slice(1))]! : null
    const units = [...new Set(r.b.map(t => t.unit))]
    const spans = new Map<string, [number, number]>()
    for (const t of r.b) {
      const id = spoken[t.unit]!.passage_id
      const s = spans.get(id)
      spans.set(id, s ? [Math.min(s[0], t.start), Math.max(s[1], t.end)] : [t.start, t.end])
    }
    const said = r.b.length
      ? {
          pieces: units.flatMap((i, n) => [...(n ? [{ text: ' ', mark: false }] : []), ...pieces(spoken[i]!, r.b.filter(t => t.unit === i), r.ins)]),
          passages: units.map(i => ({ passage_id: spoken[i]!.passage_id, start_ms: spoken[i]!.start_ms, end_ms: spoken[i]!.end_ms })),
          start_ms: spoken[units[0]!]!.start_ms, end_ms: spoken[units.at(-1)!]!.end_ms, speaker: spoken[units[0]!]!.speaker,
        }
      : undefined
    const kind = !su ? 'added' : !said ? 'missing' : !r.del.size && !r.ins.size ? 'kept' : 'changed'
    return { kind, spans, spoken: said, script: su ? { passage_id: su.passage_id, line: su.line, speaker: su.speaker, pieces: pieces(su, r.a, r.del) } : undefined }
  })
  // Script lines before the first line said or after the last weren't part of this take: "outside", not "missing".
  const said = out.map(r => !!r.script && r.kind !== 'missing')
  const first = said.indexOf(true)
  const last = said.lastIndexOf(true)
  return out.map((r, i) => (r.kind === 'missing' && (first < 0 || i < first || i > last) ? { ...r, kind: 'outside' as const } : r))
}

/** The full comparison of one transcript version with the latest version of its script, with canon flags. */
export function scriptComparison(transcriptId: string, scriptKey: string) {
  const db = useDb()
  const scriptDoc = latestDocument(scriptKey)
  if (!scriptDoc) return null
  const passagesOf = (id: string) => db.prepare('select * from passages where document_id = ? order by ordinal').all(id) as unknown as PassageRow[]
  const transcript = passagesOf(transcriptId)
  const rows = alignScript(scriptLines(passagesOf(scriptDoc.id), scriptDoc.content), transcript)

  // Facts the transcript states (pending candidates and canon citing this version), placed on the line whose words hold the quote.
  const facts = listFacts(`status in ('pending', 'canon') and id in (select fact_id from evidence where document_id = ? and verified = 1)`, transcriptId)
  const text = new Map(transcript.map(p => [p.id, p.text]))
  const rowOf = new Map<string, number>()
  for (const f of facts) {
    for (const ev of f.evidence) {
      const t = ev.passage_id && ev.document_id === transcriptId ? text.get(ev.passage_id) : undefined
      const at = t?.indexOf(ev.quote) ?? -1
      if (at < 0) continue
      const i = rows.findIndex(r => (r.kind === 'changed' || r.kind === 'added') && r.spans.has(ev.passage_id!)
        && r.spans.get(ev.passage_id!)![0] < at + ev.quote.length && at < r.spans.get(ev.passage_id!)![1])
      if (i >= 0 && !rowOf.has(f.id)) rowOf.set(f.id, i)
    }
  }
  const checked = facts.filter(f => rowOf.has(f.id))
  const kept = (n: string | null) => (n ? mergedIdentity(n)?.to ?? n.trim() : null)
  const { hits } = dryRunRules(checked.map(f => ({ ...f, subject: kept(f.subject)!, object: kept(f.object) }) as Fact))
  const severity = severityFor(access().project.severity_defaults)
  const brief = (f: Fact) => ({ id: f.id, statement: f.statement, status: f.status, time: f.time_label })
  const ids = new Set(checked.map(f => f.id))
  const flagsOf = (id: string) => hits.filter(h => h.a.id === id || h.b.id === id).map((h) => {
    const other = h.a.id === id ? h.b : h.a
    return { rule: h.rule, severity: severity(h.rule, h.near), rationale: h.rationale, against: { ...brief(other), in_take: ids.has(other.id) } }
  })
  const count = (k: AlignRow['kind']) => rows.filter(r => r.kind === k).length
  const out = rows.map(({ spans: _, ...r }, i) => ({ ...r, facts: checked.filter(f => rowOf.get(f.id) === i).map(f => ({ ...brief(f), flags: flagsOf(f.id) })) }))
  return {
    script: { id: scriptDoc.id, title: scriptDoc.title, version: scriptDoc.version },
    counts: { kept: count('kept'), changed: count('changed'), added: count('added'), missing: count('missing'), outside: count('outside') },
    checked_facts: checked.length, flagged: out.filter(r => r.facts.some(f => f.flags.length)).length,
    rows: out,
  }
}
