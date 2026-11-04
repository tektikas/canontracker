import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SQLInputValue } from 'node:sqlite'
import { loadSample, type SampleSet } from '../api/demo/load.post'

// The guest demo ("Try the demo", POST /api/auth/guest): its sample projects open with most of the canon in place, so every
// screen has data at once, while Review keeps a short queue for the visitor to decide themselves. Only the guest flow calls
// this, after loadSample(); a normal demo load keeps its full pending queue.
//
// What becomes canon is preloaded sample canon, exactly like Lantern Row's facts.json: origin 'sample', no author, no decider,
// badge "Sample canon (preloaded)". Nobody decided it, and nothing says anybody did. It is every pending candidate whose quote
// is verbatim in its passage and whose recorded AI critic opinion is keep (a set with no critic recording, Sherlock Holmes,
// takes every verified candidate: its gold plan accepts them all). What stays pending: the gold set's review beats (figurative,
// hallucinated), everything the critic did not keep, blocked quotes, and up to HOLD_BACK ordinary keeps spread through the story.
const HOLD_BACK = 10
// A small sample (Broken Tide has 25 candidates) holds back fewer, so canon stays at least this share of its candidates.
const MIN_CANON = 0.6

interface Gold { figurative?: string[], hallucinated?: string[], impact?: { rule_contains: string, expected_scenes: string[] }, [beat: string]: unknown }
// Every string in the gold set's conflict and impact beats (statements, quotes): a candidate they name is never held back.
function strings(v: unknown, out = new Set<string>()): Set<string> {
  if (typeof v === 'string') out.add(v)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out)
  return out
}

export async function preloadGuestCanon(set: string) {
  const assets = useStorage('assets:server')
  const gold = await assets.getItem<Gold>(`${set}:gold.json`)
  const hasCritic = await assets.hasItem(`${set}:critic.json`)
  const named = [...strings(['conflicts', 'false_alarms', 'expected_false_alarms', 'after_merge', 'after_change'].map(k => gold?.[k]))]
  const beats = new Set([...(gold?.figurative ?? []), ...(gold?.hallucinated ?? [])])
  const db = useDb()
  const verdict = db.prepare('select verdict from critic_opinions where project_id = ? and fact_id = ? order by rowid desc limit 1')
  const pending = listFacts(`status = 'pending'`)
  const eligible = pending.filter(f => !beats.has(f.statement) && hasVerifiedQuote(f.id)
    && (!hasCritic || (verdict.get(pid(), f.id) as { verdict: string } | undefined)?.verdict === 'keep'))
  // Held back: ordinary keeps that no conflict or impact beat needs (a fact the beats name or quote, travel times the travel
  // rule reads, the changed rule and every fact about its subject, which is how its impact reaches the scenes), picked evenly
  // through the story so the queue reads like one.
  const rule = gold?.impact && pending.find(f => f.statement.includes(gold.impact!.rule_contains))
  const needed = (f: (typeof pending)[number]) => named.includes(f.statement) || isTravel(f)
    || (!!rule && [f.subject, f.object].some(n => normEntity(n) === normEntity(rule.subject)))
    || f.evidence.some(e => named.some(s => s.includes(e.quote)))
  const free = eligible.filter(f => !needed(f))
  const n = Math.max(0, Math.min(HOLD_BACK, free.length, eligible.length - Math.ceil(pending.length * MIN_CANON)))
  const held = new Set(Array.from({ length: n }, (_, i) => free[Math.floor(i * free.length / n)]!.id))
  const preload = eligible.filter(f => !held.has(f.id))
  tx(() => {
    const canon = db.prepare(`update facts set status = 'canon', origin = 'sample', decided_at = ?, decided_by = null, decided_token = null, rationale = null
      where id = ? and project_id = ? and status = 'pending'`)
    for (const f of preload) canon.run(now(), f.id, pid())
    audit('sample.preloaded', 'project', pid(), { set, facts: preload.length, held_back: held.size })
  })
  // The critic read the held-back candidates before any canon existed; it reads them again against today's canon (replayed from
  // the sample's recording, like the load), so its keep is current rather than "canon changed since".
  const left = listFacts(`status = 'pending'`).filter(f => hasVerifiedQuote(f.id)).map(f => f.id)
  if (hasCritic && left.length) await runCritic(left)
  return { preloaded: preload.length, held_back: held.size }
}

