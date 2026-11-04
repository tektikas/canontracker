// Guest demo copy check against a running server and its database: node scripts/guest-clone-probe.mjs <baseUrl> <server cwd>/.data/storybible.db
// "Try the demo" copies a template built once per server process (server/utils/guest.ts). This makes a guest and compares each
// of its projects with the template project it was copied from, table by table: ids are numbered by first appearance
// (tables by name, rows by rowid, columns in order) and timestamps written as their distance from the first one, so the two
// dumps must be identical. Also: no copied row or file name still holds a template id, conflict pair hashes match their own
// fact ids, and every project file (cover, originals, recordings) is copied byte for byte.
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const [base = 'http://localhost:3000', dbPath] = process.argv.slice(2)
if (!dbPath) throw new Error('usage: node scripts/guest-clone-probe.mjs <baseUrl> <db path>')
let failures = 0
let passes = 0
function check(label, ok, detail = '') {
  if (ok) passes++
  else failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail !== '' ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`)
}

const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.9`
const t0 = Date.now()
const res = await fetch(`${base}/api/auth/guest`, { method: 'POST', headers: { 'x-forwarded-for': ip } })
const guest = await res.json()
check('guest made', res.status === 200, `${Date.now() - t0} ms`)

const db = new DatabaseSync(dbPath, { readOnly: true })
const template = db.prepare(`select id from users where email like 'template-%@demo.invalid' order by rowid desc limit 1`).get()
check('a template user exists', !!template)
const templateProjects = db.prepare('select p.id, p.name from projects p join studios s on s.id = p.studio_id where s.created_by = ? order by p.rowid').all(template.id)
check('the template has the three demo projects', templateProjects.map(p => p.name).join('|') === guest.projects.map(p => p.name).join('|'), templateProjects.map(p => p.name))

const ID = /\b[a-z]+_[0-9a-f]{16}\b/g
const TS = /\b\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\b/g
const cols = t => db.prepare(`pragma table_info(${t})`).all().map(c => c.name)
const tables = ['projects', ...db.prepare(`select name from sqlite_master where type = 'table' order by name`).all().map(t => t.name)
  .filter(t => !['api_tokens', 'share_links'].includes(t) && cols(t).includes('project_id'))]
const pairHash = (a, b, rule) => createHash('sha256').update([a, b].sort().join('|') + rule).digest('hex').slice(0, 24)

// A project's rows, canonical: ids numbered by first sight, timestamps relative to the first. Derived hashes of ids (conflict
// pair_hash, critic canon_seen) are checked or left out: they differ by design.
function dump(projectId) {
  const ids = new Map()
  let first
  const raw = new Set()
  const rows = []
  let badHash = 0
  for (const table of tables) {
    const c = cols(table)
    for (const r of db.prepare(`select * from ${table} where ${table === 'projects' ? 'id' : 'project_id'} = ? order by rowid`).all(projectId)) {
      if (r.event_type === 'guest.created') continue // the guest's own event, written after the copy (checked below)
      if (table === 'conflicts' && r.pair_hash !== pairHash(r.left_fact_id, r.right_fact_id, r.rule)) badHash++
      rows.push(`${table}: ${JSON.stringify(c.map((k) => {
        const v = r[k]
        if ((table === 'conflicts' && k === 'pair_hash') || (table === 'critic_opinions' && k === 'canon_seen')) return '<hash>'
        if (typeof v !== 'string') return v
        return v.replace(ID, (m) => {
          raw.add(m)
          if (!ids.has(m)) ids.set(m, `#${ids.size}`)
          return ids.get(m)
        }).replace(TS, (m) => {
          first ??= Date.parse(m)
          return `T${Date.parse(m) - first}`
        })
      }))}`)
    }
  }
  return { rows, raw, badHash }
}
const files = (projectId) => {
  const out = []
  for (const dir of ['portraits', 'originals', 'recordings']) {
    const d = join(dirname(dbPath), dir, projectId)
    if (existsSync(d)) for (const f of readdirSync(d)) out.push({ dir, name: f, sha: createHash('sha256').update(readFileSync(join(d, f))).digest('hex') })
  }
  return out.sort((x, y) => x.dir.localeCompare(y.dir) || x.sha.localeCompare(y.sha))
}

for (const [i, p] of guest.projects.entries()) {
  const from = templateProjects[i]
  const a = dump(from.id)
  const b = dump(p.id)
  const diff = a.rows.findIndex((r, j) => r !== b.rows[j])
  check(`${p.set}: copy identical to the template (${b.rows.length} rows)`, a.rows.length === b.rows.length && diff === -1,
    diff === -1 ? `${a.rows.length} vs ${b.rows.length} rows` : { template: a.rows[diff]?.slice(0, 300), copy: b.rows[diff]?.slice(0, 300) })
  const leaked = [...b.raw].filter(id => a.raw.has(id))
  check(`${p.set}: no template id left in the copy`, leaked.length === 0, leaked.slice(0, 5))
  check(`${p.set}: conflict pair hashes match their facts`, a.badHash === 0 && b.badHash === 0, { template: a.badHash, copy: b.badHash })
  const fa = files(from.id)
  const fb = files(p.id)
  check(`${p.set}: project files copied byte for byte (${fb.length})`, fa.length === fb.length && fa.every((f, j) => f.dir === fb[j].dir && f.sha === fb[j].sha)
    && fb.every(f => ![...a.raw].some(id => f.name.includes(id))), { template: fa.length, copy: fb.length })
}

const created = db.prepare(`select project_id, actor, detail from audit_events where event_type = 'guest.created' and target_id = ?`).all(guest.id)
check('guest.created audited once, in the first project, by the guest, as a copy', created.length === 1 && created[0].project_id === guest.project_id
  && created[0].actor === guest.id && JSON.parse(created[0].detail).copied === true, created)

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
