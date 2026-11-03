// Severity migration probe: node scripts/severity-probe.mjs migrate|explicit [port]   (default 3999; run `pnpm build` first)
// Builds a schema-13 database (the shape on master, read from git) with conflicts of every rule, starts the built server
// on it in a temp folder, and checks the in-place v13→14 upgrade: every conflict gets its rule's severity, nothing is lost.
// Then v14 → 15 (evidence.checked_version, c32) from a v14 database: rows and severities kept.
// An upgrade failure is injected with a trigger on conflicts: the DB must stay v13 and the next request must retry.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.argv[3] ?? 3999)
const mode = process.argv[2]
if (mode !== 'migrate' && mode !== 'explicit') { console.log('usage: node scripts/severity-probe.mjs migrate|explicit [port]'); process.exit(1) }

const check = (name, got, want) => { assert.deepEqual(got, want, name); console.log(`ok  ${name}`) }
async function migrate(from, commit) {
console.log(`-- upgrade from v${from}`)
const dir = mkdtempSync(join(tmpdir(), 'sb-sev-'))
const data = join(dir, '.data')
mkdirSync(data)
let server
try {
  const old = execFileSync('git', ['show', `${commit}:server/utils/db.ts`], { cwd: root, encoding: 'utf8' })
  const schema = old.slice(old.indexOf('const SCHEMA = `') + 16, old.indexOf('`\n\nlet db'))
  assert.ok(new RegExp(`SCHEMA_VERSION = ${from}\\b`).test(old) && !schema.includes('severity'), 'v13 schema found')
  const file = join(data, 'storybible.db')
  const db = new DatabaseSync(file)
  db.exec(schema)
  db.exec(`pragma user_version = ${from}`)
  const at = '2026-10-30T10:00:00.000Z'
  db.prepare('insert into users values (?, ?, ?, ?, ?, ?)').run('usr_m', 'mig@probe.test', 'Ada', 'x', 'prj_m', at)
  db.prepare('insert into studios values (?, ?, ?, ?)').run('std_m', 'Tidewright', 'usr_m', at)
  db.prepare('insert into memberships values (?, ?, ?, ?)').run('std_m', 'usr_m', 'owner', at)
  db.prepare(`insert into projects (id, studio_id, name, created_at) values ('prj_m', 'std_m', 'Broken Tide', ?)`).run(at)
  const gap = (n, trip = 40, said = 'The trip takes 40 min.') => `Leya has ${n} min to get from the Harbor to the Lighthouse, but canon says the trip takes ${trip} min ("${said}").`
  // id, rule, origin, rationale, status, expected severity
  const rows = [
    ['c1', 'EXACT_TIME_LOCATION_OVERLAP', 'rule', 'Leya is at two places at once.', 'open', 'hard'],
    ['c2', 'APPROX_TIME_LOCATION_OVERLAP', 'rule', 'Leya may be at two places.', 'false_positive', 'soft'],
    ['c3', 'RELATIONSHIP_AFTER_END', 'rule', 'The alliance ended, but is used as active.', 'confirmed', 'hard'],
    ['c4', 'TRAVEL_TIME_TOO_SHORT', 'rule', gap(5), 'open', 'hard'],
    ['c5', 'TRAVEL_TIME_TOO_SHORT', 'rule', gap(20), 'open', 'soft'],
    ['c6', 'TRAVEL_TIME_TOO_SHORT', 'rule', gap(19), 'uncertain', 'hard'],
    ['c7', 'WORLD_RULE_VIOLATION', 'model', 'The fact breaks a world rule.', 'open', 'soft'],
    // the quoted statement holds other numbers; only the generated clause counts (a greedy parse got both of these wrong)
    ['c8', 'TRAVEL_TIME_TOO_SHORT', 'rule', gap(25, 40, 'The walk takes 40 min; the detour takes 80 min.'), 'open', 'soft'],
    ['c9', 'TRAVEL_TIME_TOO_SHORT', 'rule', gap(5, 80, 'The ferry takes 80 min; the shortcut takes 8 min.'), 'open', 'hard'],
  ]
  const ins = db.prepare(`insert into conflicts (id, left_fact_id, right_fact_id, rule, origin, model_id, rationale, confidence, status, pair_hash, created_at, project_id)
    values (?, 'f_l', 'f_r', ?, ?, null, ?, 0.5, ?, ?, ?, 'prj_m')`)
  for (const [id, rule, origin, why, status] of rows) ins.run(id, rule, origin, why, status, `h_${id}`, at)
  const before = db.prepare('select * from conflicts order by id').all().map(r => ({ ...r }))
  // Injected failure: any update on conflicts aborts, so the backfill fails after the columns were added.
  db.exec(`create trigger boom before update on conflicts begin select raise(abort, 'injected'); end`)
  db.close()

  server = spawn(process.execPath, [join(root, '.output/server/index.mjs')], { cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), HOST: 'localhost', NUXT_SESSION_PASSWORD: randomBytes(24).toString('hex'), NUXT_MODEL_MODE: 'mock' } })
  const base = `http://localhost:${port}`
  for (let i = 0; ; i++) {
    try { await fetch(`${base}/api/health`); break } catch {}
    if (i > 100) throw new Error('server did not start')
    await new Promise(r => setTimeout(r, 100))
  }
  const peek = (fn) => { const d = new DatabaseSync(file, { readOnly: true }); try { return fn(d) } finally { d.close() } }
  const cols = () => peek(d => d.prepare('pragma table_info(conflicts)').all().map(c => c.name))
  const version = () => peek(d => d.prepare('pragma user_version').get().user_version)
  check('failed upgrade: health 500, and again on the next request', [(await fetch(`${base}/api/health`)).status, (await fetch(`${base}/api/health`)).status], [500, 500])
  check('failed upgrade: DB still v13, no severity column (rolled back)', [version(), cols().includes('severity')], [13, false]) // for a v12 start, step 13 had already committed

  const fix = new DatabaseSync(file)
  fix.exec('drop trigger boom')
  fix.close()
  const h = await fetch(`${base}/api/health`)
  check('fixed: next request upgrades without restart; health reports 15', [h.status, (await h.json()).schema, version()], [200, 15, 15])
  check('evidence gains checked_version (v15)', peek(d => d.prepare('pragma table_info(evidence)').all().some(c => c.name === 'checked_version')), true)
  const after = peek(d => d.prepare('select * from conflicts order by id').all())
  // decided_token is added in place (c68), always null here; everything else must be unchanged.
  check('no conflict lost, no other column changed', after.map(({ severity, decided_token, ...r }) => ({ ...r })), before)
  check('every conflict has the severity of its rule (travel near the limit is soft)', after.map(r => [r.id, r.severity]), rows.map(r => [r[0], r[5]]))
  check('project has severity_defaults, empty', peek(d => d.prepare('select severity_defaults from projects').all().map(r => ({ ...r }))), [{ severity_defaults: '{}' }])
  check('user and project rows kept', peek(d => [d.prepare('select count(*) n from users').get().n, d.prepare('select count(*) n from projects').get().n]), [1, 1])
  await fetch(`${base}/api/health`)
  check('later boots leave it at 15', version(), 15)
} finally {
  server?.kill()
  await new Promise(r => setTimeout(r, 300))
  rmSync(dir, { recursive: true, force: true })
}
}
if (mode === 'migrate') {
  await migrate(13, '6177e3d') // master at v13
  await migrate(12, '7108423^') // before c23: v12
  await upgrade14()
  console.log('severity migration probe: all checks passed')
} else await explicit()

