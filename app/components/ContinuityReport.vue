<script setup lang="ts">
// A continuity check's report (server/utils/continuity.ts): each finding with the sentence it is about, the canon facts it
// contradicts or depends on (with their verified quotes, re-read from canon), the rule checks behind it, and a suggested fix the
// writer may use; nothing is applied. Rule checks are the deterministic engine's own results, shown apart from the AI's findings.
// A check of an imported passage can send a finding that canon doesn't cover yet to Review as a pending candidate (editors+); nothing becomes canon here.
const props = defineProps<{ report: Record<string, any>, compact?: boolean }>()
const editor = computed(() => canEdit(useMe().value))

const KIND = { contradicts: 'Contradicts canon', depends_on: 'Depends on canon', new: 'Not in canon yet' } as const
const SEVERITY = { hard: { tone: 'bad', label: 'Hard' }, soft: { tone: 'warn', label: 'Soft' }, info: { tone: 'neutral', label: 'Note' } } as const
const findings = computed(() => props.report.findings as Record<string, any>[])
const counts = computed(() => (['contradicts', 'depends_on', 'new'] as const).map(k => [k, findings.value.filter(f => f.kind === k).length] as const).filter(([, n]) => n))
const countLabel = (k: keyof typeof KIND, n: number) => (k === 'contradicts' ? `${n} contradiction${n === 1 ? '' : 's'}` : k === 'depends_on' ? `${n} depend${n === 1 ? 's' : ''} on canon` : `${n} new`)
const fact = (id: string) => props.report.facts[id]
const rulesOf = (f: Record<string, any>) => [...new Set<string>(f.checks.map((k: number) => props.report.checks[k].rule))]
const side = (s: Record<string, any>) => (s.fact_id ? fact(s.fact_id)?.statement ?? s.statement : s.statement)

// Send to review: the finding's sentence is the quote (it is in the checked passage), the AI's reading of it the fact.
const sent = ref<Record<number, string>>({})
const sending = ref<number | null>(null)
const error = ref<Record<number, string>>({})
const alreadySent = (f: Record<string, any>) => props.report.candidates.some((c: Record<string, any>) => c.statement === f.claim?.statement)
async function propose(i: number, f: Record<string, any>) {
  sending.value = i
  error.value[i] = ''
  try {
    const c = f.claim
    await $fetch('/api/facts', { method: 'POST', body: {
      to: 'review', continuity_id: props.report.id, document_id: props.report.document_id, passage_id: props.report.passage_id, quote: f.sentence,
      kind: c.kind, subject: c.subject, predicate: c.predicate, object: c.object, time_from: c.time_from, time_to: c.time_to, statement: c.statement,
    } })
    sent.value[i] = c.statement
    refreshNuxtData('stats')
  } catch (e) {
    error.value[i] = errorMessage(e)
  } finally {
    sending.value = null
  }
}
</script>

