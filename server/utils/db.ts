import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { RecheckState, StaleCitation } from './recheck'

// Bump when the schema changes; a mismatched local demo DB is rebuilt (it holds demo data only).
export const SCHEMA_VERSION = 15

const SCHEMA = `
-- Accounts. A studio is the company workspace; memberships carry the role (owner | admin | editor | viewer) for all its projects.
create table if not exists users (
  id text primary key, email text not null unique, name text not null, password_hash text not null,
  last_project_id text, created_at text not null
);
create table if not exists studios (id text primary key, name text not null, created_by text not null, created_at text not null);
create table if not exists memberships (
  studio_id text not null references studios(id), user_id text not null references users(id), role text not null,
  created_at text not null, primary key (studio_id, user_id)
);
-- Invite by link. The token is the link; it works once, until it expires or is revoked.
create table if not exists invites (
  id text primary key, studio_id text not null references studios(id), token text not null unique, role text not null,
  created_by text not null, created_at text not null, expires_at text not null,
  accepted_by text, accepted_at text, revoked_at text
);
-- medium: game | prose | screen (decides the entity wiki's extra fields). art_style goes into every image prompt.
create table if not exists projects (
  id text primary key, studio_id text not null references studios(id), name text not null, created_at text not null,
  medium text not null default 'game', art_style text not null default '',
  severity_defaults text not null default '{}'
);

-- Per-user API tokens for the MCP endpoint. Only the sha256 of the secret is stored; one project each; role is the user's live role.
create table if not exists api_tokens (
  id text primary key, user_id text not null references users(id), project_id text not null references projects(id), name text not null,
  token_hash text not null unique, prefix text not null, created_at text not null, last_used_at text, revoked_at text
);

-- Read-only share links to a project's story bible. Only the sha256 of the link token is stored. options: the bible's
-- scope, sections and images (JSON, see shared/utils/bible.ts). expires_at null = never. open_count/last_opened_at: link use.
create table if not exists share_links (
  id text primary key, project_id text not null references projects(id), name text not null, token_hash text not null unique,
  prefix text not null, options text not null, created_by text not null, created_at text not null, expires_at text,
  revoked_at text, revoked_by text, last_opened_at text, open_count integer not null default 0
);

-- Content. Every row belongs to one project; routes only ever read and write the caller's current project.
-- origin: import (an uploaded file) | written (written in the app; each save is a new read-only version). created_by: who saved it.
-- One row per version. filename: the document's key, shared by its versions and unique per document in the project. name: the
-- file's own name; an upload is the next version of the document with that name in the folder it lands in (see importer.ts).
create table if not exists documents (
  id text primary key, title text not null, filename text not null, name text not null, kind text not null,
  sha256 text not null, version integer not null, content text not null, imported_at text not null,
  project_id text not null references projects(id), origin text not null default 'import', created_by text, folder_id text,
  unique (project_id, sha256)
);
-- Library organisation. Editorial labels on a document (by filename, so every version shares them); never part of its text
-- or hash. title, kind and folder_id live on every version row of a filename and change together; a new version inherits them.
-- Folders nest at most two levels (a folder's parent has no parent). color: a design-token name (accent | good | warn | bad | pencil).
create table if not exists folders (
  id text primary key, name text not null, parent_id text, created_by text not null, created_at text not null, project_id text not null
);
create table if not exists tags (
  id text primary key, name text not null, color text not null, created_by text not null, created_at text not null, project_id text not null
);
create table if not exists document_tags (project_id text not null, filename text not null, tag_id text not null, primary key (project_id, filename, tag_id));
-- Unsaved writing, private to its author. filename: the written document it edits (null for a new one). Saving turns it into
-- a document version and deletes the draft.
create table if not exists drafts (
  id text primary key, filename text, title text not null default '', kind text not null default 'scene', content text not null default '',
  user_id text not null, created_at text not null, updated_at text not null, project_id text not null, base_document_id text
);
-- Editorial notes pinned to a passage. Never canon, never used by conflicts or impact. status: open | ready | done.
create table if not exists notes (
  id text primary key, document_id text not null, passage_id text not null, quote text not null, body text not null, status text not null,
  created_by text not null, created_at text not null, updated_by text, updated_at text not null, project_id text not null
);
-- Re-review tasks: one per scene in an applied change's impact manifest. status: open | in_progress | done | wont_fix | not_needed
-- (not_needed is set only by reverting the change). path, evidence_ids and rationale are copied from the manifest. Editorial; never canon.
create table if not exists tasks (
  id text primary key, change_id text not null, document_id text not null, passage_id text, status text not null,
  assignee_id text, due_date text, comment text not null default '', path text not null, evidence_ids text not null,
  rationale text not null, hop_count integer not null, created_at text not null, updated_by text, updated_at text not null, project_id text not null
);
-- start_ms/end_ms/speaker: only on a recording's transcript (one passage per transcribed turn; times from the audio start).
create table if not exists passages (
  id text primary key, document_id text not null references documents(id), ordinal integer not null,
  start_line integer not null, end_line integer not null, text text not null, project_id text not null,
  start_ms integer, end_ms integer, speaker text
);
-- A recording's transcript version (documents.origin = 'recording'): the audio it was transcribed from (stored once per sha256 in
-- .data/recordings/<project>/, served only through the project guard), how, and the script document it is compared with
-- (script_key = documents.filename; the same on every version of the recording). A new transcription is a new version.
create table if not exists recordings (
  document_id text primary key, audio_sha256 text not null, bytes integer not null, duration_ms integer not null, original_name text not null,
  model_id text not null, mode text not null, session_ids text not null default '[]', script_key text,
  created_by text not null, created_at text not null, project_id text not null
);
-- candidates and canon share this table; status: pending | canon | rejected | superseded
-- origin: model:<prompt> (extracted) | human (a person added it from a passage they selected; created_by) | change:<id>
create table if not exists facts (
  id text primary key, kind text not null, subject text not null, predicate text not null, object text, value text,
  statement text not null, t_from integer, t_to integer, time_label text, precision text,
  status text not null, confidence real, origin text not null, model_id text, version integer not null default 1,
  supersedes_id text, created_at text not null, decided_at text, rationale text, decided_by text, project_id text not null,
  created_by text, -- set when a person authored it by hand
  proposed_by_token text, proposed_by_user text -- set when an agent proposed it over MCP
);
-- checked_version: a canon citation whose quote is gone from a newer version of its source, and that a person chose to keep
-- as it is: the source version they checked it against. A later version asks again. (server/utils/recheck.ts)
create table if not exists evidence (
  id text primary key, fact_id text not null references facts(id), document_id text not null,
  passage_id text, quote text not null, verified integer not null, support text not null default 'states', project_id text not null,
  checked_version integer
);
-- origin: rule (deterministic code) | model (model-suggested, labeled as such)
-- severity: hard (breaks canon) | soft (worth a look); set from the rule's default, a person can change it (audited)
-- status: open | confirmed | false_positive | uncertain | resolved_by_merge (merge_audit_id = the entity.merged event)
create table if not exists conflicts (
  id text primary key, left_fact_id text not null, right_fact_id text not null, rule text not null, origin text not null,
  model_id text, rationale text not null, confidence real not null, status text not null, pair_hash text not null unique,
  created_at text not null, decided_at text, decision_rationale text, decided_by text, merge_audit_id text, project_id text not null,
  severity text not null default 'soft'
);
-- status: ready_for_review | applied | rejected | reverted
-- impact_stale: set (JSON: the merge that outdated it) when a merge changed the impact; accept needs a fresh analysis first.
create table if not exists changes (
  id text primary key, target_fact_id text not null, before_statement text not null, proposed_statement text not null,
  rationale text not null, status text not null, impact text, impact_stale text, new_fact_id text, reverted_fact_id text,
  created_at text not null, decided_at text, decision_rationale text, reverted_at text, revert_rationale text,
  decided_by text, reverted_by text, project_id text not null
);
-- Entity wiki pages. Editorial metadata only (summary, aliases, fields, notes, portrait): never canon, never used by
-- conflicts or impact. origin: canon (filed automatically for a name in accepted canon) | manual.
-- analysis_name: the one name analysis (facts, conflicts, impact, merges) knows this entity by. Set once — when canon files
-- the page, or when a renamed or merged page first needs it — and never changed by renames, alias edits or usage counts.
-- Null on a hand-made page nothing has pinned yet; its title stands in until then.
create table if not exists entities (
  id text primary key, name text not null, analysis_name text, kind text not null, summary text not null default '', aliases text not null default '[]',
  fields text not null default '{}', notes text not null default '', portrait_type text, portrait_at text, origin text not null,
  created_at text not null, created_by text, updated_at text not null, updated_by text, project_id text not null
);
-- The project's entity types (seeded per project by seedEntityTypes; see shared/utils/entities.ts). key: what entities.kind
-- stores, fixed at creation. one/many: labels; color: a design-token name; icon: an Icon.vue name; position: display order.
-- A new table only, so an existing database gains it in place (create if not exists) without a version bump.
create table if not exists entity_types (
  project_id text not null, key text not null, one text not null, many text not null, color text not null, icon text not null,
  position integer not null, created_at text not null, primary key (project_id, key)
);
-- An entity's or document's image history: generated (Muse Image) and uploaded images together. Editorial, never canon.
-- target_type: entity (portrait) | document (cover). applied_at is set on the one image currently used as the target's
-- portrait or cover; the bytes live next to portraits. source: generated | upload. An upload has no prompt, style or model
-- (empty strings) and keeps its original file name. caption: the team's own words about the picture.
create table if not exists images (
  id text primary key, target_type text not null, target_id text not null, prompt text not null, style text not null,
  model_id text not null, mime text not null, bytes integer not null, created_at text not null, created_by text not null,
  applied_at text, project_id text not null, source text not null default 'generated', caption text not null default '', filename text
);
-- Identity decisions from merges: a name that was merged away maps to the kept entity's analysis_name (renaming or deleting
-- the page later doesn't change it; merging the kept entity on moves the row along). Applied when a later candidate naming it
-- is accepted. Only merges write here; hand-typed aliases and titles never feed analysis.
create table if not exists entity_merges (
  name_norm text not null, name text not null, canonical text not null, audit_id text not null, merged_at text not null,
  merged_by text not null, project_id text not null, primary key (project_id, name_norm)
);
create table if not exists audit_events (
  id text primary key, event_type text not null, target_type text not null, target_id text not null,
  actor text not null, detail text not null, created_at text not null, project_id text not null
);
-- One row per model call: what was asked, with which sources, how it went. input is the fact list an answer or rule check
-- was given (canon the project can already read), so the trace shows what the model saw. No system prompts, keys or full documents.
create table if not exists model_calls (
  id text primary key, purpose text not null, model_id text not null, prompt_version text not null,
  target_type text not null, target_id text not null, input_refs text not null, input text, status text not null,
  latency_ms integer not null, output_summary text, error text, created_at text not null, project_id text not null
);
-- Research notes: a real-world question answered from outside sources and deterministic calculators (server/utils/research.ts).
-- Never canon. verdict: established | speculative | contradicts | unknown. claims, sources, calculations, searches: JSON (see
-- ResearchNote). recorded = 1: replayed from the probe fixture, not a live run. conversation_id: the conversation it was asked
-- in (null: asked on /research). document_id: the read-only basis document made the first time the note is promoted (facts
-- cite it like any source). pin_*: the story passage the note is pinned to, like a note.
create table if not exists research_notes (
  id text primary key, question text not null, answer text not null, verdict text not null, why text not null default '',
  claims text not null default '[]', sources text not null default '[]', calculations text not null default '[]', searches text not null default '[]',
  model_id text not null, prompt_version text not null, recorded integer not null default 0, conversation_id text, created_by text not null,
  created_at text not null, document_id text, pin_document_id text, pin_passage_id text, pin_quote text, pinned_by text, pinned_at text,
  project_id text not null
);
create index if not exists research_notes_project on research_notes(project_id);
create table if not exists eval_runs (
  id text primary key, dataset text not null, model_id text not null, results text not null, created_at text not null, project_id text not null
);
-- Ask: team conversations. Every member of the project reads every conversation and may post in any (viewers too: they can
-- ask). mode: the mode the last message used (the switch's default). Titles start as the first question and are editable.
-- A new table only, so an existing database gains it in place (create if not exists) without a version bump.
create table if not exists conversations (
  id text primary key, title text not null, mode text not null, created_by text not null, created_at text not null,
  updated_by text not null, updated_at text not null, project_id text not null
);
-- One row per message. role: user | assistant. author_id: who wrote it (a user message) or whose question it answers (an
-- assistant message). mode: canon | research. text: plain text (search, history). parts: JSON, see server/utils/conversations.ts
-- (text, a canon answer with fact ids, a research answer with note ids, a follow-up question, an error). context: the chips the
-- author attached (resolved on the server). reply_to: the user message an answer answers, or the follow-up a reply continues.
create table if not exists messages (
  id text primary key, conversation_id text not null, role text not null, author_id text not null, mode text not null,
  text text not null, parts text not null, context text not null default '[]', reply_to text, created_at text not null, project_id text not null
);
create index if not exists conversations_project on conversations(project_id, updated_at);
create index if not exists messages_conversation on messages(conversation_id);
create index if not exists facts_project on facts(project_id, status);
create index if not exists evidence_fact on evidence(fact_id);
create index if not exists passages_document on passages(document_id);
create index if not exists entities_project on entities(project_id);
create index if not exists images_target on images(project_id, target_type, target_id);
create index if not exists audit_project on audit_events(project_id);
create index if not exists memberships_user on memberships(user_id);
create index if not exists notes_project on notes(project_id, status);
create index if not exists tasks_project on tasks(project_id, status);
create index if not exists tasks_change on tasks(change_id);
`

