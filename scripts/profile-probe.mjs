// Profile + password probe against a running server: node scripts/profile-probe.mjs [baseUrl]
// Throwaway accounts (unique emails per run). Asserts wrong current password is refused, the new one works,
// email stays unique, another user can't change mine, and the audit trail never holds a password.
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
const check = (label, actual, expected) => { assert.equal(actual, expected, label); console.log(`ok  ${label} (${actual})`) }
const emailOf = n => `${n.toLowerCase()}-${run}@probe.test`
async function account(n) {
  const c = client()
  const r = await c('/api/auth/signup', { method: 'POST', body: { name: n, email: emailOf(n), password: 'correct horse' } })
  check(`signup ${n}`, r.status, 200)
  return c
}

const ada = await account('adaP')
const bob = await account('bobP')
const studio = (await ada('/api/studios', { method: 'POST', body: { name: 'Probe Studio' } })).data
await ada('/api/projects', { method: 'POST', body: { name: 'P', studio_id: studio.id } })

check('signed-out cannot change profile', (await client()('/api/account/profile', { method: 'PATCH', body: { name: 'x', email: 'x@y.zz' } })).status, 401)
check('signed-out cannot change password', (await client()('/api/account/password', { method: 'POST', body: { current: 'a', next: 'bbbbbbbb' } })).status, 401)

// Profile
check('rename works', (await ada('/api/account/profile', { method: 'PATCH', body: { name: 'Ada Q', email: emailOf('adaP') } })).status, 200)
check('/api/me shows new name', (await ada('/api/me')).data.user.name, 'Ada Q')
check('email taken by another user', (await ada('/api/account/profile', { method: 'PATCH', body: { name: 'Ada Q', email: emailOf('bobP').toUpperCase() } })).status, 409)
check('invalid email refused', (await ada('/api/account/profile', { method: 'PATCH', body: { name: 'Ada Q', email: 'nope' } })).status, 400)
check('empty name refused', (await ada('/api/account/profile', { method: 'PATCH', body: { name: ' ', email: emailOf('adaP') } })).status, 400)
check('email change works', (await ada('/api/account/profile', { method: 'PATCH', body: { name: 'Ada Q', email: emailOf('adaNew') } })).status, 200)
check('Bob unchanged by Ada', (await bob('/api/me')).data.user.email, emailOf('bobP'))
// Bob cannot target Ada: the request has no user id, and an injected one is ignored.
const inj = await bob('/api/account/profile', { method: 'PATCH', body: { id: (await ada('/api/me')).data.user.id, name: 'Bob B', email: emailOf('bobP') } })
check('Bob edit applies to Bob only', inj.data.id, (await bob('/api/me')).data.user.id)
check('Ada name untouched by Bob', (await ada('/api/me')).data.user.name, 'Ada Q')

// Password
check('wrong current refused', (await ada('/api/account/password', { method: 'POST', body: { current: 'wrong wrong', next: 'new password 1' } })).status, 403)
check('weak new refused', (await ada('/api/account/password', { method: 'POST', body: { current: 'correct horse', next: 'short' } })).status, 400)
check('same password refused', (await ada('/api/account/password', { method: 'POST', body: { current: 'correct horse', next: 'correct horse' } })).status, 400)
check('password change works', (await ada('/api/account/password', { method: 'POST', body: { current: 'correct horse', next: 'new password 1' } })).status, 200)
check('old password no longer logs in', (await client()('/api/auth/login', { method: 'POST', body: { email: emailOf('adaNew'), password: 'correct horse' } })).status, 401)
check('new password logs in', (await client()('/api/auth/login', { method: 'POST', body: { email: emailOf('adaNew'), password: 'new password 1' } })).status, 200)
check('old email no longer logs in', (await client()('/api/auth/login', { method: 'POST', body: { email: emailOf('adaP'), password: 'new password 1' } })).status, 401)
check('Bob password unchanged', (await client()('/api/auth/login', { method: 'POST', body: { email: emailOf('bobP'), password: 'correct horse' } })).status, 200)

// Audit
const events = (await ada('/api/audit')).data
const types = events.map(e => e.event_type)
assert.ok(types.includes('account.profile_updated') && types.includes('account.password_changed'), `audit has account events: ${types}`)
const dump = JSON.stringify(events)
assert.ok(!dump.includes('correct horse') && !dump.includes('new password 1'), 'no password in audit')
console.log('ok  audit has profile + password events, no password text')
console.log('profile probe passed')
