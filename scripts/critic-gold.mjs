// The AI critic's quality gate on a sample's planted beats (server/assets/<set>/gold.json), given the pending list as
// GET /api/facts?status=pending returns it: every planted verified fact (any gold statement that is a verified candidate) has
// a current "keep"; every figurative one has "reject"; every hallucinated one is blocked and has no opinion. Used by
// critic-probe.mjs on the shipped recordings and by critic-live.mjs (a live run passes it before it may be recorded).
import { readFileSync } from 'node:fs'

export function goldCheck(set, facts) {
  const gold = JSON.parse(readFileSync(new URL(`../server/assets/${set}/gold.json`, import.meta.url), 'utf8'))
  const strings = new Set()
  const walk = v => (typeof v === 'string' ? strings.add(v) : v && typeof v === 'object' && Object.values(v).forEach(walk))
  walk(gold)
  const special = new Set([...gold.figurative, ...gold.hallucinated])
  const verified = f => f.evidence.some(e => e.verified)
  const said = f => (f?.critic ? `${f.critic.verdict}/${f.critic.reason}${f.critic.current ? '' : ' (not current)'}: ${f.critic.explanation}` : 'no opinion')
  const find = s => facts.find(f => f.statement === s)
  const planted = facts.filter(f => strings.has(f.statement) && !special.has(f.statement) && verified(f))
  const problems = [
    ...planted.filter(f => !(f.critic?.verdict === 'keep' && f.critic.current)).map(f => `planted fact not kept: "${f.statement}" — ${said(f)}`),
    ...gold.figurative.filter(s => !(find(s)?.critic?.verdict === 'reject' && find(s).critic.current)).map(s => `figurative not rejected: "${s}" — ${said(find(s))}`),
    ...gold.hallucinated.filter(s => !find(s) || verified(find(s)) || find(s).critic).map(s => `hallucinated not blocked or has an opinion: "${s}" — ${said(find(s))}`),
  ]
  return { planted: planted.length, figurative: gold.figurative.map(s => `"${s}": ${said(find(s))}`), problems }
}