let db: DatabaseSync | undefined

// The connection is shared only once it is fully set up: if the upgrade fails, it is closed and the next request tries again.
export function useDb() {
  if (db) return db
  mkdirSync('.data', { recursive: true })
  const conn = new DatabaseSync('.data/storybible.db', { timeout: 5000 }) // another process's write: wait for it, don't fail
  try {
    const user_version = schemaVersion(conn)
    if (user_version >= 12 && user_version < SCHEMA_VERSION) {
      if (user_version === 12) migrate12(conn)
      if (user_version <= 13) migrate13(conn)
      migrate14(conn)
    } else if (user_version !== SCHEMA_VERSION) {
      const tables = conn.prepare(`select name from sqlite_master where type = 'table'`).all() as { name: string }[]
      conn.exec('pragma foreign_keys = off')
      for (const t of tables) conn.exec(`drop table "${t.name}"`)
      conn.exec(`pragma foreign_keys = on; pragma user_version = ${SCHEMA_VERSION}`)
    }
    conn.exec(SCHEMA)
    // Columns added in place, no version bump: drafts.base_document_id (the version an edit draft started from; null on older
    // drafts = unknown); model_calls.step/tool/tokens (an agent run's step index, the tool a row ran, tokens the model used);
    // projects.research_profile (JSON, see shared/utils/research.ts).
    // passages.start_ms/end_ms/speaker (recording transcripts); null on every text document.
    for (const [table, column, type] of [['drafts', 'base_document_id', 'text'], ['model_calls', 'step', 'integer'], ['model_calls', 'tool', 'text'],
      ['model_calls', 'tokens', 'integer'], ['projects', 'research_profile', `text not null default '{}'`],
      ['passages', 'start_ms', 'integer'], ['passages', 'end_ms', 'integer'], ['passages', 'speaker', 'text']] as const) {
      if (!(conn.prepare(`pragma table_info(${table})`).all() as { name: string }[]).some(r => r.name === column))
        conn.exec(`alter table ${table} add column ${column} ${type}`)
    }
  } catch (e) {
    conn.close()
    throw e
  }
  return (db = conn)
}