// The payoff, visible without clicks: the conflict scan (rule checks replay the sample's recording), and for sets with a rule
// change in their gold set, that change proposed with its impact analysed. Proposed, never accepted: deciding it is the visitor's.
const PROPOSALS: Record<string, { to: (g: any) => string, why: string }> = {
  'broken-tide': { to: () => 'The chord stone erases the last day from the memory of whoever carries it.', why: 'The story needs a longer blackout: an hour is too short for what Arin forgets.' },
  'ashbell-pass': { to: g => g.after_change[0].rule_statement, why: 'Design wants the bell usable mid-quest; a day without a voice breaks the dialogue system.' },
}
export async function guestPayoff(set: string) {
  const scan = await scanConflicts()
  const p = PROPOSALS[set]
  const gold = await useStorage('assets:server').getItem<any>(`${set}:gold.json`)
  if (!p || !gold?.impact) return { scan, change: null }
  const db = useDb()
  const target = db.prepare(`select * from facts where project_id = ? and status = 'canon' and instr(statement, ?) > 0 order by rowid limit 1`).get(pid(), gold.impact.rule_contains) as unknown as Fact | undefined
  if (!target) return { scan, change: null }
  // The same writes as POST /api/changes (a draft proposal, then its bounded impact), marked as part of the sample.
  const id = newId('chg')
  const proposed = p.to(gold)
  db.prepare(`insert into changes (id, target_fact_id, before_statement, proposed_statement, rationale, status, created_at, project_id) values (?, ?, ?, ?, ?, 'analyzing', ?, ?)`)
    .run(id, target.id, target.statement, proposed, p.why, now(), pid())
  audit('change.created', 'change', id, { target_fact_id: target.id, before: target.statement, proposed, sample: true })
  const impact = analyzeImpact(target.id)
  db.prepare(`update changes set status = 'ready_for_review', impact = ? where id = ?`).run(JSON.stringify(impact), id)
  audit('impact.completed', 'change', id, { items: impact.length, documents: impact.filter(i => i.target_type === 'document').map(i => i.label), scenes: impact.filter(i => i.kind === 'scene').map(i => i.label), max_hops: 2 })
  return { scan, change: id }
}

// ---- Template + copy: "Try the demo" without rebuilding the demo for every visitor ----
// Building the three demo projects (loadSample + preloadGuestCanon + guestPayoff: ~70 documents, ~700 quotes checked, scans) is
// over a second of synchronous SQLite work that blocks every other request, and the result is the same for every guest. So it is
// built once per server process as a hidden template (a guest-like user nobody can sign in as, so it never changes; started by
// server/plugins/guest-template.ts) and each guest gets a copy with fresh ids. api_tokens and share_links are never copied.
const DEMO_PROJECTS: [SampleSet, string][] = [['broken-tide', 'Broken Tide (demo)'], ['ashbell-pass', 'The Ashbell Pass (demo)'], ['sherlock-holmes', 'Sherlock Holmes (demo)']]
type Who = { id: string, name: string, email: string }
type Place = { id: string, name: string }
type DemoProject = { id: string, name: string, set: SampleSet }

