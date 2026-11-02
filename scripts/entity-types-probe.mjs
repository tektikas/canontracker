// Per-project entity types probe.
//   node scripts/entity-types-probe.mjs <baseUrl>          against a running server (throwaway accounts)
//   node scripts/entity-types-probe.mjs migrate [port]     builds a v14 database (schema read from git, before entity types
//                                                          existed), starts the built server on it in a temp folder (run
//                                                          `pnpm build` first; default port 3999) and checks the upgrade
// Checks: medium defaults; add / rename / recolour / remove; a type in use can only be removed by naming where its pages go,
// and the audit event lists them; the last type stays; kind guessing only uses types the project has; exports group by type.
// Upgrade: existing pages keep their kind, every kind in use becomes a type, nothing is rebuilt or lost.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes, scryptSync } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label}`) }
function client(base) {
  let cookie = ''
  const call = async (path, { method = 'GET', body, query } = {}) => {
    const res = await fetch(base + path + (query ? `?${new URLSearchParams(query)}` : ''), { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
  call.cookie = () => cookie
  return call
}
const GAME = ['character', 'npc', 'location', 'item', 'ability', 'quest', 'faction', 'event', 'other']
const PROSE = ['character', 'location', 'item', 'faction', 'event', 'other']

if (process.argv[2] === 'migrate') await migrate(Number(process.argv[3] ?? 3999))
else await api(process.argv[2] ?? 'http://localhost:3000')

async function api(base) {
  const run = Date.now().toString(36)
  const a = client(base)
  check('sign up', (await a('/api/auth/signup', { method: 'POST', body: { name: 'Ada', email: `types-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  const studio = (await a('/api/studios', { method: 'POST', body: { name: 'Types Studio' } })).data
  await a('/api/projects', { method: 'POST', body: { name: 'Types game', studio_id: studio.id } })
  const types = async () => (await a('/api/entity-types')).data
  check('a game project starts with the game defaults', (await types()).map(t => t.key), GAME)

  // Add: key from the name, placed before Other; names are unique (singular or plural, any case).
  const spell = await a('/api/entity-types', { method: 'POST', body: { one: 'Spell', color: 'bad', icon: 'ability' } })
  check('add Spell', [spell.status, spell.data], [200, { key: 'spell', one: 'Spell', many: 'Spells', color: 'bad', icon: 'ability' }])
  check('a new type goes before Other', (await types()).map(t => t.key).slice(-2), ['spell', 'other'])
  check('same name refused', (await a('/api/entity-types', { method: 'POST', body: { one: 'spells' } })).status, 409)
  check('bad colour refused', (await a('/api/entity-types', { method: 'POST', body: { one: 'Ship', color: 'pink' } })).status, 400)
  check('bad icon refused', (await a('/api/entity-types', { method: 'POST', body: { one: 'Ship', icon: 'rocket' } })).status, 400)
  check('accented name gets a plain key', (await a('/api/entity-types', { method: 'POST', body: { one: 'Épée' } })).data.key, 'epee')

  // Pages use the project's types only.
  const fireball = (await a('/api/entities', { method: 'POST', body: { name: `Fireball ${run}`, kind: 'spell' } }))
  check('page of a new type', fireball.status, 200)
  check('unknown type refused', (await a('/api/entities', { method: 'POST', body: { name: `Nope ${run}`, kind: 'vehicle' } })).status, 400)
  const ward = (await a('/api/entities', { method: 'POST', body: { name: `Ward ${run}`, kind: 'spell' } })).data

  // Rename and recolour: labels only, pages keep their type.
  const ren = await a('/api/entity-types/spell', { method: 'PATCH', body: { one: 'Incantation', many: 'Incantations', color: 'accent' } })
  check('rename + recolour', [ren.status, ren.data.key, ren.data.one, ren.data.color], [200, 'spell', 'Incantation', 'accent'])
  check('renaming onto another type refused', (await a('/api/entity-types/spell', { method: 'PATCH', body: { one: 'Item' } })).status, 409)
  check('pages kept their type', (await a(`/api/entities/${fireball.data.id}`)).data.kind, 'spell')
  check('page count per type', (await types()).find(t => t.key === 'spell').pages, 2)

  // Remove: in use needs a destination; the audit event lists every page moved.
  const refused = await a('/api/entity-types/spell', { method: 'DELETE' })
  check('removing a type in use without a destination: 409 IN_USE', [refused.status, refused.data.statusMessage], [409, 'IN_USE'])
  check('a type is not its own destination', (await a('/api/entity-types/spell', { method: 'DELETE', query: { move_to: 'spell' } })).status, 409)
  const del = await a('/api/entity-types/spell', { method: 'DELETE', query: { move_to: 'ability' } })
  check('remove with move_to', [del.status, del.data.moved, del.data.moved_to], [200, 2, 'ability'])
  check('pages moved', [(await a(`/api/entities/${fireball.data.id}`)).data.kind, (await a(`/api/entities/${ward.id}`)).data.kind], ['ability', 'ability'])
  const ev = (await a('/api/audit')).data.find(e => e.event_type === 'entity_type.deleted' && e.target_id === 'spell')
  check('audit lists the moved pages', ev.detail.entities.map(x => x.id).sort(), [fireball.data.id, ward.id].sort())
  check('unused type removes without a destination', (await a('/api/entity-types/epee', { method: 'DELETE' })).status, 200)
  check('unknown type 404', (await a('/api/entity-types/spell', { method: 'PATCH', body: { one: 'X' } })).status, 404)

  // Kind guessing only names types the project has: without Location, Lantern Row's places fall back to Other.
  check('remove Location (unused)', (await a('/api/entity-types/location', { method: 'DELETE' })).status, 200)
  check('load lantern-row', (await a('/api/demo/load', { method: 'POST', body: { set: 'lantern-row' } })).status, 200)
  const keys = new Set((await types()).map(t => t.key))
  const ents = (await a('/api/entities')).data
  check('filed pages exist', ents.length > 0, true)
  check('every filed page has a type of the project', ents.filter(e => !keys.has(e.kind)).map(e => e.kind), [])
  check('types survive a sample load', keys.has('ability') && !keys.has('location'), true)

  // The bible groups by the project's types and carries their labels.
  const bible = (await a('/api/export/bible')).data
  check('bible carries the types of the pages shown, in project order', bible.types.map(t => t.key), [...keys].filter(k => bible.entities.some(e => e.kind === k)))
  const md = (await a('/api/export/bible', { query: { format: 'md' } })).data
  check('markdown has a section per type', bible.types.every(t => md.includes(`## ${t.many}\n`)), true)
  // The book (EPUB; the print view builds the same chapters) has a chapter per type, under the project's own label.
  check('rename Character to Hero', (await a('/api/entity-types/character', { method: 'PATCH', body: { one: 'Hero', many: 'Heroes' } })).status, 200)
  const epub = join(mkdtempSync(join(tmpdir(), 'types-epub-')), 'b.epub')
  writeFileSync(epub, Buffer.from(await (await fetch(`${base}/api/export/bible?book=bible&format=epub`, { headers: { cookie: a.cookie() } })).arrayBuffer()))
  const nav = execFileSync('unzip', ['-p', epub, 'OEBPS/nav.xhtml']).toString()
  const booked = (await a('/api/export/bible', { query: { book: 'bible' } })).data.types
  check('book chapters follow the project types and labels', [booked.every(t => nav.includes(`>${t.many}<`)), nav.includes('>Heroes<'), nav.includes('>Characters<')], [true, true, false])

  // A project always keeps one type; a viewer cannot change types (guard).
  for (const t of (await types()).slice(1)) {
    const r = await a(`/api/entity-types/${t.key}`, { method: 'DELETE', query: t.pages ? { move_to: (await types())[0].key } : {} })
    assert.equal(r.status, 200, `remove ${t.key}`)
  }
  const last = (await types())[0]
  check('the last type cannot be removed', (await a(`/api/entity-types/${last.key}`, { method: 'DELETE' })).status, 400)
  // Projects are made as games; setting the medium before any page exists swaps the untouched defaults, keeps the team's own.
  const p2 = (await a('/api/projects', { method: 'POST', body: { name: 'Types novel', studio_id: studio.id } })).data
  check('new project: game defaults', (await types()).map(t => t.key), GAME)
  await a('/api/entity-types', { method: 'POST', body: { one: 'Motif' } })
  await a('/api/entity-types/npc', { method: 'PATCH', body: { one: 'Extra', many: 'Extras' } })
  check('medium → prose', (await a(`/api/projects/${p2.id}`, { method: 'PATCH', body: { medium: 'prose' } })).status, 200)
  check('no pages yet: prose defaults, plus the types the team made or edited', (await types()).map(t => t.key).sort(), [...PROSE, 'motif', 'npc'].sort())
  check('a page exists', (await a('/api/entities', { method: 'POST', body: { name: `Mara ${run}`, kind: 'character' } })).status, 200)
  await a(`/api/projects/${p2.id}`, { method: 'PATCH', body: { medium: 'game' } })
  check('with pages, a medium change leaves types alone', (await types()).map(t => t.key).sort(), [...PROSE, 'motif', 'npc'].sort())
  console.log('entity types probe: all checks passed')
}

async function migrate(port) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const dir = mkdtempSync(join(tmpdir(), 'sb-types-'))
  mkdirSync(join(dir, '.data'))
  const file = join(dir, '.data', 'storybible.db')
  let server
  try {
    // b0cf9c7: master at v14, the last schema without entity types.
    const old = execFileSync('git', ['show', 'b0cf9c7:server/utils/db.ts'], { cwd: root, encoding: 'utf8' })
    const schema = old.slice(old.indexOf('const SCHEMA = `') + 16, old.indexOf('`\n\nlet db'))
    assert.ok(/SCHEMA_VERSION = 14\b/.test(old) && !schema.includes('entity_types'), 'v14 schema found')
    const db = new DatabaseSync(file)
    db.exec(schema)
    db.exec('pragma user_version = 14')
    const at = '2026-10-30T10:00:00.000Z'
    const salt = randomBytes(16)
    db.prepare('insert into users values (?, ?, ?, ?, ?, ?)').run('usr_m', 'mig@probe.test', 'Ada', `scrypt$${salt.toString('hex')}$${scryptSync('correct horse', salt, 64).toString('hex')}`, 'prj_g', at)
    db.prepare('insert into studios values (?, ?, ?, ?)').run('std_m', 'Tidewright', 'usr_m', at)
    db.prepare('insert into memberships values (?, ?, ?, ?)').run('std_m', 'usr_m', 'owner', at)
    db.prepare(`insert into projects (id, studio_id, name, created_at, medium) values ('prj_g', 'std_m', 'Broken Tide', ?, 'game'), ('prj_p', 'std_m', 'Lantern Row', ?, 'prose')`).run(at, at)
    const ent = db.prepare(`insert into entities (id, name, analysis_name, kind, origin, created_at, updated_at, project_id) values (?, ?, ?, ?, 'canon', ?, ?, ?)`)
    const rows = [['e1', 'Leya', 'character', 'prj_g'], ['e2', 'Harbor', 'location', 'prj_g'], ['e3', 'Chord Stone', 'item', 'prj_g'], ['e4', 'Tide Guard', 'faction', 'prj_g'],
      ['e5', 'The Storm', 'event', 'prj_g'], ['e6', 'Fog', 'other', 'prj_g'], ['e7', 'Mara', 'character', 'prj_p'], ['e8', 'Lantern', 'other', 'prj_p'],
      // A kind no build ever offered (written outside the app): it must survive as a type of its own.
      ['e9', 'The Gull', 'vessel', 'prj_p']]
    for (const [id, name, kind, p] of rows) ent.run(id, name, name, kind, at, at, p)
    const before = db.prepare('select id, name, kind, project_id from entities order by id').all().map(r => ({ ...r }))
    db.close()

    server = spawn(process.execPath, [join(root, '.output/server/index.mjs')], { cwd: dir, stdio: 'ignore',
      env: { ...process.env, PORT: String(port), HOST: 'localhost', NUXT_SESSION_PASSWORD: randomBytes(24).toString('hex'), NUXT_MODEL_MODE: 'mock' } })
    const base = `http://localhost:${port}`
    for (let i = 0; ; i++) {
      try { await fetch(`${base}/api/health`); break } catch {}
      if (i > 100) throw new Error('server did not start')
      await new Promise(r => setTimeout(r, 100))
    }
    const peek = fn => { const d = new DatabaseSync(file, { readOnly: true }); try { return fn(d) } finally { d.close() } }
    check('upgrade in place: still v14, table added, no rebuild', peek(d => [d.prepare('pragma user_version').get().user_version, !!d.prepare(`select 1 from sqlite_master where name = 'entity_types'`).get(), d.prepare('select count(*) n from entities').get().n]), [14, true, rows.length])
    const a = client(base)
    check('log in', (await a('/api/auth/login', { method: 'POST', body: { email: 'mig@probe.test', password: 'correct horse' } })).status, 200)
    check('game project: game defaults', (await a('/api/entity-types')).data.map(t => [t.key, t.pages]), GAME.map(k => [k, ['character', 'location', 'item', 'faction', 'event', 'other'].includes(k) ? 1 : 0]))
    check('switch to the prose project', (await a('/api/projects/prj_p/switch', { method: 'POST' })).status, 200)
    const prose = (await a('/api/entity-types')).data
    check('prose project: prose defaults plus the kind in use', prose.map(t => t.key), [...PROSE, 'vessel'])
    check('an unknown kind gets a readable type', prose.at(-1), { key: 'vessel', one: 'Vessel', many: 'Vessels', color: 'neutral', icon: 'other', pages: 1 })
    check('no page changed kind, nothing lost', peek(d => d.prepare('select id, name, kind, project_id from entities order by id').all().map(r => ({ ...r }))), before)
    check('seeding is idempotent (no duplicate rows on later reads)', await (async () => {
      await a('/api/entity-types'); await a('/api/entities')
      return peek(d => d.prepare('select project_id, count(*) n from entity_types group by project_id order by project_id').all().map(r => [r.project_id, r.n]))
    })(), [['prj_g', GAME.length], ['prj_p', PROSE.length + 1]])
    console.log('entity types migration probe: all checks passed')
  } finally {
    server?.kill()
    await new Promise(r => setTimeout(r, 300))
    rmSync(dir, { recursive: true, force: true })
  }
}