// What the database file itself says, not what this build expects.
export const schemaVersion = (d = useDb()) => (d.prepare('pragma user_version').get() as { user_version: number }).user_version

// v12 → v13: images gain source, caption and filename. A portrait uploaded before then had no history row (only the
// entity's own copy of the file); it becomes an upload row in use, with its own copy of the bytes, credited to whoever
// uploaded it per the audit trail. Nothing else changes, so the data survives the upgrade.
function migrate12(db: DatabaseSync) {
  const copies: string[] = []
  db.exec('begin')
  try {
    db.exec(`alter table images add column source text not null default 'generated';
      alter table images add column caption text not null default '';
      alter table images add column filename text`)
    const orphans = db.prepare(`select e.* from entities e where e.portrait_type is not null and not exists
      (select 1 from images i where i.project_id = e.project_id and i.target_type = 'entity' and i.target_id = e.id and i.applied_at is not null)`)
      .all() as { id: string, project_id: string, portrait_type: string, portrait_at: string | null, updated_at: string, updated_by: string | null, created_by: string | null }[]
    const uploader = db.prepare(`select actor, created_at from audit_events where project_id = ? and target_id = ? and event_type = 'entity.portrait_set' order by rowid desc limit 1`)
    const insert = db.prepare(`insert into images (id, target_type, target_id, prompt, style, model_id, mime, bytes, created_at, created_by, applied_at, project_id, source)
      values (?, 'entity', ?, '', 'none', '', ?, ?, ?, ?, ?, ?, 'upload')`)
    for (const e of orphans) {
      const from = join('.data', 'portraits', e.project_id, e.id)
      if (!existsSync(from)) continue
      const id = newId('img')
      const to = join('.data', 'portraits', e.project_id, id)
      copyFileSync(from, to)
      copies.push(to)
      const by = uploader.get(e.project_id, e.id) as { actor: string, created_at: string } | undefined
      const at = e.portrait_at ?? by?.created_at ?? e.updated_at
      insert.run(id, e.id, e.portrait_type, statSync(from).size, at, by?.actor ?? e.updated_by ?? e.created_by ?? '', at, e.project_id)
    }
    db.exec('pragma user_version = 13')
    db.exec('commit')
  } catch (err) {
    db.exec('rollback')
    for (const f of copies) rmSync(f, { force: true }) // the copies have no rows any more; a retry makes new ones
    throw err
  }
}