// Runs fn inside a project the way a request does (access(), pid()), replaying sample recordings, also where there is no request
// (the template build at start-up). Nitro's request context is unctx's 'nitro-app' AsyncLocalStorage (asyncContext in nuxt.config.ts).
function inProject<T>(a: Access, fn: () => Promise<T> | T): Promise<T> {
  const nitro = (globalThis as unknown as { __unctx__: { get(key: string): { callAsync(ctx: unknown, fn: () => unknown): Promise<unknown> } } }).__unctx__.get('nitro-app')
  return nitro.callAsync({ event: { context: { access: a, sampleReplay: true } } }, fn) as Promise<T>
}
const projectRow = (id: string) => useDb().prepare('select * from projects where id = ?').get(id) as unknown as ProjectRow

// The full build into a studio the user owns: the template's path, and a guest's fallback when the template can't be built.
export async function buildDemoProjects(user: Who, studio: Place) {
  const db = useDb()
  const projects: DemoProject[] = []
  for (const [set, name] of DEMO_PROJECTS) {
    const id = newId('prj')
    db.prepare('insert into projects (id, studio_id, name, created_at) values (?, ?, ?, ?)').run(id, studio.id, name, now())
    await inProject({ user, project: projectRow(id), studio, role: 'owner' }, async () => {
      await loadSample(set)
      await nextTurn()
      await preloadGuestCanon(set)
      await nextTurn()
      await guestPayoff(set)
    })
    projects.push({ id, name, set })
    await nextTurn()
  }
  return projects
}