// v14 → v15 (c32): evidence gains checked_version, in place; every row and the rest of the schema are kept.
async function upgrade14() {
  console.log('-- upgrade from v14')
  const dir = mkdtempSync(join(tmpdir(), 'sb-sev-'))
  mkdirSync(join(dir, '.data'))
  const file = join(dir, '.data/storybible.db')
  let server
  try {
    const old = execFileSync('git', ['show', 'fd7369b:server/utils/db.ts'], { cwd: root, encoding: 'utf8' })
    assert.ok(/SCHEMA_VERSION = 14\b/.test(old), 'v14 schema found')
    const db = new DatabaseSync(file)
    db.exec(old.slice(old.indexOf('const SCHEMA = `') + 16, old.indexOf('`\n\nlet db')))
    db.exec('pragma user_version = 14; pragma foreign_keys = off')
    db.prepare(`insert into evidence (id, fact_id, document_id, passage_id, quote, verified, project_id) values ('ev_m', 'f_m', 'doc_m', 'psg_m', 'The lamp burns all night.', 1, 'prj_m')`).run()
    db.prepare(`insert into conflicts (id, left_fact_id, right_fact_id, rule, origin, rationale, confidence, status, pair_hash, created_at, project_id, severity)
      values ('c_m', 'f_l', 'f_r', 'WORLD_RULE_VIOLATION', 'model', 'x', 0.5, 'open', 'h_m', '2026-10-30', 'prj_m', 'hard')`).run()
    db.close()
    server = spawn(process.execPath, [join(root, '.output/server/index.mjs')], { cwd: dir, stdio: 'ignore',
      env: { ...process.env, PORT: String(port), HOST: 'localhost', NUXT_SESSION_PASSWORD: randomBytes(24).toString('hex'), NUXT_MODEL_MODE: 'mock' } })
    for (let i = 0; ; i++) {
      try { await fetch(`http://localhost:${port}/api/health`); break } catch {}
      if (i > 100) throw new Error('server did not start')
      await new Promise(r => setTimeout(r, 100))
    }
    const h = await (await fetch(`http://localhost:${port}/api/health`)).json()
    const d = new DatabaseSync(file, { readOnly: true })
    try {
      check('v14 upgrades in place to 15', [h.schema, d.prepare('pragma user_version').get().user_version], [15, 15])
      check('evidence row kept, checked_version empty', { ...d.prepare('select id, quote, verified, checked_version from evidence').get() }, { id: 'ev_m', quote: 'The lamp burns all night.', verified: 1, checked_version: null })
      check('a person’s severity choice is kept (no v13 backfill)', d.prepare(`select severity from conflicts where id = 'c_m'`).get().severity, 'hard')
    } finally { d.close() }
  } finally {
    server?.kill()
    await new Promise(r => setTimeout(r, 300))
    rmSync(dir, { recursive: true, force: true })
  }
}