// v13 → v14: conflicts gain a severity, projects gain per-rule severity defaults. Existing conflicts get the rule's default
// (the rule table as it was at v14; a travel conflict whose gap was at least half the trip is soft, read from its stored
// rationale). Idempotent: columns are added only if missing. Nothing is dropped.
function migrate13(db: DatabaseSync) {
  const has = (t: string, c: string) => (db.prepare(`pragma table_info(${t})`).all() as { name: string }[]).some(r => r.name === c)
  db.exec('begin')
  try {
    if (!has('conflicts', 'severity')) db.exec(`alter table conflicts add column severity text not null default 'soft'`)
    if (!has('projects', 'severity_defaults')) db.exec(`alter table projects add column severity_defaults text not null default '{}'`)
    db.exec(`update conflicts set severity = case when rule in ('EXACT_TIME_LOCATION_OVERLAP', 'RELATIONSHIP_AFTER_END', 'TRAVEL_TIME_TOO_SHORT') then 'hard' else 'soft' end`)
    const near = db.prepare(`select id, rationale from conflicts where rule = 'TRAVEL_TIME_TOO_SHORT'`).all() as { id: string, rationale: string }[]
    const soften = db.prepare(`update conflicts set severity = 'soft' where id = ?`)
    for (const c of near) {
      // Anchored to the clause scanConflicts writes (lazy, first match), so a quoted statement later in the text cannot
      // supply the numbers. Unparseable text keeps the rule default (hard).
      const m = c.rationale.match(/^.*? has (-?\d+) min to get from .*?, but canon says the trip takes (\d+(?:\.\d+)?) min \("/s)
      if (m && Number(m[1]) >= Number(m[2]) / 2) soften.run(c.id)
    }
    db.exec('pragma user_version = 14')
    db.exec('commit')
  } catch (err) {
    db.exec('rollback')
    throw err
  }
}

// v14 → v15: evidence gains checked_version (a kept outdated citation; null everywhere before). Idempotent; nothing else changes.
function migrate14(db: DatabaseSync) {
  const has = (db.prepare('pragma table_info(evidence)').all() as { name: string }[]).some(r => r.name === 'checked_version')
  db.exec('begin')
  try {
    if (!has) db.exec('alter table evidence add column checked_version integer')
    db.exec('pragma user_version = 15')
    db.exec('commit')
  } catch (err) {
    db.exec('rollback')
    throw err
  }
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`
export const now = () => new Date().toISOString()

// `begin immediate` takes the write lock before fn reads anything, so what fn checks (a type exists, which pages use it) still
// holds when it writes, even with another server process on the same file. Every tx writes, so nothing is serialised needlessly.
export function tx<T>(fn: () => T): T {
  const d = useDb()
  d.exec('begin immediate')
  try {
    const result = fn()
    d.exec('commit')
    return result
  } catch (e) {
    d.exec('rollback')
    throw e
  }
}

// Runs fn and always rolls back: shows exactly what fn would write without writing it. Safe because node:sqlite is
// synchronous, so no other request can run inside the transaction.
export function dryRun<T>(fn: () => T): T {
  const d = useDb()
  d.exec('begin')
  try {
    return fn()
  } finally {
    d.exec('rollback')
  }
}

// The actor is always the signed-in person making the request (set by server/middleware/access.ts).
export function audit(eventType: string, targetType: string, targetId: string, detail: Record<string, unknown> = {}) {
  const { user, project } = access()
  const id = newId('aud')
  useDb().prepare('insert into audit_events values (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, eventType, targetType, targetId, user.id, JSON.stringify(detail), now(), project.id)
  return id
}

// Empties the current project only. Other projects and studios are untouched. audit_events is append-only and stays:
// the caller appends a project.reset event, and events before it whose target was cleared read as removed (listAudit).
export function resetData() {
  tx(() => {
    for (const t of ['research_notes', 'messages', 'conversations', 'document_tags', 'tags', 'folders', 'notes', 'tasks', 'drafts', 'images', 'model_calls', 'eval_runs', 'changes', 'conflicts', 'evidence', 'facts', 'recordings', 'passages', 'documents', 'entities', 'entity_merges'])
      useDb().prepare(`delete from ${t} where project_id = ?`).run(pid())
  })
  rmSync(portraitDir(), { recursive: true, force: true })
  rmSync(join(ORIGINALS_DIR, pid()), { recursive: true, force: true })
  rmSync(recordingDir(), { recursive: true, force: true })
}

// The project's audit trail. Targets of events before the latest project.reset were deleted by that reset (tokens and the
// project itself survive one), so those events carry target_removed instead of pointing at an id that no longer exists.
const SURVIVES_RESET = ['token', 'project', 'audit', 'question', 'user', 'share', 'entity_type']
export function listAudit(order: 'asc' | 'desc') {
  const db = useDb()
  const reset = (db.prepare(`select max(rowid) r from audit_events where project_id = ? and event_type = 'project.reset'`).get(pid()) as { r: number | null }).r ?? 0
  const rows = db.prepare(`select a.rowid seq, a.*, coalesce(u.name, 'Unknown user') actor_name from audit_events a left join users u on u.id = a.actor
    where a.project_id = ? order by a.rowid ${order === 'asc' ? 'asc' : 'desc'}`).all(pid()) as unknown as (AuditRow & { seq: number, actor_name: string })[]
  return rows.map(({ seq, ...r }) => ({ ...r, detail: JSON.parse(r.detail) as Record<string, any>,
    target_removed: seq < reset && !SURVIVES_RESET.includes(r.target_type) }))
}

export interface Fact {
  id: string, kind: string, subject: string, predicate: string, object: string | null, value: string | null, statement: string
  t_from: number | null, t_to: number | null, time_label: string | null, precision: string | null
  status: string, confidence: number | null, origin: string, model_id: string | null, version: number
  supersedes_id: string | null, created_at: string, decided_at: string | null, rationale: string | null, decided_by: string | null, project_id: string
  created_by: string | null
}

export interface DocumentRow {
  id: string, title: string, filename: string, name: string, kind: string, sha256: string, version: number, content: string, imported_at: string
  origin: string, created_by: string | null, folder_id: string | null
}
export interface PassageRow { id: string, document_id: string, ordinal: number, start_line: number, end_line: number, text: string, start_ms?: number | null, end_ms?: number | null, speaker?: string | null }
export interface EvidenceRow {
  // document_filename: the file's own name; document_folder: the folder it is in now (null: the Library root). document_key: the
  // document's identity (documents.filename), for matching only; never shown, since it can carry an older folder.
  id: string, passage_id: string | null, quote: string, verified: number, support: string, document_id: string, document_filename: string
  document_key: string, document_folder: string | null, document_title: string, document_kind: string, document_version: number, latest_version: number, start_line: number | null, end_line: number | null
  start_ms: number | null, end_ms: number | null // a recording transcript's passage: where it plays in the audio
  // Canon only, on a citation of an older version (server/utils/recheck.ts); null otherwise. latest_document_id: the source's
  // latest version; recheck_line: where an unchanged quote now sits in it; recheck_count: how many times the quote appears in
  // it (0 = gone, 2+ = ambiguous, so outdated).
  recheck: RecheckState | null, latest_document_id: string | null, recheck_line: number | null, recheck_count: number | null
}
export interface ConflictRow {
  id: string, left_fact_id: string, right_fact_id: string, rule: string, origin: string, model_id: string | null, rationale: string
  confidence: number, status: string, pair_hash: string, created_at: string, decided_at: string | null, decision_rationale: string | null
  decided_by: string | null, merge_audit_id: string | null, project_id: string, severity: 'hard' | 'soft'
}
export interface ChangeRow {
  id: string, target_fact_id: string, before_statement: string, proposed_statement: string, rationale: string, status: string
  impact: string | null, impact_stale: string | null, new_fact_id: string | null, reverted_fact_id: string | null, created_at: string, decided_at: string | null
  decision_rationale: string | null, reverted_at: string | null, revert_rationale: string | null
  decided_by: string | null, reverted_by: string | null, project_id: string
}
export interface AuditRow { id: string, event_type: string, target_type: string, target_id: string, actor: string, detail: string, created_at: string, project_id: string }
export interface ModelCallRow {
  id: string, purpose: string, model_id: string, prompt_version: string, target_type: string, target_id: string, input_refs: string, input: string | null
  status: string, latency_ms: number, output_summary: string | null, error: string | null, created_at: string
  step: number | null, tool: string | null, tokens: number | null
}

export function getFact(id: string) {
  const fact = useDb().prepare('select * from facts where id = ? and project_id = ?').get(id, pid()) as unknown as Fact | undefined
  if (!fact) throw createError({ statusCode: 404, statusMessage: 'NOT_FOUND', message: `Fact ${id} not found.` })
  return fact
}

// Facts with their evidence resolved to document + line range, for the UI.
// latest_version > document_version means the citation points at an older version of the source (stale).
export const MIN_QUOTE_CHARS = 8
/** The raw quote check on a stored string: non-blank (>= MIN_QUOTE_CHARS non-space chars) and verbatim in a passage. */
export function isVerbatimQuote(text: string, quote: string | null | undefined): boolean {
  return !!quote && quote === quote.trim() && quote.replace(/\s/g, '').length >= MIN_QUOTE_CHARS && text.includes(quote)
}
/** Returns the matched passage and the quote exactly as that passage writes it; callers must store that string, not the input.
 * Matching folds typography (smart quotes, dashes, …, line breaks, Markdown emphasis: see quoteMatches), and the result still
 * passes isVerbatimQuote against the raw passage. A quote must sit inside one passage (a paragraph or heading): one that runs
 * across a blank line is refused, the same as the reader refusing a selection over two passages.
 * `prefer`: the passage the quote was selected in, checked first so a phrase that repeats is cited where it was picked. */
export function findQuotePassage<T extends { text: string, id?: string }>(passages: T[], quote: string | null | undefined, prefer?: string | null): { passage: T, quote: string } | undefined {
  const q = quote?.trim()
  // The minimum counts the submitted words (folded, recomposed to NFC so é / 한 count once), so Markdown marks taken in around a short quote cannot pad it.
  if (!q || foldQuoteText(q).str.normalize('NFC').replace(/\s/g, '').length < MIN_QUOTE_CHARS) return undefined
  // A model quoting part of a sentence tends to capitalise its first letter ("His judgement…" for "…his judgement…") and end it
  // with a full stop ("…does not let go." for "…does not let go, and…"). Only those two may differ, and only when the quote as
  // given is nowhere; the hit is still the source's own characters. A changed edge must sit on a word boundary in the source,
  // so "Pass near the edge." never cites "pass near the edge" inside "compass near the edge".
  const starts = [{ q, start: false }, ...(/^\p{Lu}/u.test(q) ? [{ q: q.charAt(0).toLowerCase() + q.slice(1), start: true }] : [])]
  const tries = [...starts.map(s => ({ ...s, end: false })), ...starts.filter(s => s.q.endsWith('.') && !s.q.endsWith('..')).map(s => ({ q: s.q.slice(0, -1), start: s.start, end: true }))]
  for (const attempt of tries) {
    for (const passage of [...passages.filter(p => prefer && p.id === prefer), ...passages]) {
      const hit = quoteMatches(passage.text, attempt.q, undefined, attempt).find(raw => isVerbatimQuote(passage.text, raw))
      if (hit) return { passage, quote: hit }
    }
  }
}

export function listFacts(where = '1 = 1', ...params: (string | number)[]) {
  const d = useDb()
  const facts = d.prepare(`select f.*, (select name from users u where u.id = f.decided_by) decided_by_name,
      (select name from users u where u.id = f.created_by) created_by_name,
      (select name from api_tokens t where t.id = f.proposed_by_token) agent_name, (select name from users u where u.id = f.proposed_by_user) proposed_by_name from facts f
    where f.project_id = ? and (${where}) order by f.rowid`).all(pid(), ...params) as unknown as (Fact & { decided_by_name: string | null, created_by_name: string | null, agent_name: string | null, proposed_by_name: string | null })[]
  const ev = d.prepare(`
    select e.id, e.passage_id, e.quote, e.verified, e.support, e.document_id, doc.name document_filename, doc.filename document_key, doc.folder_id,
      doc.title document_title, doc.kind document_kind, doc.version document_version, p.start_line, p.end_line, p.start_ms, p.end_ms,
      (select max(d2.version) from documents d2 where d2.filename = doc.filename and d2.project_id = doc.project_id) latest_version
    from evidence e join documents doc on doc.id = e.document_id left join passages p on p.id = e.passage_id
    where e.fact_id = ? order by e.rowid`)
  const folders = new Map<string, string | null>()
  const folderOf = (id: string | null) => {
    if (!id) return null
    if (!folders.has(id)) folders.set(id, folderPath(id))
    return folders.get(id)!
  }
  // Only the listed canon facts are classified, so a page asking for one fact pays for one fact, not the whole project.
  const canonIds = facts.filter(f => f.status === 'canon').map(f => f.id)
  const stale = canonIds.length ? new Map(staleCanonCitations(canonIds).map(c => [c.evidence_id, c])) : new Map<string, StaleCitation>()
  return facts.map((f) => {
    const evidence = (ev.all(f.id) as unknown as (EvidenceRow & { folder_id: string | null })[]).map(({ folder_id, ...e }) => {
      const c = stale.get(e.id)
      return { ...e, document_folder: folderOf(folder_id), recheck: c?.state ?? null, latest_document_id: c?.latest_id ?? null, recheck_line: c?.to?.start_line ?? null, recheck_count: c?.count ?? null } as EvidenceRow
    })
    // A fact needs re-checking when a citation's quote is gone from the latest version (outdated), or only a confirmation when
    // every such quote still reads the same (unchanged). Kept citations need nothing.
    const recheck = evidence.some(e => e.recheck === 'outdated') ? 'outdated' as const : evidence.some(e => e.recheck === 'unchanged') ? 'unchanged' as const : null
    return { ...f, recheck, evidence }
  })
}

export const normEntity = (s: string | null | undefined) => s?.trim().toLowerCase() || null
