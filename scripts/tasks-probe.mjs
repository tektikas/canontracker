// Re-review tasks probe against a running server: node scripts/tasks-probe.mjs [baseUrl]
// Applying the Broken Tide chord-stone change (D1) creates one open task per impacted scene (S04, S07, S09, S10; not S01, S03,
// not dependent facts) carrying the manifest's path, evidence and rationale; tasks can be assigned (studio members only),
// dated and commented; reverting the change marks the unfinished ones "not_needed" and keeps them; another project sees
// nothing and cannot touch them; a viewer reads but cannot write.
import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://localhost:3000'
const run = Date.now().toString(36)

function client() {
  let cookie = ''
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) })
    const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
    if (set.length) cookie = set.join('; ')
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
}
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label} (${JSON.stringify(actual).slice(0, 90)})`) }
async function account(name, project) {
  const c = client()
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { name, email: `${name.toLowerCase()}-${run}@probe.test`, password: 'correct horse' } })).status, 200)
  if (project) {
    const studio = (await c('/api/studios', { method: 'POST', body: { name: `${name} Studio` } })).data
    await c('/api/projects', { method: 'POST', body: { name: project, studio_id: studio.id } })
  }
  return c
}

const a = await account('Ada', 'Broken Tide')
check('demo set loads', (await a('/api/demo/load', { method: 'POST' })).status, 200)
for (const f of (await a('/api/facts?status=pending')).data.filter(f => f.evidence.some(e => e.verified)))
  await a(`/api/facts/${f.id}/review`, { method: 'POST', body: { decision: 'accept' } })
const d1 = (await a('/api/facts?status=canon')).data.find(f => /erases the last hour/.test(f.statement))
assert.ok(d1, 'D1 fact is canon')
const ch = (await a('/api/changes', { method: 'POST', body: { target_fact_id: d1.id, proposed_statement: 'The chord stone erases the last hour only if it is held for ten minutes.', rationale: 'Make the memory rule conditional' } })).data
check('before applying there are no tasks', (await a('/api/tasks')).data, [])

// A viewer reads, never writes.
const link = (await a('/api/team/invites', { method: 'POST', body: { role: 'viewer', days: 1 } })).data
const v = await account('Vic')
await v(`/api/invites/${link.token}/accept`, { method: 'POST' })
await v(`/api/projects/${(await a('/api/me')).data.current.project.id}/switch`, { method: 'POST' })

check('accept & apply', (await a(`/api/changes/${ch.id}/decision`, { method: 'POST', body: { decision: 'accept', rationale: 'Reviewed with the writers' } })).data.status, 'applied')
const tasks = (await a('/api/tasks')).data
const titles = tasks.map(t => t.document_title)
console.log('scenes with tasks:', titles.join(' | '))
const manifest = (await a(`/api/changes/${ch.id}/export?format=json`)).data.items.filter(i => i.target_type === 'scene')
check('one task per impacted scene, same documents', tasks.map(t => t.document_id).sort(), manifest.map(i => i.target_id).sort())
check('four scenes, none of S01 or S03', [tasks.length, tasks.some(t => /^S0[13]\b|Scene 0?[13]\b/.test(t.document_title))], [4, false])
check('all open, unassigned, linked to the change', [...new Set(tasks.map(t => `${t.status}/${t.assignee_id}/${t.change_id === ch.id}`))], [`open/null/true`])
for (const t of tasks) {
  const i = manifest.find(m => m.target_id === t.document_id)
  check(`task ${t.document_title}: path, evidence and rationale copied`, [t.path, t.evidence_ids, t.rationale, !!t.passage_id, !!t.quote], [i.path, i.evidence_ids, i.rationale, true, true])
}
check('stats counts open tasks', (await a('/api/stats')).data.open_tasks, 4)

// Edit: status, assignee (members only), due date, comment.
const t0 = tasks[0]
const me = (await a('/api/me')).data.user
let r = await a(`/api/tasks/${t0.id}`, { method: 'PATCH', body: { status: 'in_progress', assignee_id: me.id, due_date: '2026-11-03', comment: 'Checking the rule wording' } })
check('editor sets status, assignee, due date, comment', [r.status, r.data.status, r.data.assignee_id, r.data.due_date, r.data.comment], [200, 'in_progress', me.id, '2026-11-03', 'Checking the rule wording'])
check('in progress still counts as open', (await a('/api/stats')).data.open_tasks, 4)
check('bad status 400', (await a(`/api/tasks/${t0.id}`, { method: 'PATCH', body: { status: 'not_needed' } })).status, 400)
check('stranger as assignee 400', (await a(`/api/tasks/${t0.id}`, { method: 'PATCH', body: { assignee_id: 'usr_nobody' } })).status, 400)
check('bad date 400', (await a(`/api/tasks/${t0.id}`, { method: 'PATCH', body: { due_date: '3 Nov' } })).status, 400)
check('unknown task 404', (await a('/api/tasks/task_nope', { method: 'PATCH', body: { status: 'done' } })).status, 404)
assert.equal((await a(`/api/tasks/${tasks[1].id}`, { method: 'PATCH', body: { status: 'done' } })).status, 200)
assert.equal((await a(`/api/tasks/${tasks[2].id}`, { method: 'PATCH', body: { status: 'wont_fix' } })).status, 200)
check('stats open tasks after one done, one won’t fix', (await a('/api/stats')).data.open_tasks, 2)

// Viewer.
check('viewer reads the tasks', [(await v('/api/tasks')).status, (await v('/api/tasks')).data.length], [200, 4])
check('viewer cannot change a task: 403', (await v(`/api/tasks/${t0.id}`, { method: 'PATCH', body: { status: 'done' } })).status, 403)

// Isolation: another project has none and cannot reach these.
const b = await account('Bob', 'Other Project')
check('other project sees no tasks', (await b('/api/tasks')).data, [])
check('other project cannot patch: 404', (await b(`/api/tasks/${t0.id}`, { method: 'PATCH', body: { status: 'done' } })).status, 404)
check('other project stats show none', (await b('/api/stats')).data.open_tasks, 0)

// A task assigned to someone who then leaves the studio is flagged as such, not shown as a plain assignee.
const viewerId = (await v('/api/me')).data.user.id
check('assign a done task to the viewer (a member)', (await a(`/api/tasks/${tasks[1].id}`, { method: 'PATCH', body: { assignee_id: viewerId } })).data.assignee_former, 0)
check('member removed', (await a(`/api/team/${viewerId}`, { method: 'DELETE' })).status, 200)
check('former member flagged', (await a('/api/tasks')).data.find(t => t.id === tasks[1].id).assignee_former, 1)

// Revert closes the unfinished tasks, keeps the finished ones and every row.
check('revert', (await a(`/api/changes/${ch.id}/revert`, { method: 'POST', body: { rationale: 'Playtest preferred the old rule' } })).data.status, 'reverted')
const after = (await a('/api/tasks')).data
check('revert keeps every task', after.length, 4)
check('unfinished became not_needed; done and won’t fix stayed', after.map(t => [t.id, t.status]).sort(), [[t0.id, 'not_needed'], [tasks[1].id, 'done'], [tasks[2].id, 'wont_fix'], [tasks[3].id, 'not_needed']].sort())
check('the in-progress task keeps its assignee and comment', [after.find(t => t.id === t0.id).assignee_id, after.find(t => t.id === t0.id).comment], [me.id, 'Checking the rule wording'])
check('a closed task can’t be edited: 409', (await a(`/api/tasks/${t0.id}`, { method: 'PATCH', body: { status: 'open' } })).status, 409)
check('a done task of a reverted change can’t be reopened: 409', (await a(`/api/tasks/${tasks[1].id}`, { method: 'PATCH', body: { status: 'open' } })).status, 409)
check('…but can still be commented on', (await a(`/api/tasks/${tasks[1].id}`, { method: 'PATCH', body: { comment: 'Kept for the record' } })).status, 200)
check('stats open tasks is 0', (await a('/api/stats')).data.open_tasks, 0)

const audit = (await a('/api/audit')).data.map(e => e.event_type)
check('audit has the sentences', ['task.created', 'task.closed', 'task.updated'].map(t => audit.includes(t)), [true, true, true])
console.log('all task probes passed')
