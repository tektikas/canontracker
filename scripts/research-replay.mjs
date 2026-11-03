// Runs the real Research agent loop (server/utils/agent.ts runAgent) against responses Meta really returned, replayed by
// scripts/meta-fake.mjs. No app server: the loop is imported directly, with Nitro's globals replaced by plain stand-ins
// ($fetch → fetch, model_calls rows kept in memory). The function tool is fall_time, the one the recordings were made with.
//   node scripts/meta-fake.mjs 4281
//   node scripts/research-replay.mjs http://localhost:4281
// Checks: commentary-phase messages never reach the answer, an opened page (open_page) is a candidate source and not a
// search, max_tool_calls leaves room for calculators so one is still called when one search remains, search results are in
// the trace, every request key was accepted by Meta on /responses, and a refused request fails once (no hidden retries).
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const fake = process.argv[2] ?? 'http://localhost:4281'
const dir = new URL('../server/assets/meta-fixtures/', import.meta.url)
const fixtures = Object.fromEntries(readdirSync(dir).map(f => [f.slice(0, -5), JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]))
const accepted = new Set(Object.values(fixtures).filter(f => f.status < 300 && f.request.path === '/responses' && f.request.body).flatMap(f => Object.keys(f.request.body)))
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); console.log(`ok  ${label}`) }

const rows = []
let baseUrl = `${fake}/v1`
Object.assign(globalThis, {
  useRuntimeConfig: () => ({ metaBaseUrl: baseUrl, modelId: 'muse-spark-1.3', metaApiKey: 'fixture', modelMode: 'meta' }),
  useDb: () => ({ prepare: () => ({ run: (...a) => rows.push({ purpose: a[1], status: a[7], summary: a[9], error: a[10], step: a[13], tool: a[14] }) }) }),
  newId: p => `${p}_${rows.length}`,
  now: () => new Date().toISOString(),
  createError: o => Object.assign(new Error(o.message), o),
  $fetch: async (url, o = {}) => {
    const res = await fetch(url, { method: o.method ?? 'GET', headers: { 'content-type': 'application/json', ...o.headers }, body: o.body && JSON.stringify(o.body) })
    const data = await res.json()
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { statusCode: res.status, data })
    return data
  },
})
Object.assign(globalThis, await import('../server/utils/model.ts')) // apiKey, apiFailure, PROMPT_VERSIONS as the app has them
const { runAgent, EFFORT } = await import('../server/utils/agent.ts')

const fallTime = {
  name: 'fall_time', description: 'Seconds for an object to fall from a height in metres (no air resistance).',
  parameters: { type: 'object', properties: { height_m: { type: 'number' } }, required: ['height_m'], additionalProperties: false },
  run: ({ height_m }) => ({ result: { seconds: Math.round(Math.sqrt(2 * height_m / 9.80665) * 100) / 100 }, assumptions: ['no air resistance', 'g = 9.80665 m/s²'] }),
}
const agent = () => runAgent({ purpose: 'research', target: { type: 'research', id: 'rn_replay' }, projectId: 'p_replay', instructions: 'Research.', input: 'How long does a fall from the tower take?', tools: [fallTime], webSearch: true, effort: 'low' })
const queue = names => fetch(`${fake}/_queue`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fixtures: names }) }).then(r => r.json())
async function sent(label, n) {
  const { requests, queued } = await fetch(`${fake}/_requests`).then(r => r.json())
  check(`${label}: ${n} request(s) to /v1/responses, queue drained`, { n: requests.length, paths: [...new Set(requests.map(r => r.path))], queued }, { n, paths: ['/v1/responses'], queued: [] })
  for (const r of requests) {
    assert.ok(r.bearer, `${label}: Bearer key sent`)
    check(`${label}: keys ${Object.keys(r.body).join(', ')} all accepted by Meta`, Object.keys(r.body).filter(k => !accepted.has(k)), [])
  }
  return requests.map(r => r.body)
}
const commentary = name => fixtures[name].body.output.filter(i => i.phase === 'commentary').map(i => i.content[0].text)
await fetch(`${fake}/_requests`) // start clean

