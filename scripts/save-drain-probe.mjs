// Save-drain probe for the writer: node scripts/save-drain-probe.mjs [baseUrl]
// Runs the <script setup> logic of app/pages/write.vue (transpiled, with Vue and a few Nuxt seams) against a real draft on
// a running dev server, holding and failing chosen PUTs. Checks that leaving waits for the whole save drain — including a
// follow-up save for words typed while the first request ran — and asks before losing text when any save in it fails.
// Logic only: no browser, no DOM rendering.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const base = process.argv[2] ?? 'http://localhost:3000'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
const vue = require('vue')

let cookie = ''
async function api(path, opts = {}) {
  const res = await fetch(base + path, { method: opts.method ?? 'GET', headers: { cookie, 'content-type': 'application/json' }, body: opts.body && JSON.stringify(opts.body) })
  const set = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(c => c.includes('='))
  if (set.length) cookie = set.join('; ')
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? res.statusText)
  return data
}
const check = (label, actual, expected) => { assert.equal(actual, expected, label); console.log(`ok  ${label} (${actual})`) }
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j }); return { promise, resolve, reject } }
const tick = () => new Promise(r => setTimeout(r, 0))

await api('/api/auth/signup', { method: 'POST', body: { name: 'Drain', email: `drain-${Date.now().toString(36)}@probe.test`, password: 'correct horse' } })
const studio = await api('/api/studios', { method: 'POST', body: { name: 'Drain Studio' } })
await api('/api/projects', { method: 'POST', body: { studio_id: studio.id, name: 'Drain' } })
const draft = await api('/api/drafts', { method: 'POST', body: { title: 'Harbor', kind: 'scene', content: 'Saved text.' } })
const me = await api('/api/me')

// Transport seam: each PUT can be held (gate) and then passed through or failed.
let gates = []
let puts = 0
let confirms = 0
let answer = false
let guard
const ctx = {
  ...vue, console, setTimeout, clearTimeout, requestAnimationFrame: fn => setTimeout(fn, 0),
  useHead() {}, useRoute: () => ({ query: {} }), useRouter: () => ({ replace() {} }), useMe: () => vue.ref(me), canEdit: () => true,
  onMounted() {}, onBeforeUnmount() {}, onBeforeRouteLeave(fn) { guard = fn }, askConfirm: async () => { confirms++; return answer },
  errorMessage: e => e.message, navigateTo() {}, refreshNuxtData() {},
  useChat: () => vue.ref({ tick: 0, dock: null }), useChatDock() {}, useChatContext() {}, openChat() {}, // the chat panel: not under test
  localStorage: { getItem: () => null, setItem() {} },
  document: { fullscreenElement: null, addEventListener() {}, removeEventListener() {} },
  window: { addEventListener() {}, removeEventListener() {}, visualViewport: null },
  async $fetch(path, opts) {
    if (opts?.method === 'PUT') {
      puts++
      const g = gates.shift()
      if (g) { g.started.resolve(); await g.release.promise }
    }
    return api(path, opts)
  },
}
vm.createContext(ctx)
const source = readFileSync(new URL('../app/pages/write.vue', import.meta.url), 'utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
const expose = `\nObject.assign(f, initial); draftId.value = initialId; loading.value = false;
globalThis.h = { f, focus, exitFocus, persist, get dirty() { return dirty }, get drain() { return drain }, get status() { return status.value } };`
Object.assign(ctx, { initial: { title: draft.title, kind: draft.kind, content: draft.content }, initialId: draft.id })
vm.runInContext(ts.transpileModule(source + expose, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, ctx)
await vue.nextTick()
const h = ctx.h
const gate = () => { const g = { started: deferred(), release: deferred() }; gates.push(g); return g }
const stored = async () => (await api(`/api/drafts/${draft.id}`)).content
async function type(text) {
  h.f.content = text
  await vue.nextTick()
}

// 1. Leaving while a save runs and more words were typed meanwhile: the guard waits for the follow-up save too.
{
  const first = gate(), second = gate()
  await type('First revision.')
  h.persist().catch(() => {}) // the autosave (as the timer, Ctrl+S or leaving focus start it), without the 700 ms wait
  await first.started.promise
  await type('Latest words, typed while the first save ran.')
  const leaving = guard()
  let done = false
  leaving.then(() => { done = true })
  first.release.resolve()
  await second.started.promise
  await tick()
  check('guard still waiting while the follow-up save runs', done, false)
  second.release.resolve()
  check('guard lets navigation through once all is saved', await leaving, undefined)
  check('the stored draft is the latest text', await stored(), h.f.content)
  check('no confirm when nothing was lost', confirms, 0)
}

// 2. Same, but the follow-up save fails: the guard asks, and "stay" blocks navigation with the text kept on screen.
{
  const first = gate(), second = gate()
  await type('Second round, first save.')
  h.persist().catch(() => {})
  await first.started.promise
  await type('Second round, words that will fail to save.')
  const leaving = guard()
  first.release.resolve()
  await second.started.promise
  second.release.reject(new Error('Injected network failure'))
  answer = false
  check('a failed follow-up save blocks leaving', await leaving, false)
  check('…after one confirm', confirms, 1)
  check('…with the text still marked unsaved', h.dirty, true)
  check('…and the status line showing the error', h.status, 'error')
  check('…and the words on screen', h.f.content, 'Second round, words that will fail to save.')
  answer = true
  check('the next leave retries and goes through once saved', await guard(), undefined)
  check('…storing the latest text', await stored(), h.f.content)
}

// 3. Exiting focus mode drains in the background: focus closes at once, the drain still ends with the latest text stored.
{
  const first = gate()
  h.focus.value = true
  await type('Focus words.')
  h.exitFocus()
  check('focus mode closes immediately', h.focus.value, false)
  await first.started.promise
  await type('Focus words, and a few more.')
  first.release.resolve()
  await h.drain
  await tick()
  if (h.drain) await h.drain
  check('focus exit drain stores the latest text', await stored(), h.f.content)
  check('…and nothing is left unsaved', h.dirty, false)
}
// 4. Recovery: a persist() with nothing unsaved (a clean draft, a "Save as v2" that failed elsewhere) must not leave a finished
// drain behind; the next typing still saves, and leaving afterwards does not lose text.
{
  await h.persist() // nothing dirty: resolves at once
  check('no drain is retained after a no-op persist', h.drain, null)
  const before = puts
  await type('Typed after a no-op persist.')
  await h.persist()
  check('typing after a no-op persist issues a PUT', puts, before + 1)
  check('…and stores the text', await stored(), h.f.content)
  const fail = gate()
  await type('Typed, then the save fails.')
  const p = h.persist().catch(() => 'failed')
  await fail.started.promise
  fail.release.reject(new Error('503'))
  check('a failed save rejects', await p, 'failed')
  check('…and no drain is retained', h.drain, null)
  await type('Typed after recovery.')
  const n = puts
  await h.persist()
  check('the save after a failure issues a PUT', puts, n + 1)
  check('…and stores the text', await stored(), h.f.content)
  check('…leaving is silent with nothing lost', await guard(), undefined)
}
console.log(`all checks passed (${puts} PUTs; write.vue logic in a VM seam, real draft API, no browser)`)