const NEVER_COPIED = ['api_tokens', 'share_links']
const FILE_DIRS = ['portraits', 'originals', 'recordings'] // .data/<dir>/<project id>/
type Snapshot = { table: string, cols: string[], rows: unknown[][] }[]
interface Template {
  user: string, studio: string, built: number, projects: DemoProject[]
  rows: Map<string, Snapshot> // per template project: its projects row and each content table, rows in rowid order
  current: Set<string> // critic opinions that read the template's current canon (canon_seen hashes fact ids: re-hashed per copy)
}
let template: Promise<Template> | undefined
export function guestTemplate() {
  template ??= buildTemplate().catch((e) => {
    template = undefined // the next guest tries again
    throw e
  })
  return template
}
async function buildTemplate(): Promise<Template> {
  const db = useDb()
  const id = newId('usr')
  const user = { id, name: 'Guest', email: `template-${id.slice(4)}@demo.invalid` }
  const studio = { id: newId('std'), name: 'Demo studio' }
  tx(() => {
    db.prepare(`insert into users (id, email, name, password_hash, created_at, guest) values (?, ?, ?, 'guest', ?, 1)`).run(id, user.email, user.name, now())
    db.prepare('insert into studios values (?, ?, ?, ?)').run(studio.id, studio.name, id, now())
    db.prepare(`insert into memberships values (?, ?, 'owner', ?)`).run(studio.id, id, now())
  })
  const projects = await buildDemoProjects(user, studio)
  const built = Date.now()
  const cols = (table: string) => (db.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map(c => c.name)
  const tables = ['projects', ...(db.prepare(`select name from sqlite_master where type = 'table' order by name`).all() as { name: string }[])
    .map(t => t.name).filter(t => !NEVER_COPIED.includes(t) && cols(t).includes('project_id'))]
  const rows = new Map<string, Snapshot>()
  const current = new Set<string>()
  for (const p of projects) {
    rows.set(p.id, tables.map((table) => {
      const c = cols(table)
      const all = db.prepare(`select * from ${table} where ${table === 'projects' ? 'id' : 'project_id'} = ? order by rowid`).all(p.id) as Record<string, unknown>[]
      return { table, cols: c, rows: all.map(r => c.map(k => r[k])) }
    }))
    await inProject({ user, project: projectRow(p.id), studio, role: 'owner' }, () => {
      const near = canonNear()
      const fact = db.prepare('select subject, predicate, object from facts where id = ?')
      for (const o of db.prepare('select id, fact_id, canon_seen from critic_opinions where project_id = ?').all(p.id) as { id: string, fact_id: string, canon_seen: string }[]) {
        const f = fact.get(o.fact_id) as { subject: string, predicate: string, object: string | null } | undefined
        if (f && near(f).hash === o.canon_seen) current.add(o.id)
      }
    })
    await nextTurn()
  }
  return { user: id, studio: studio.id, built, projects, rows, current }
}

// Every row id is newId()'s `<prefix>_<16 hex>`, also inside text and JSON columns (impact items, audit details, critic
// fingerprints): a copy maps each to a fresh id with the same prefix (the template's user and studio to the guest's) and moves
// every timestamp forward by the template's age, so the copy reads as made just now.
const TOKEN = /\b[a-z]+_[0-9a-f]{16}\b|\b\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\b/g
// One copy at a time, so in a rush of guests the first ones are answered first instead of all at the end.
let copying: Promise<unknown> = Promise.resolve()

// The guest's copy of the template, in the guest's studio. Same result shape as buildDemoProjects.
export async function copyDemoProjects(user: Who, studio: Place) {
  const t = await guestTemplate()
  const turn = copying.then(() => copyTemplate(t, user, studio))
  copying = turn.catch(() => {})
  return turn
}
async function copyTemplate(t: Template, user: Who, studio: Place) {
  const db = useDb()
  const shift = Date.now() - t.built
  const ids = new Map([[t.user, user.id], [t.studio, studio.id]])
  const map = (m: string) => {
    if (m.endsWith('Z')) return new Date(Date.parse(m) + shift).toISOString()
    let to = ids.get(m)
    if (!to) ids.set(m, to = newId(m.slice(0, m.indexOf('_'))))
    return to
  }
  const fix = (v: unknown) => (typeof v === 'string' ? v.replace(TOKEN, map) : v)
  const copies: DemoProject[] = []
  for (const p of t.projects) {
    const copy = { ...p, id: map(p.id) }
    // Files first: a failed transaction below leaves only orphan files, never rows without their files.
    for (const dir of FILE_DIRS) {
      const from = join('.data', dir, p.id)
      if (!existsSync(from)) continue
      mkdirSync(join('.data', dir, copy.id), { recursive: true })
      for (const f of readdirSync(from)) copyFileSync(join(from, f), join('.data', dir, copy.id, f.replace(TOKEN, map)))
    }
    // One transaction per project (~70 ms for Sherlock Holmes' ~4,400 rows); requests run between projects.
    await bulkWrite(() => tx(() => {
      db.exec('pragma defer_foreign_keys = on')
      for (const { table, cols, rows } of t.rows.get(p.id)!) {
        const ins = db.prepare(`insert into ${table} (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})`)
        const [l, r, rule, hash] = ['left_fact_id', 'right_fact_id', 'rule', 'pair_hash'].map(c => cols.indexOf(c)) as [number, number, number, number]
        for (const row of rows) {
          const out = row.map(fix) as SQLInputValue[]
          if (table === 'conflicts') out[hash] = conflictPairHash(out[l] as string, out[r] as string, out[rule] as string) // unique across the database
          ins.run(...out)
        }
      }
    }))
    await nextTurn()
    await inProject({ user, project: projectRow(copy.id), studio, role: 'owner' }, () => tx(() => {
      const near = canonNear()
      const fact = db.prepare('select subject, predicate, object from facts where id = ?')
      const set = db.prepare('update critic_opinions set canon_seen = ? where id = ?')
      const opinions = t.rows.get(p.id)!.find(s => s.table === 'critic_opinions')!
      const [oid, fid] = ['id', 'fact_id'].map(c => opinions.cols.indexOf(c)) as [number, number]
      for (const o of opinions.rows) {
        if (t.current.has(o[oid] as string)) set.run(near(fact.get(map(o[fid] as string)) as { subject: string, predicate: string, object: string | null }).hash, map(o[oid] as string))
      }
    }))
    copies.push(copy)
    await nextTurn()
  }
  return copies.map(({ id, name, set }) => ({ id, name, set }))
}