// 1. Search + function in one response, then a function call while one search is left, then the answer. The search budget
// is set to 2 so the one recorded search leaves exactly one (the case where max_tool_calls = searches left starved the
// calculator: agent-stateless-search-turn1 spent max_tool_calls 2 on search + open_page and refused fall_time).
EFFORT.low.maxSearches = 2
await queue(['responses-search-and-function-turn1', 'agent-stateless-search-turn2', 'responses-search-and-function-turn2'])
let run = await agent()
let req = await sent('search → calculator → answer', 3)
check('max_tool_calls per step: searches left + calculator allowance', req.map(b => b.max_tool_calls), [2 + EFFORT.low.calcsPerStep, 1 + EFFORT.low.calcsPerStep, 1 + EFFORT.low.calcsPerStep])
check('tools on every step: web_search (budget left) and the calculator', req.map(b => b.tools.map(t => t.name ?? t.type)), Array(3).fill(['web_search', 'fall_time']))
check('include asks for search results and encrypted reasoning', req[0].include, ['reasoning.encrypted_content', 'web_search_call.results'])
check('calculator still called when one search remains', run.toolCalls.map(c => [c.name, c.args.height_m, c.result.seconds, c.error]), [['fall_time', 330, 8.2, null], ['fall_time', 96, 4.42, null]])
check('search results are not sent back', req[1].input.filter(i => i.type === 'web_search_call').map(i => 'results' in i), [false])
check('last step asks for the answer', req[2].input.at(-1), { role: 'user', content: 'Step limit reached: give your final answer now, without calling more tools.' })
check('answer is the final message only', run.text, fixtures['responses-search-and-function-turn2'].body.output.at(-1).content[0].text.trim())
for (const c of [...commentary('responses-search-and-function-turn1'), ...commentary('agent-stateless-search-turn2')]) assert.ok(!run.text.includes(c), `no commentary in the answer: ${c}`)
console.log('ok  no commentary text in the answer')
check('searches', run.searches, ['Eiffel Tower height in metres'])
assert.match(rows[0].summary, /^1 web search: Eiffel Tower height in metres; 11 results: Eiffel Tower <https:\/\/en\.wikipedia\.org\/wiki\/Eiffel_Tower> \| /)
console.log('ok  trace step 0 lists the search results (titles and URLs)')
check('trace: steps and tools', rows.map(r => [r.step, r.tool, r.status]), [[0, 'web_search', 'ok'], [0, 'fall_time', 'ok'], [1, null, 'ok'], [1, 'fall_time', 'ok'], [2, null, 'ok']])

// 2. A search, an opened page and two commentary messages, then the answer (the recorded c54 request shape).
rows.length = 0
await queue(['agent-stateless-search-turn1'])
run = await agent()
await sent('search + open_page → answer', 1)
check('answer is the final message only', run.text, fixtures['agent-stateless-search-turn1'].body.output.at(-1).content[0].text.trim())
for (const c of commentary('agent-stateless-search-turn1')) assert.ok(!run.text.includes(c), `no commentary in the answer: ${c}`)
console.log('ok  no commentary text in the answer')
check('opened page is a candidate source', run.citations[0], { url: 'https://en.wikipedia.org/wiki/Big_ben', title: '' })
check('open_page is not a search', run.searches, ['Big Ben tower height metres'])
check('trace says which page was opened', rows[0].summary, '1 web search: Big Ben tower height metres; opened 1 page: https://en.wikipedia.org/wiki/Big_ben; answered')

// 3. A refused request (Meta's real 400) fails once with Meta's message: no retry without max_tool_calls, no split retry.
rows.length = 0
await queue(['error-responses-bad-combo'])
await assert.rejects(agent(), e => /^Research failed: AI provider error 400 — `reasoning\.encrypted_content` cannot be used with `previous_response_id`\. Nothing was stored\.$/.test(e.message))
console.log('ok  a real 400 is shown as is')
await sent('refused request', 1)
check('one failed trace row', rows.map(r => [r.step, r.status]), [[0, 'failed']])

// 4. A 400 that names max_tool_calls (the shape the OmniRoute test proxy returns; no network here, $fetch is stubbed): from
// api.meta.ai it fails once; only another gateway gets one retry without max_tool_calls, and later requests leave it out.
const realFetch = globalThis.$fetch
const bodies = []
globalThis.$fetch = async (url, o) => {
  bodies.push(o.body)
  throw Object.assign(new Error('HTTP 400'), { statusCode: 400, data: { error: { message: 'Unsupported parameter: max_tool_calls', type: 'invalid_request_error' } } })
}
baseUrl = 'https://api.meta.ai/v1'
await assert.rejects(agent(), /AI provider error 400/)
check('api.meta.ai: a 400 naming max_tool_calls is not retried', bodies.map(b => 'max_tool_calls' in b), [true])
bodies.length = 0
baseUrl = 'https://omniroute.example/v1'
await assert.rejects(agent(), /error 400/)
check('another gateway: one retry without max_tool_calls', bodies.map(b => 'max_tool_calls' in b), [true, false])
bodies.length = 0
await assert.rejects(agent())
check('…and it is left out from then on', bodies.map(b => 'max_tool_calls' in b), [false])
globalThis.$fetch = realFetch
baseUrl = `${fake}/v1`

console.log('\nall research replay checks passed')
