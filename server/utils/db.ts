import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

export const ACTOR = 'demo-user'

// Bump when the schema changes; a mismatched local demo DB is rebuilt (it holds demo data only).
const SCHEMA_VERSION = 2

const SCHEMA = `
create table if not exists documents (
  id text primary key, title text not null, filename text not null, kind text not null,
  sha256 text not null unique, version integer not null, content text not null, imported_at text not null
);
create table if not exists passages (
  id text primary key, document_id text not null references documents(id), ordinal integer not null,
  start_line integer not null, end_line integer not null, text text not null
);
-- candidates and canon share this table; status: pending | canon | rejected | superseded
create table if not exists facts (
  id text primary key, kind text not null, subject text not null, predicate text not null, object text, value text,
  statement text not null, t_from integer, t_to integer, time_label text, precision text,
  status text not null, confidence real, origin text not null, model_id text, version integer not null default 1,
  supersedes_id text, created_at text not null, decided_at text, rationale text
);
create table if not exists evidence (
  id text primary key, fact_id text not null references facts(id), document_id text not null,
  passage_id text, quote text not null, verified integer not null, support text not null default 'states'
);
-- origin: rule (deterministic code) | model (model-suggested, labeled as such)
create table if not exists conflicts (
  id text primary key, left_fact_id text not null, right_fact_id text not null, rule text not null, origin text not null,
  model_id text, rationale text not null, confidence real not null, status text not null, pair_hash text not null unique,
  created_at text not null, decided_at text, decision_rationale text
);
-- status: ready_for_review | applied | rejected | reverted
create table if not exists changes (
  id text primary key, target_fact_id text not null, before_statement text not null, proposed_statement text not null,
  rationale text not null, status text not null, impact text, new_fact_id text, reverted_fact_id text,
  created_at text not null, decided_at text, decision_rationale text, reverted_at text, revert_rationale text
);
create table if not exists audit_events (
  id text primary key, event_type text not null, target_type text not null, target_id text not null,
  actor text not null, detail text not null, created_at text not null
);
-- One row per model call: what was asked, with which sources, how it went. No prompts, keys or full documents.
create table if not exists model_calls (
  id text primary key, purpose text not null, model_id text not null, prompt_version text not null,
  target_type text not null, target_id text not null, input_refs text not null, status text not null,
  latency_ms integer not null, output_summary text, error text, created_at text not null
);
create table if not exists eval_runs (
  id text primary key, dataset text not null, model_id text not null, results text not null, created_at text not null
);
`

let db: DatabaseSync | undefined

export function useDb() {
  if (db) return db
  mkdirSync('.data', { recursive: true })
  db = new DatabaseSync('.data/storybible.db')
  const { user_version } = db.prepare('pragma user_version').get() as { user_version: number }
  if (user_version !== SCHEMA_VERSION) {
    const tables = db.prepare(`select name from sqlite_master where type = 'table'`).all() as { name: string }[]
    db.exec('pragma foreign_keys = off')
    for (const t of tables) db.exec(`drop table "${t.name}"`)
    db.exec(`pragma foreign_keys = on; pragma user_version = ${SCHEMA_VERSION}`)
  }
  db.exec(SCHEMA)
  return db
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`
export const now = () => new Date().toISOString()

export function tx<T>(fn: () => T): T {
  const d = useDb()
  d.exec('begin')
  try {
    const result = fn()
    d.exec('commit')
    return result
  } catch (e) {
    d.exec('rollback')
    throw e
  }
}

export function audit(eventType: string, targetType: string, targetId: string, detail: Record<string, unknown> = {}) {
  useDb().prepare('insert into audit_events values (?, ?, ?, ?, ?, ?, ?)')
    .run(newId('aud'), eventType, targetType, targetId, ACTOR, JSON.stringify(detail), now())
}

export function resetData() {
  tx(() => {
    for (const t of ['model_calls', 'eval_runs', 'audit_events', 'changes', 'conflicts', 'evidence', 'facts', 'passages', 'documents'])
      useDb().exec(`delete from ${t}`)
  })
}

export interface Fact {
  id: string, kind: string, subject: string, predicate: string, object: string | null, value: string | null, statement: string
  t_from: number | null, t_to: number | null, time_label: string | null, precision: string | null
  status: string, confidence: number | null, origin: string, model_id: string | null, version: number
  supersedes_id: string | null, created_at: string, decided_at: string | null, rationale: string | null
}

export interface DocumentRow { id: string, title: string, filename: string, kind: string, sha256: string, version: number, content: string, imported_at: string }
export interface PassageRow { id: string, document_id: string, ordinal: number, start_line: number, end_line: number, text: string }
export interface EvidenceRow {
  id: string, passage_id: string | null, quote: string, verified: number, support: string, document_id: string, document_filename: string
  document_title: string, document_kind: string, document_version: number, latest_version: number, start_line: number | null, end_line: number | null
}
export interface ConflictRow {
  id: string, left_fact_id: string, right_fact_id: string, rule: string, origin: string, model_id: string | null, rationale: string
  confidence: number, status: string, pair_hash: string, created_at: string, decided_at: string | null, decision_rationale: string | null
}
export interface ChangeRow {
  id: string, target_fact_id: string, before_statement: string, proposed_statement: string, rationale: string, status: string
  impact: string | null, new_fact_id: string | null, reverted_fact_id: string | null, created_at: string, decided_at: string | null
  decision_rationale: string | null, reverted_at: string | null, revert_rationale: string | null
}
export interface AuditRow { id: string, event_type: string, target_type: string, target_id: string, actor: string, detail: string, created_at: string }
export interface ModelCallRow {
  id: string, purpose: string, model_id: string, prompt_version: string, target_type: string, target_id: string, input_refs: string
  status: string, latency_ms: number, output_summary: string | null, error: string | null, created_at: string
}

export function getFact(id: string) {
  const fact = useDb().prepare('select * from facts where id = ?').get(id) as unknown as Fact | undefined
  if (!fact) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: `Fact ${id} not found.` })
  return fact
}

// Facts with their evidence resolved to document + line range, for the UI.
// latest_version > document_version means the citation points at an older version of the source (stale).
export function listFacts(where = '1 = 1', ...params: (string | number)[]) {
  const d = useDb()
  const facts = d.prepare(`select * from facts where ${where} order by rowid`).all(...params) as unknown as Fact[]
  const ev = d.prepare(`
    select e.id, e.passage_id, e.quote, e.verified, e.support, e.document_id, doc.filename document_filename,
      doc.title document_title, doc.kind document_kind, doc.version document_version, p.start_line, p.end_line,
      (select max(d2.version) from documents d2 where d2.filename = doc.filename) latest_version
    from evidence e join documents doc on doc.id = e.document_id left join passages p on p.id = e.passage_id
    where e.fact_id = ? order by e.rowid`)
  return facts.map(f => ({ ...f, evidence: ev.all(f.id) as unknown as EvidenceRow[] }))
}

export const normEntity = (s: string | null | undefined) => s?.trim().toLowerCase() || null