<template>
  <div class="report" :class="{ compact }">
    <div class="report-head">
      <span class="report-label"><UiIcon name="conflicts" :size="14" />Continuity check</span>
      <span class="row counts">
        <UiBadge v-for="[k, n] in counts" :key="k" :tone="k === 'contradicts' ? 'bad' : k === 'new' ? 'pencil' : 'accent'">{{ countLabel(k, n) }}</UiBadge>
      </span>
    </div>
    <p v-if="report.summary" class="summary">{{ report.summary }}</p>
    <p v-if="!findings.length && !report.checks.length" class="notice info">No continuity problem found against accepted canon. That isn’t proof: only what canon covers was checked.</p>

    <ol v-if="findings.length" class="findings">
      <li v-for="(f, i) in findings" :key="i" class="finding" :class="f.kind">
        <div class="row">
          <UiBadge :tone="SEVERITY[f.severity as keyof typeof SEVERITY].tone" dot>{{ SEVERITY[f.severity as keyof typeof SEVERITY].label }}</UiBadge>
          <span class="kind">{{ KIND[f.kind as keyof typeof KIND] }}</span>
          <UiBadge v-for="rule in rulesOf(f)" :key="rule" class="rule-badge" :tone="f.severity === 'hard' ? 'bad' : 'warn'" title="Found by the rule engine (deterministic), not by the AI">Rule: {{ CONFLICT_RULE_LABEL[rule] ?? rule }}</UiBadge>
        </div>
        <blockquote class="sentence">{{ f.sentence }}</blockquote>
        <p v-if="f.explanation" class="why">{{ f.explanation }}</p>
        <details v-if="f.fact_ids.length" class="cites" :open="!compact && f.kind === 'contradicts'">
          <summary class="small">Canon {{ f.kind === 'contradicts' ? 'it contradicts' : 'it rests on' }} <span class="faint">{{ f.fact_ids.length }}</span></summary>
          <div v-for="id in f.fact_ids" :key="id" class="cited-fact">
            <UiBadge v-if="fact(id) && fact(id).status !== 'canon'" tone="warn" title="This fact was canon when the check ran.">No longer canon ({{ fact(id).status }})</UiBadge>
            <FactSummary v-if="fact(id)" :fact="fact(id)" sources />
          </div>
        </details>
        <div v-if="f.fix" class="fix">
          <span class="fix-label small">Suggested fix · not applied</span>
          <p>{{ f.fix }}</p>
        </div>
        <template v-if="report.can_propose && editor && f.claim && f.kind === 'new'">
          <p v-if="sent[i] || alreadySent(f)" class="small muted sent"><UiIcon name="check" :size="14" />Sent to <NuxtLink to="/review">Review</NuxtLink> as a candidate.</p>
          <div v-else class="row">
            <UiButton size="sm" variant="ghost" icon="review" :loading="sending === i" :title="`Add “${f.claim.statement}” to the review queue; it becomes canon only when someone accepts it.`" @click="propose(i, f)">Send to review</UiButton>
            <span v-if="error[i]" class="small bad" role="alert">{{ error[i] }}</span>
          </div>
        </template>
      </li>
    </ol>

    <section v-if="report.checks.length" class="checks" aria-label="Rule checks">
      <h3 class="small">Rule checks <span class="faint">· rule engine, not AI</span></h3>
      <div v-for="(c, i) in report.checks" :key="i" class="check">
        <div class="row">
          <UiBadge :tone="c.severity === 'hard' ? 'bad' : 'warn'" dot>{{ c.severity === 'hard' ? 'Hard' : 'Soft' }}</UiBadge>
          <b class="small">{{ CONFLICT_RULE_LABEL[c.rule] ?? c.rule }}</b>
          <span v-if="c.confidence != null && c.confidence < 1" class="small faint">{{ Math.round(c.confidence * 100) }}% confidence</span>
        </div>
        <p class="small rationale">{{ c.rationale }}</p>
        <ul class="small sides">
          <li v-for="s in [c.left, c.right]" :key="JSON.stringify(s)"><span class="faint">{{ s.fact_id ? 'Canon:' : 'Your text, as the AI read it:' }}</span> {{ side(s) }}<span v-if="s.time" class="faint"> ({{ s.time }})</span></li>
        </ul>
      </div>
    </section>

    <details v-if="report.dropped.length" class="dropped small">
      <summary>{{ report.dropped.length }} AI result{{ report.dropped.length === 1 ? '' : 's' }} left out</summary>
      <p class="muted">Each finding must quote the checked text and cite only accepted canon; each rule hit must be about one of those sentences. These weren’t:</p>
      <ul><li v-for="(d, i) in report.dropped" :key="i">“{{ d.sentence }}” — {{ d.reason }}</li></ul>
    </details>

    <p class="small faint foot">
      AI checked {{ report.source === 'passage' && report.document_title ? `“${report.document_title}”, line ${report.start_line}${report.end_line !== report.start_line ? `–${report.end_line}` : ''}` : report.source === 'draft' ? 'your draft (only you see this check)' : 'this text' }}
      against accepted canon · <NuxtLink :to="`/agents/runs?run=${report.id}`">How was this made?</NuxtLink>
    </p>
  </div>
</template>

<style scoped>
.report { display: grid; gap: var(--s-3); min-width: 0; }
.report-head { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; justify-content: space-between; }
.report-label { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; color: var(--accent); }
.counts { gap: 6px; }
.summary { margin: 0; }
.findings { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
.finding { display: grid; gap: var(--s-2); padding: var(--s-3); border: 1px solid var(--line); border-left: 3px solid var(--line-strong); border-radius: var(--r-md); background: var(--raised); min-width: 0; }
.finding.contradicts { border-left-color: var(--bad); }
.finding.new { border-left-color: var(--pencil, var(--line-strong)); }
.finding .row { gap: 6px; align-items: center; }
.kind { font-weight: 600; font-size: var(--text-sm); }
.rule-badge { white-space: normal; max-width: 100%; }
.sentence { margin: 0; padding-left: var(--s-3); border-left: 2px solid var(--line); font-family: var(--font-story); overflow-wrap: anywhere; }
.why, .fix p { margin: 0; overflow-wrap: anywhere; }
.cites summary { cursor: pointer; font-weight: 600; color: var(--muted); }
.cited-fact { display: grid; gap: 6px; padding: var(--s-3); margin-top: var(--s-2); border-radius: var(--r-md); background: var(--sunken); }
.fix { display: grid; gap: 2px; padding: var(--s-2) var(--s-3); border: 1px dashed var(--line-strong); border-radius: var(--r-md); }
.fix-label { font-weight: 600; color: var(--muted); }
.sent { display: inline-flex; align-items: center; gap: 4px; margin: 0; }
.checks { display: grid; gap: var(--s-2); }
.checks h3 { margin: 0; font-weight: 700; }
.check { display: grid; gap: 4px; padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: var(--sunken); min-width: 0; }
.check .row { gap: 6px; align-items: center; }
.rationale { margin: 0; overflow-wrap: anywhere; }
.sides { margin: 0; padding-left: var(--s-4); overflow-wrap: anywhere; }
.dropped summary { cursor: pointer; color: var(--muted); }
.dropped ul { margin: 0; padding-left: var(--s-4); }
.foot { margin: 0; }
.bad { color: var(--bad); }
.compact .finding { padding: var(--s-2) var(--s-3); }
</style>