// Project defaults: no override → a travel gap of at least half the trip is soft; an explicit Hard (or Soft) always wins,
// even when it equals the built-in default. Real server, real scan over canon facts written into the DB.
async function explicit() {
  const dir = mkdtempSync(join(tmpdir(), 'sb-sev-'))
  mkdirSync(join(dir, '.data'))
  let server
  try {
    server = spawn(process.execPath, [join(root, '.output/server/index.mjs')], { cwd: dir, stdio: 'ignore',
      env: { ...process.env, PORT: String(port), HOST: 'localhost', NUXT_SESSION_PASSWORD: randomBytes(24).toString('hex'), NUXT_MODEL_MODE: 'mock' } })
    const base = `http://localhost:${port}`
    for (let i = 0; ; i++) {
      try { await fetch(`${base}/api/health`); break } catch {}
      if (i > 100) throw new Error('server did not start')
      await new Promise(r => setTimeout(r, 100))
    }
    let cookie = ''
    const api = async (path, method = 'GET', body) => {
      const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
      const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
      if (set.length) cookie = set.join('; ')
      return { status: res.status, data: await res.json().catch(() => null) }
    }
    assert.equal((await api('/api/auth/signup', 'POST', { name: 'Ada', email: `ada-${Date.now()}@probe.test`, password: 'correct horse' })).status, 200)
    const studio = (await api('/api/studios', 'POST', { name: 'Tidewright' })).data
    await api('/api/projects', 'POST', { name: 'Broken Tide', studio_id: studio.id })
    const pid = (await api('/api/me')).data.current.project.id
    const file = join(dir, '.data/storybible.db')
    const db = new DatabaseSync(file)
    const at = '2026-10-30T10:00:00.000Z'
    const fact = (id, predicate, object, from, to, extra = {}) => db.prepare(`insert into facts (id, kind, subject, predicate, object, value, statement, t_from, t_to, time_label, precision, status, confidence, origin, created_at, project_id)
      values (?, 'event', 'Leya', ?, ?, ?, 'x', ?, ?, 'label', 'exact', 'canon', 1, 'manual', ?, ?)`).run(id, predicate, object, extra.value ?? null, from, to, at, pid)
    // Leya is at the Harbor until minute 100 and at the Lighthouse from minute 120: a 20 min gap on a 40 min trip.
    fact('f_route', 'travel_time', 'Lighthouse', null, null, { value: '40' })
    db.prepare(`update facts set subject = 'Harbor' where id = 'f_route'`).run()
    fact('f_a', 'located_at', 'Harbor', 90, 100)
    fact('f_b', 'located_at', 'Lighthouse', 120, 130)
    db.close()
    const scan = async (defaults) => {
      if (defaults !== undefined) assert.equal((await api(`/api/projects/${pid}`, 'PATCH', { severity_defaults: defaults })).status, 200)
      const d = new DatabaseSync(file); d.prepare('delete from conflicts').run(); d.close()
      assert.equal((await api('/api/conflicts/scan', 'POST')).status, 200)
      const rows = (await api('/api/conflicts')).data
      return rows.filter(c => c.rule === 'TRAVEL_TIME_TOO_SHORT').map(c => c.severity)
    }
    check('no override: 20 of 40 min is near the limit, soft', await scan(), ['soft'])
    check('explicit Hard (same as built-in): always hard', await scan({ TRAVEL_TIME_TOO_SHORT: 'hard' }), ['hard'])
    check('explicit Soft: soft', await scan({ TRAVEL_TIME_TOO_SHORT: 'soft' }), ['soft'])
    // Overrides merge, so clear the earlier travel override first: with only another rule set, travel must keep its built-in default.
    { const d = new DatabaseSync(file); d.prepare(`update projects set severity_defaults = '{}' where id = ?`).run(pid); d.close() }
    check('setting only another rule leaves the travel default (soft) alone', await scan({ EXACT_TIME_LOCATION_OVERLAP: 'soft' }), ['soft'])
    console.log('severity explicit-default probe: all checks passed')
  } finally {
    server?.kill()
    await new Promise(r => setTimeout(r, 300))
    rmSync(dir, { recursive: true, force: true })
  }
}
